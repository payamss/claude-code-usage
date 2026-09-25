import { priceFor, FREE_MODELS, type PriceRow } from './pricing';
import type { FileData, ToolUse } from './parser';

// Attribution of one conversation's cost to the things that put tokens into
// its context (tool results, skills, MCP responses, prompts, startup context).
//
// Model: every API call re-sends the whole conversation. Content added to the
// context at call k is (a) written to the cache once - "ingest" - and then
// (b) read from cache on every later call until the context is compacted -
// "carry". Tokens are calibrated against the real API numbers: the context
// growth between two calls (ctx_k - ctx_{k-1}) is split among the items that
// arrived in between, proportionally to their character length.

export const LABELS: Record<string, string> = {
  startup: 'Session startup context (system prompt, CLAUDE.md, tool definitions, MCP instructions)',
  prompts: 'Your prompts (typed / pasted)',
  assistant: 'Assistant responses (text, thinking, tool inputs)',
  system: 'Injected context (system reminders, attachments, slash-command output)',
  compaction: 'Compaction summaries / context rebuilds',
  cachemiss: 'Cache misses (context re-processed after idle > cache TTL)',
};

export interface Bucket {
  key: string;
  label: string;
  calls: number;
  ctxTokens: number;
  ingestCost: number;
  carryCost: number;
  outCost: number;
  total: number;
}

export interface CallStat {
  ts: string;
  model: string;
  ctx: number;
  newTok: number;
  cost: number;
  out: number;
  think: number;
  reset: boolean;
  miss: boolean;
  tools: number;
}

export interface HeavyItem {
  name: string;
  label: string;
  key: string;
  tokens: number;
  ingestCost: number;
  carryCost: number;
  ts: string;
  call: number;
}

/** Shell commands of one kind (cat/sed reads, grep, tests, …): the Shell bucket split up */
export interface ShellStat { calls: number; ctxTokens: number; ingestCost: number; carryCost: number; outCost: number }

export interface Analysis {
  buckets: Record<string, Bucket>;
  shell: Record<string, ShellStat>;
  calls: CallStat[];
  heavy: HeavyItem[];
  startupTokens: number;
  avgCtx: number;
  peakCtx: number;
  resets: number;
  misses: number;
  missCost: number;
  crCost: number;
  totalCost: number;
  totalNewTokens: number;
  totalCarry: number;
}

export function emptyBucket(key: string, label?: string): Bucket {
  return { key, label: label || LABELS[key] || key, calls: 0, ctxTokens: 0, ingestCost: 0, carryCost: 0, outCost: 0, total: 0 };
}

function prices(model: string): PriceRow {
  if (FREE_MODELS.has(model)) return [0, 0, 0, 0, 0];
  return priceFor(model) || [0, 0, 0, 0, 0];
}

interface Item { key: string; label?: string; chars: number; tool?: ToolUse }

export function analyzeConversation(data: FileData): Analysis {
  const turns = data.turns || [];
  const tools = data.tools || [];
  const n = turns.length;
  const buckets: Record<string, Bucket> = {};
  const B = (key: string, label?: string) => buckets[key] || (buckets[key] = emptyBucket(key, label));
  const calls: CallStat[] = [];
  const heavy: HeavyItem[] = [];
  const shell: Record<string, ShellStat> = {};
  const SH = (kind: string) => shell[kind] || (shell[kind] = { calls: 0, ctxTokens: 0, ingestCost: 0, carryCost: 0, outCost: 0 });
  const out: Analysis = {
    buckets, shell, calls, heavy, startupTokens: 0, avgCtx: 0, peakCtx: 0, resets: 0, misses: 0,
    missCost: 0, crCost: 0, totalCost: 0, totalNewTokens: 0, totalCarry: 0,
  };
  if (n === 0) return out;

  const P = turns.map((t) => prices(t.model));
  const ctx = turns.map((t) => t.input + t.cw5 + t.cw1 + t.cr);
  const newTok = turns.map((t) => t.input + t.cw5 + t.cw1);
  const cost = turns.map((t, k) => (t.input * P[k][0] + t.output * P[k][1] + t.cw5 * P[k][2] + t.cw1 * P[k][3] + t.cr * P[k][4]) / 1e6);
  const crPrice = turns.map((_t, k) => P[k][4] / 1e6);
  const cwPrice = turns.map((t, k) => {
    const w = t.cw5 + t.cw1;
    return (w > 0 ? (t.cw5 * P[k][2] + t.cw1 * P[k][3]) / w : P[k][2]) / 1e6;
  });
  const reset = turns.map((_t, k) => k > 0 && ctx[k - 1] > 20000 && ctx[k] < 0.6 * ctx[k - 1]);
  const miss = turns.map((t, k) => k > 0 && !reset[k] && turns[k - 1].cr + turns[k - 1].cw5 + turns[k - 1].cw1 > 20000 && t.cr < 0.5 * ctx[k - 1]);

  // suffix sums of cache-read price within a segment (until the next reset)
  const S = new Array<number>(n).fill(0);
  for (let k = n - 2; k >= 0; k--) S[k] = reset[k + 1] ? 0 : S[k + 1] + crPrice[k + 1];

  let ctxSum = 0;
  for (let k = 0; k < n; k++) {
    const t = turns[k];
    ctxSum += ctx[k];
    if (ctx[k] > out.peakCtx) out.peakCtx = ctx[k];
    out.totalCost += cost[k];
    out.crCost += t.cr * crPrice[k];
    out.totalNewTokens += newTok[k];
    if (reset[k]) out.resets++;
    if (miss[k]) { out.misses++; out.missCost += (t.cw5 * P[k][2] + t.cw1 * P[k][3]) / 1e6; }
    calls.push({ ts: t.ts, model: t.model, ctx: ctx[k], newTok: newTok[k], cost: cost[k], out: t.output, think: t.think || 0, reset: reset[k], miss: miss[k], tools: t.tools.length });

    // ---- what arrived between call k-1 and call k ----
    const items: Item[] = [];
    let attributable = newTok[k];
    if (k === 0) {
      const promptTok = Math.min(newTok[0], Math.round((t.promptChars || 0) / 4));
      out.startupTokens = newTok[0] - promptTok;
      if (promptTok) items.push({ key: 'prompts', chars: promptTok });
      items.push({ key: 'startup', chars: out.startupTokens });
    } else if (reset[k]) {
      items.push({ key: 'compaction', chars: 1 });
    } else {
      const growth = Math.max(0, ctx[k] - ctx[k - 1]);
      if (miss[k]) {
        const excess = Math.max(0, newTok[k] - growth);
        if (excess > 0) {
          const b = B('cachemiss');
          b.calls++; b.ctxTokens += excess; b.ingestCost += excess * cwPrice[k];
        }
        attributable = Math.min(newTok[k], growth);
      }
      const prev = turns[k - 1];
      let inSum = 0;
      for (const ti of prev.tools) {
        const tool = tools[ti];
        if (!tool) continue;
        inSum += tool.inChars;
        // tool input (e.g. the file content passed to Write) + tool result both enter the context
        items.push({ key: tool.key, label: tool.label, chars: Math.max(1, tool.resChars + tool.inChars), tool });
      }
      const textChars = Math.max(0, (prev.outChars || 0) - inSum);
      if (textChars) items.push({ key: 'assistant', chars: textChars });
      if (t.promptChars) items.push({ key: 'prompts', chars: t.promptChars });
      if (t.sysChars) items.push({ key: 'system', chars: t.sysChars });
      if (!items.length) items.push({ key: 'system', chars: 1 });
    }

    const totalChars = items.reduce((a, i) => a + i.chars, 0) || 1;
    for (const it of items) {
      const tk = attributable * (it.chars / totalChars);
      const b = B(it.key, it.label);
      b.ctxTokens += tk;
      b.ingestCost += tk * cwPrice[k];
      b.carryCost += tk * S[k];
      out.totalCarry += tk * S[k];
      if (it.tool) {
        if (!it.tool.pseudo) b.calls++;
        if (it.tool.kind) {
          const sh = SH(it.tool.kind);
          sh.calls++; sh.ctxTokens += tk; sh.ingestCost += tk * cwPrice[k]; sh.carryCost += tk * S[k];
        }
        if (tk > 2000) heavy.push({ name: it.tool.name, label: it.tool.label, key: it.tool.key, tokens: Math.round(tk), ingestCost: tk * cwPrice[k], carryCost: tk * S[k], ts: t.ts, call: k });
      }
    }

    // output tokens of this call: to the tools it decided to call, else to the assistant bucket
    const oc = t.output * P[k][1] / 1e6;
    if (t.tools.length) {
      for (const ti of t.tools) {
        const tool = tools[ti];
        if (tool) B(tool.key, tool.label).outCost += oc / t.tools.length;
        if (tool && tool.kind) SH(tool.kind).outCost += oc / t.tools.length;
      }
    } else {
      B('assistant').outCost += oc;
    }
  }
  out.avgCtx = Math.round(ctxSum / n);
  for (const b of Object.values(buckets)) b.total = b.ingestCost + b.carryCost + b.outCost;
  heavy.sort((a, b) => (b.carryCost + b.ingestCost) - (a.carryCost + a.ingestCost));
  out.heavy = heavy.slice(0, 20);
  return out;
}

/** target[key] += source[key] for every bucket (also recomputes total) */
export function mergeBuckets(target: Record<string, Bucket>, source: Record<string, Bucket>): Record<string, Bucket> {
  for (const [k, s] of Object.entries(source)) {
    const tgt = target[k] || (target[k] = emptyBucket(k, s.label));
    tgt.calls += s.calls; tgt.ctxTokens += s.ctxTokens; tgt.ingestCost += s.ingestCost;
    tgt.carryCost += s.carryCost; tgt.outCost += s.outCost;
  }
  for (const b of Object.values(target)) b.total = b.ingestCost + b.carryCost + b.outCost;
  return target;
}

/** Coarse category for a bucket key */
export function categoryOf(key: string): string {
  if (key.startsWith('skill:') || key.startsWith('command:')) return 'Skills & commands';
  if (key.startsWith('mcp:')) return 'MCP servers';
  if (key.startsWith('agent:') || key.startsWith('agentrun:') || key === 'workflow') return 'Subagents & workflows';
  if (key === 'tool:Read' || key === 'tool:Search') return 'Reading & searching code';
  if (key === 'tool:Shell') return 'Shell commands';
  if (key === 'tool:Edit') return 'Editing files';
  if (key === 'tool:Web') return 'Web';
  if (key === 'tool:Artifact') return 'Artifacts';
  if (key.startsWith('tool:')) return 'Other tools';
  if (key === 'startup') return 'Session startup';
  if (key === 'assistant') return 'Assistant output';
  if (key === 'prompts') return 'Your prompts';
  if (key === 'cachemiss') return 'Cache misses';
  if (key === 'compaction') return 'Compaction';
  return 'System / injected';
}
