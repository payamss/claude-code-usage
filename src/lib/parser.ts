import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { costOf, emptyUsage, addUsage, type Usage } from './pricing';
import { analyzeConversation, mergeBuckets, type Analysis, type Bucket, type HeavyItem } from './analyze';

export const CACHE_VERSION = 10;

// Output tokens per written character (text + tool input) and per character of a thinking block's
// signature (thinking text itself is redacted). Fitted on complete messages: within ~2% in aggregate.
const OUT_PER_CHAR = 0.4;
const OUT_PER_SIG_CHAR = 0.28;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Turn extends Usage {
  ts: string;
  model: string;
  think: number;
  effort: string | null;
  outChars: number;
  promptChars: number;
  sysChars: number;
  tools: number[];
}

export interface ToolUse {
  call: number;
  id: string | null;
  name: string;
  key: string;
  label: string;
  inChars: number;
  resChars: number;
  pseudo?: boolean;
}

export interface Prompt { ts: string; text: string }

export interface CostState {
  totalCostUSD: number;
  totalAPIDuration: number;
  totalToolDuration: number;
  totalDuration: number;
  startTime: number | null; // when the process that wrote it started; after a resume it only covers that run
  totalLinesAdded: number;
  totalLinesRemoved: number;
  modelUsage: Record<string, unknown>;
}

export interface FileData {
  turns: Turn[];
  tools: ToolUse[];
  prompts: Prompt[];
  commands: Record<string, number>;
  title: string | null;
  customTitle: string | null;
  agentName: string | null;
  cwd: string | null;
  version: string | null;
  gitBranch: string | null;
  firstTs: string | null;
  lastTs: string | null;
  costState: CostState | null;
  apiDurationMs: number;
  toolCalls: number;
  stopReasons: Record<string, number>;
}

export interface SubagentMeta { agentType?: string; description?: string; [k: string]: unknown }

export interface SessionTurn extends Turn { sub: boolean; cost: number; toolN: number } // toolN: real tool calls (no pseudo entries)

export interface SubRun {
  type: string;
  description?: string;
  cost: number;
  calls: number;
  tokens: number;
  buckets: Record<string, Bucket>;
  heavy: HeavyItem[];
}

export interface SessionAnalysis {
  buckets: Record<string, Bucket>;
  calls: Analysis['calls'];
  heavy: HeavyItem[];
  startupTokens: number;
  avgCtx: number;
  peakCtx: number;
  resets: number;
  misses: number;
  missCost: number;
  crCost: number;
  subRuns: SubRun[];
}

export interface Session {
  id: string;
  projectDir: string;
  projectKey: string;
  cwd: string;
  title: string;
  agentName: string | null;
  version: string | null;
  gitBranch: string | null;
  archived: boolean;
  firstTs: string | null;
  lastTs: string | null;
  wallMs: number;
  apiMs: number;
  prompts: number;
  promptList: Prompt[];
  commands: Record<string, number>;
  turns: number;
  toolCalls: number;
  subagents: number;
  models: string[];
  byModel: Record<string, Usage & { cost: number; turns: number }>;
  usage: Usage;
  cost: number;
  think: number;
  efforts: Record<string, number>;
  unknownModel: boolean;
  reported: number | null;
  reportedTo: number | null; // Claude Code's total covers calls up to this time (ms); null = the whole session
  linesAdded: number | null;
  linesRemoved: number | null;
  stopReasons: Record<string, number>;
  turnList: SessionTurn[];
  analysis: SessionAnalysis;
}

// ---------------------------------------------------------------------------
// Per-file parsing
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

function usageFromApi(u: Json): Usage {
  const cw5 = u.cache_creation && u.cache_creation.ephemeral_5m_input_tokens != null
    ? u.cache_creation.ephemeral_5m_input_tokens
    : (u.cache_creation_input_tokens || 0);
  const cw1 = u.cache_creation ? (u.cache_creation.ephemeral_1h_input_tokens || 0) : 0;
  return { input: u.input_tokens || 0, output: u.output_tokens || 0, cw5, cw1, cr: u.cache_read_input_tokens || 0 };
}

function promptText(content: Json): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const tx = content.find((b) => b && b.type === 'text' && typeof b.text === 'string');
    return tx ? tx.text : null;
  }
  return null;
}

function isHumanPrompt(o: Json): boolean {
  if (o.isMeta) return false;
  // newer versions tag the origin: human / peer (subagent hand-back) / task-notification
  if (o.origin && o.origin.kind) return o.origin.kind === 'human';
  const c = o.message && o.message.content;
  if (Array.isArray(c) && c.some((b: Json) => b && b.type === 'tool_result')) return false;
  const text = promptText(c);
  if (!text) return false;
  // older versions: injected messages start with a harness tag; pasted content is still human
  if (/^<(local-command|command-name|command-message|system-reminder|task-notification|bash-)/.test(text.trim())) return false;
  return true;
}

// Approximate character weight of non-text blocks so they don't dominate calibration.
const IMAGE_CHARS = 6000;

function blockChars(b: Json): number {
  if (!b) return 0;
  if (typeof b === 'string') return b.length;
  if (b.type === 'image' || b.type === 'document') return IMAGE_CHARS;
  if (b.type === 'text' || b.type === 'thinking') return (b.text || b.thinking || '').length;
  if (b.type === 'tool_use') return JSON.stringify(b.input || {}).length + 40;
  if (b.type === 'tool_result') return contentChars(b.content);
  return JSON.stringify(b).length;
}
function contentChars(c: Json): number {
  if (c == null) return 0;
  if (typeof c === 'string') return c.length;
  if (Array.isArray(c)) return c.reduce((a: number, b: Json) => a + blockChars(b), 0);
  return JSON.stringify(c).length;
}

/** Which bucket a tool_use belongs to: [key, label] */
export function toolKey(name: string, input: Json): [string, string] {
  input = input || {};
  if (name === 'Skill') return ['skill:' + (input.skill || '?'), 'Skill /' + (input.skill || '?')];
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (m) return ['mcp:' + m[1], 'MCP ' + m[1]];
  if (name === 'Agent' || name === 'Task') return ['agent:' + (input.subagent_type || 'general-purpose'), 'Subagent ' + (input.subagent_type || 'general-purpose') + ' (hand-back into main context)'];
  if (name === 'Workflow') return ['workflow', 'Workflow'];
  if (name === 'Bash' || name === 'PowerShell') return ['tool:Shell', 'Shell (Bash / PowerShell)'];
  if (name === 'Read') return ['tool:Read', 'Read files'];
  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit' || name === 'MultiEdit') return ['tool:Edit', 'Edit / Write files'];
  if (name === 'Grep' || name === 'Glob' || name === 'LSP') return ['tool:Search', 'Grep / Glob / LSP'];
  if (name === 'WebFetch' || name === 'WebSearch') return ['tool:Web', 'WebFetch / WebSearch'];
  if (name === 'Artifact' || name === 'ArtifactData' || name === 'ArtifactComments') return ['tool:Artifact', 'Artifact'];
  if (name === 'ToolSearch') return ['tool:ToolSearch', 'ToolSearch (deferred tool loading)'];
  if (name === 'SubagentHandback' || name === 'TaskOutput' || name === 'TaskStop' || name === 'SendMessage' || name === 'ListAgents') return ['agent:coordination', 'Subagent coordination'];
  return ['tool:' + name, name];
}

/** Parses one JSONL transcript (main session or subagent) and returns the raw facts. */
export async function parseFile(file: string, isSubagent: boolean): Promise<FileData> {
  const r: FileData = {
    turns: [], tools: [], prompts: [], commands: {},
    title: null, customTitle: null, agentName: null, cwd: null, version: null, gitBranch: null,
    firstTs: null, lastTs: null, costState: null, apiDurationMs: 0, toolCalls: 0, stopReasons: {},
  };
  const turnByMsg = new Map<string, number>();   // message.id -> turn index
  const stopByMsg = new Map<string, string>();   // message.id -> stop_reason of its last line
  const estByTurn: { vis: number; sig: number }[] = []; // written chars per turn, for estimating a missing final output count
  const toolById = new Map<string, number>();    // tool_use id -> tools index
  let pendingPrompt = 0, pendingSys = 0;
  let lastSkill: number | null = null;   // tools index of a Skill call in the latest turn (its text arrives as a user message)
  let lastCommand: string | null = null; // last slash command seen (its expanded text follows as another user message)

  // Content that is not a tool result but was caused by something identifiable
  // (slash command / skill text, subagent hand-backs) is attached to a pseudo
  // tool on the latest turn so the analyzer attributes it correctly.
  const pseudo = (key: string, label: string, chars: number) => {
    if (!r.turns.length) { pendingSys += chars; return; }
    const ti = r.turns.length - 1;
    let idx = r.turns[ti].tools.find((i) => r.tools[i].key === key && r.tools[i].pseudo);
    if (idx == null) {
      idx = r.tools.length;
      r.tools.push({ call: ti, id: null, name: label, key, label, inChars: 0, resChars: 0, pseudo: true });
      r.turns[ti].tools.push(idx);
    }
    r.tools[idx].resChars += chars;
  };

  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    let o: Json;
    try { o = JSON.parse(line); } catch { continue; }
    const type = o.type;

    if (o.timestamp) {
      if (!r.firstTs || o.timestamp < r.firstTs) r.firstTs = o.timestamp;
      if (!r.lastTs || o.timestamp > r.lastTs) r.lastTs = o.timestamp;
    }

    if (type === 'assistant' && o.message) {
      const m = o.message;
      const key: string = m.id || o.requestId || o.uuid;
      let ti = turnByMsg.get(key);
      if (ti == null && m.usage) {
        const u = usageFromApi(m.usage);
        ti = r.turns.length;
        turnByMsg.set(key, ti);
        r.turns.push({
          ts: o.timestamp, model: m.model || '?', ...u,
          think: (m.usage.output_tokens_details && m.usage.output_tokens_details.thinking_tokens) || 0,
          effort: o.effort || null,
          outChars: 0, promptChars: pendingPrompt, sysChars: pendingSys, tools: [],
        });
        pendingPrompt = 0; pendingSys = 0; lastSkill = null;
      } else if (ti != null && m.usage) {
        // one line is written per content block; only the last one carries the final output count
        const turn = r.turns[ti];
        Object.assign(turn, usageFromApi(m.usage));
        turn.think = (m.usage.output_tokens_details && m.usage.output_tokens_details.thinking_tokens) || turn.think;
      }
      if (ti != null && m.stop_reason) stopByMsg.set(key, m.stop_reason);
      if (ti != null && Array.isArray(m.content)) {
        const turn = r.turns[ti];
        const est = estByTurn[ti] || (estByTurn[ti] = { vis: 0, sig: 0 });
        for (const b of m.content) {
          if (!b) continue;
          turn.outChars += blockChars(b);
          if (b.type === 'text') est.vis += (b.text || '').length;
          else if (b.type === 'tool_use') est.vis += JSON.stringify(b.input || {}).length;
          else if (b.type === 'thinking') { est.vis += (b.thinking || '').length; est.sig += (b.signature || '').length; }
          if (b.type === 'tool_use') {
            const k = key + ':' + (b.id || '');
            if (toolById.has(k)) continue;
            const [bk, label] = toolKey(b.name, b.input);
            const idx = r.tools.length;
            r.tools.push({ call: ti, id: b.id, name: b.name, key: bk, label, inChars: JSON.stringify(b.input || {}).length, resChars: 0 });
            toolById.set(k, idx);
            if (b.id) toolById.set(b.id, idx);
            turn.tools.push(idx);
            r.toolCalls++;
            if (b.name === 'Skill') lastSkill = idx;
          }
        }
      }
      if (!r.cwd && o.cwd) r.cwd = o.cwd;
      if (!r.version && o.version) r.version = o.version;
      continue;
    }

    if (type === 'user') {
      if (!r.cwd && o.cwd) r.cwd = o.cwd;
      if (!r.version && o.version) r.version = o.version;
      if (!r.gitBranch && o.gitBranch) r.gitBranch = o.gitBranch;
      const c = o.message && o.message.content;
      let handled = false;
      if (Array.isArray(c)) {
        for (const b of c) {
          if (b && b.type === 'tool_result') {
            handled = true;
            const idx = toolById.get(b.tool_use_id);
            const ch = contentChars(b.content);
            if (idx != null) r.tools[idx].resChars += ch; else pendingSys += ch;
          }
        }
      }
      if (handled) continue;
      const text = promptText(c);
      if (isHumanPrompt(o)) {
        const tx = (text || '[image / attachment]').trim();
        if (!isSubagent) r.prompts.push({ ts: o.timestamp, text: tx.length > 400 ? tx.slice(0, 400) + '…' : tx });
        pendingPrompt += contentChars(c);
      } else {
        const chars = contentChars(c);
        const cm = text && /<command-name>\s*(\/[\w:-]+)/.exec(text);
        const kind = o.origin && o.origin.kind;
        if (cm) {
          r.commands[cm[1]] = (r.commands[cm[1]] || 0) + 1;
          lastCommand = cm[1];
          pseudo('command:' + cm[1], 'Command ' + cm[1], chars);
        } else if (kind === 'peer' || kind === 'task-notification') {
          pseudo('agent:handback', 'Subagent hand-backs & task notifications', chars);
        } else if (lastSkill != null) {
          r.tools[lastSkill].resChars += chars; // the skill's instructions
        } else if (lastCommand && r.turns.length && r.turns[r.turns.length - 1].tools.some((i) => r.tools[i].key === 'command:' + lastCommand)) {
          pseudo('command:' + lastCommand, 'Command ' + lastCommand, chars); // expanded command / skill text
        } else {
          pendingSys += chars;
        }
      }
      continue;
    }

    if (type === 'attachment') { pendingSys += JSON.stringify(o.attachment || {}).length; continue; }
    if (type === 'ai-title' && o.aiTitle) { r.title = o.aiTitle; continue; }
    if (type === 'custom-title' && o.customTitle) { r.customTitle = o.customTitle; continue; }
    if (type === 'agent-name' && o.agentName) { r.agentName = o.agentName; continue; }
    if (type === 'summary' && o.summary && !r.title) { r.title = o.summary; continue; }
    if (type === 'cost-state') {
      r.costState = {
        totalCostUSD: o.totalCostUSD || 0, totalAPIDuration: o.totalAPIDuration || 0, totalToolDuration: o.totalToolDuration || 0,
        totalDuration: o.totalDuration || 0, startTime: o.startTime || null, totalLinesAdded: o.totalLinesAdded || 0, totalLinesRemoved: o.totalLinesRemoved || 0, modelUsage: o.modelUsage || {},
      };
      continue;
    }
    if (type === 'system' && o.subtype === 'turn_duration' && o.durationMs) r.apiDurationMs += o.durationMs;
  }
  for (const s of stopByMsg.values()) r.stopReasons[s] = (r.stopReasons[s] || 0) + 1;
  // Background subagents often never get their final line written (no stop_reason on any line), so the
  // output count left is the near-zero one from the start of the stream. Estimate it from what was written.
  for (const [key, ti] of turnByMsg) {
    if (stopByMsg.has(key) || !estByTurn[ti]) continue;
    const turn = r.turns[ti], e = estByTurn[ti];
    const out = Math.round(OUT_PER_CHAR * e.vis + OUT_PER_SIG_CHAR * e.sig);
    if (out > turn.output) { turn.output = out; turn.think = Math.max(turn.think, Math.round(OUT_PER_SIG_CHAR * e.sig)); }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Scanner with on-disk cache (keyed by file path, invalidated by size+mtime).
// Files that Claude Code has since deleted (cleanupPeriodDays) stay in the
// cache as archived entries so history survives the cleanup.
// ---------------------------------------------------------------------------

interface CacheEntry {
  size: number;
  mtimeMs: number;
  data: FileData;
  meta: SubagentMeta | null;
  project: string;
  sessionId: string;
  isSubagent: boolean;
  archived?: string;
}

interface FileRef { rel: string; abs: string; project: string; sessionId: string; isSubagent: boolean; metaFile?: string }

export interface ScanStats { files: number; parsed: number; cached: number; archived: number; ms: number }

export class Scanner {
  root: string;
  cacheFile: string;
  cache: Record<string, CacheEntry> = {};
  sessions: Session[] = [];
  lastScan: string | null = null;
  scanning: Promise<ScanStats> | null = null;
  stats: ScanStats = { files: 0, parsed: 0, cached: 0, archived: 0, ms: 0 };

  constructor(opts: { root: string; cacheFile: string }) {
    this.root = opts.root;
    this.cacheFile = opts.cacheFile;
    this.loadCache();
  }

  private loadCache() {
    try {
      const j = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (j && j.v === CACHE_VERSION && j.files) this.cache = j.files;
      else if (j && j.files) {
        // parser changed: re-parse live files, but keep entries whose transcript Claude Code has deleted
        for (const [rel, c] of Object.entries(j.files as Record<string, CacheEntry>)) {
          if (c.project && !fs.existsSync(path.join(this.root, rel))) this.cache[rel] = c;
        }
      }
    } catch { /* no cache yet */ }
  }

  private saveCache() {
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      const tmp = this.cacheFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ v: CACHE_VERSION, files: this.cache }));
      fs.renameSync(tmp, this.cacheFile);
    } catch (e) {
      console.error('cache save failed:', (e as Error).message);
    }
  }

  private listFiles(): FileRef[] {
    const out: FileRef[] = [];
    if (!fs.existsSync(this.root)) return out;
    for (const proj of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue;
      const pdir = path.join(this.root, proj.name);
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jsonl')) {
          out.push({ rel: proj.name + '/' + e.name, abs: path.join(pdir, e.name), project: proj.name, sessionId: e.name.slice(0, -6), isSubagent: false });
        } else if (e.isDirectory()) {
          // <session>/subagents/**.jsonl (incl. subagents/workflows/wf_x/agent-*.jsonl)
          const sub = path.join(pdir, e.name, 'subagents');
          if (!fs.existsSync(sub)) continue;
          for (const abs of walkJsonl(sub)) {
            out.push({ rel: path.relative(this.root, abs).split(path.sep).join('/'), abs, project: proj.name, sessionId: e.name, isSubagent: true, metaFile: abs.replace(/\.jsonl$/, '.meta.json') });
          }
        }
      }
    }
    return out;
  }

  scan(): Promise<ScanStats> {
    if (this.scanning) return this.scanning;
    this.scanning = this.doScan().finally(() => { this.scanning = null; });
    return this.scanning;
  }

  private async doScan(): Promise<ScanStats> {
    const t0 = Date.now();
    const files = this.listFiles();
    const live = new Set<string>();
    let parsed = 0, cached = 0, archived = 0, dirty = false;
    for (const f of files) {
      live.add(f.rel);
      let st: fs.Stats;
      try { st = fs.statSync(f.abs); } catch { continue; }
      const c = this.cache[f.rel];
      if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) { cached++; continue; }
      try {
        const data = await parseFile(f.abs, f.isSubagent);
        let meta: SubagentMeta | null = null;
        if (f.metaFile) { try { meta = JSON.parse(fs.readFileSync(f.metaFile, 'utf8')); } catch { /* none */ } }
        this.cache[f.rel] = { size: st.size, mtimeMs: st.mtimeMs, data, meta, project: f.project, sessionId: f.sessionId, isSubagent: f.isSubagent };
        parsed++; dirty = true;
      } catch (e) {
        console.error('parse failed', f.rel, (e as Error).message);
      }
    }
    for (const [k, c] of Object.entries(this.cache)) {
      if (live.has(k)) { if (c.archived) { delete c.archived; dirty = true; } continue; }
      if (!c.project) { delete this.cache[k]; dirty = true; continue; }
      if (!c.archived) { c.archived = new Date().toISOString(); dirty = true; }
      archived++;
    }
    if (dirty) this.saveCache();
    this.sessions = this.buildSessions();
    this.lastScan = new Date().toISOString();
    this.stats = { files: files.length, parsed, cached, archived, ms: Date.now() - t0 };
    return this.stats;
  }

  private buildSessions(): Session[] {
    interface Group { id: string; projectDir: string; main: FileData | null; subagents: { data: FileData; meta: SubagentMeta | null; rel: string }[]; archived: boolean }
    const bySession = new Map<string, Group>();
    for (const [rel, c] of Object.entries(this.cache)) {
      if (!c.project) continue;
      const key = c.project + '/' + c.sessionId;
      let s = bySession.get(key);
      if (!s) { s = { id: c.sessionId, projectDir: c.project, main: null, subagents: [], archived: !!c.archived }; bySession.set(key, s); }
      if (c.isSubagent) s.subagents.push({ data: c.data, meta: c.meta, rel });
      else { s.main = c.data; s.archived = !!c.archived; }
    }

    const sessions: Session[] = [];
    const emptyMain: FileData = { turns: [], tools: [], prompts: [], commands: {}, stopReasons: {}, apiDurationMs: 0, toolCalls: 0, title: null, customTitle: null, agentName: null, cwd: null, version: null, gitBranch: null, firstTs: null, lastTs: null, costState: null };
    for (const s of bySession.values()) {
      const main = s.main || emptyMain;
      const turns: SessionTurn[] = [];
      for (const t of main.turns) turns.push({ ...t, sub: false, cost: 0, toolN: t.tools.filter((i) => !main.tools[i].pseudo).length });
      let subToolCalls = 0;
      for (const sa of s.subagents) {
        for (const t of sa.data.turns) turns.push({ ...t, sub: true, cost: 0, toolN: t.tools.filter((i) => !sa.data.tools[i].pseudo).length });
        subToolCalls += sa.data.toolCalls;
      }
      turns.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

      const usage = emptyUsage();
      const byModel: Session['byModel'] = {};
      let cost = 0, unknown = false, think = 0;
      const efforts: Record<string, number> = {};
      for (const t of turns) {
        const c = costOf(t.model, t);
        if (c == null) { unknown = true; t.cost = 0; } else t.cost = c;
        cost += t.cost;
        think += t.think || 0;
        if (t.effort) efforts[t.effort] = (efforts[t.effort] || 0) + 1;
        addUsage(usage, t);
        const bm = byModel[t.model] || (byModel[t.model] = { ...emptyUsage(), cost: 0, turns: 0 });
        addUsage(bm, t); bm.cost += t.cost; bm.turns++;
      }
      if (turns.length === 0 && main.prompts.length === 0) continue; // empty stub file

      // Attribution: main conversation buckets + each subagent run as its own bucket
      const mainA = analyzeConversation(main);
      const buckets: Record<string, Bucket> = { ...mainA.buckets };
      const subRuns: SubRun[] = [];
      for (const sa of s.subagents) {
        const a = analyzeConversation(sa.data);
        const type = (sa.meta && sa.meta.agentType) || 'subagent';
        const key = 'agentrun:' + type;
        const b = buckets[key] || (buckets[key] = { key, label: 'Subagent run: ' + type, calls: 0, ctxTokens: 0, ingestCost: 0, carryCost: 0, outCost: 0, total: 0 });
        // a subagent conversation is separate API traffic: its whole cost is the bucket's cost
        let ing = 0, car = 0, outc = 0;
        for (const x of Object.values(a.buckets)) { ing += x.ingestCost; car += x.carryCost; outc += x.outCost; }
        const scale = (ing + car + outc) > 0 ? a.totalCost / (ing + car + outc) : 0;
        b.calls++; b.ctxTokens += a.totalNewTokens; b.ingestCost += ing * scale; b.carryCost += car * scale; b.outCost += outc * scale;
        subRuns.push({ type, description: sa.meta?.description, cost: a.totalCost, calls: a.calls.length, tokens: a.totalNewTokens, buckets: a.buckets, heavy: a.heavy });
      }
      mergeBuckets(buckets, {}); // normalise totals

      const firstTs = turns.length ? turns[0].ts : main.firstTs;
      const lastTs = turns.length ? turns[turns.length - 1].ts : main.lastTs;
      // a cost-state from a resumed run only covers that run, so it is not the session's total
      const cs = main.costState && !(main.costState.startTime && firstTs && main.costState.startTime > Date.parse(firstTs) + 60_000) ? main.costState : null;
      sessions.push({
        id: s.id,
        projectDir: s.projectDir,
        projectKey: s.projectDir.toLowerCase(),
        cwd: main.cwd || decodeProjectDir(s.projectDir),
        title: main.customTitle || main.title || (main.prompts[0] ? main.prompts[0].text.slice(0, 80) : null) || main.agentName || '(untitled)',
        agentName: main.agentName || null,
        version: main.version || null,
        gitBranch: main.gitBranch || null,
        archived: s.archived,
        firstTs, lastTs,
        wallMs: firstTs && lastTs ? Date.parse(lastTs) - Date.parse(firstTs) : 0,
        apiMs: main.apiDurationMs,
        prompts: main.prompts.length,
        promptList: main.prompts,
        commands: main.commands,
        turns: turns.length,
        toolCalls: main.toolCalls + subToolCalls,
        subagents: s.subagents.length,
        models: Object.keys(byModel),
        byModel, usage, cost, think, efforts,
        unknownModel: unknown,
        reported: cs ? cs.totalCostUSD : null,
        reportedTo: null,
        linesAdded: cs ? cs.totalLinesAdded : null,
        linesRemoved: cs ? cs.totalLinesRemoved : null,
        stopReasons: main.stopReasons,
        turnList: turns,
        analysis: {
          buckets, calls: mainA.calls, heavy: mainA.heavy, startupTokens: mainA.startupTokens, avgCtx: mainA.avgCtx, peakCtx: mainA.peakCtx,
          resets: mainA.resets, misses: mainA.misses, missCost: mainA.missCost, crCost: mainA.crCost, subRuns,
        },
      });
    }
    sessions.sort((a, b) => (b.lastTs || '').localeCompare(a.lastTs || ''));
    return sessions;
  }
}

function walkJsonl(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJsonl(p, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/** "C--Users-payam-Documents-Projects-foo" -> "C:\Users\payam\Documents\Projects\foo" (best effort) */
export function decodeProjectDir(name: string): string {
  const m = /^([A-Za-z])--(.*)$/.exec(name);
  if (m) return m[1].toUpperCase() + ':\\' + m[2].replace(/-/g, '\\');
  return name.replace(/^-/, '/').replace(/-/g, '/');
}
