import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Scanner, CACHE_VERSION, type Session } from './parser';
import { categoryOf, mergeBuckets, type Bucket } from './analyze';
import { PRICES, shortModel, costOf, emptyUsage, addUsage, type Usage } from './pricing';
import { loadPrices } from './prices';
import type { Overview, Breakdown, Lifetime, SessionDetail, ProjectRow, SessionRow, DayRow, BucketRow, CategoryRow, HeavyRow, SubRunRow, LongSession, MissSession } from './types';

export const CLAUDE_HOME = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
export const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(CLAUDE_HOME, 'projects');
const RESCAN_AFTER_MS = Number(process.env.RESCAN_SECONDS || 30) * 1000;

// One scanner per process; kept on globalThis so Next's dev HMR does not re-parse everything.
// A parser change (new CACHE_VERSION) replaces it, so edited parsing takes effect without a restart.
const g = globalThis as unknown as { __claudeUsageScanner?: Scanner; __claudeUsageScannerV?: number };
export function getScanner(): Scanner {
  loadPrices(); // picks up cache/prices.json before anything is costed
  if (!g.__claudeUsageScanner || g.__claudeUsageScannerV !== CACHE_VERSION) {
    g.__claudeUsageScannerV = CACHE_VERSION;
    g.__claudeUsageScanner = new Scanner({ root: CLAUDE_DIR, cacheFile: path.join(process.cwd(), 'cache', 'files.json') });
  }
  return g.__claudeUsageScanner;
}

export async function ensureFresh(force = false): Promise<Scanner> {
  const s = getScanner();
  if (force || !s.lastScan || Date.now() - Date.parse(s.lastScan) > RESCAN_AFTER_MS) {
    await s.scan();
    applyLastSessionTotals(s.sessions);
  }
  return s;
}

// When a session exits, Claude Code saves its own totals per project in ~/.claude.json (lastCost, lastSessionId, …).
// They include API calls that never reach a transcript, so they are the closest thing to /usage. They only cover
// the last run of the process, so they are used only when that run started before the session's first message.
const CLAUDE_JSON = process.env.CLAUDE_JSON || path.join(path.dirname(CLAUDE_HOME), '.claude.json');
function applyLastSessionTotals(sessions: Session[]) {
  let projects: Record<string, { lastSessionId?: string; lastCost?: number; lastStartTime?: number; lastLinesAdded?: number; lastLinesRemoved?: number }>;
  try { projects = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8')).projects || {}; } catch { return; }
  const byId = new Map(Object.values(projects).filter((p) => p && p.lastSessionId && typeof p.lastCost === 'number').map((p) => [p.lastSessionId!, p]));
  for (const s of sessions) {
    const p = byId.get(s.id);
    if (!p || s.reported != null || !p.lastStartTime || !s.firstTs || p.lastStartTime > Date.parse(s.firstTs) + 60_000) continue;
    s.reported = p.lastCost!;
    if (s.linesAdded == null && typeof p.lastLinesAdded === 'number') { s.linesAdded = p.lastLinesAdded; s.linesRemoved = p.lastLinesRemoved ?? 0; }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export interface Query { from?: string | null; to?: string | null; project?: string | null }

function localDay(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function projectName(cwd: string, dir: string): string {
  const parts = String(cwd).split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 1) return cwd || dir;
  return parts.slice(-2).join('/');
}

function rangeFilter(q: Query) {
  const from = q.from || null, to = q.to || null;
  return { from, to, inRange: (day: string) => (!from || day >= from) && (!to || day <= to) };
}

/** sessions matching project + having at least one call in range */
function selectSessions(scanner: Scanner, q: Query) {
  const { inRange } = rangeFilter(q);
  const project = q.project ? q.project.toLowerCase() : null;
  const out: { s: Session; turns: Session['turnList']; full: boolean }[] = [];
  for (const s of scanner.sessions) {
    if (project && s.projectKey !== project) continue;
    const turns = s.turnList.filter((t) => t.ts && inRange(localDay(t.ts)));
    if (!turns.length) continue;
    out.push({ s, turns, full: turns.length === s.turnList.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// overview
// ---------------------------------------------------------------------------

export function overview(scanner: Scanner, q: Query): Overview {
  const { from, to } = rangeFilter(q);
  const totals = { ...emptyUsage(), cost: 0, reported: 0, reportedSessions: 0, turns: 0, prompts: 0, toolCalls: 0, apiMs: 0, think: 0, crCost: 0, missCost: 0, misses: 0, subCost: 0 };
  const byModel: Record<string, Usage & { cost: number; turns: number }> = {};
  const byDay: Record<string, Omit<DayRow, 'sessions'> & { sessions: Set<string> }> = {};
  type P = Omit<ProjectRow, 'dirs' | 'avgStartup'> & { dirs: Set<string>; startupSum: number; startupN: number };
  const projects: Record<string, P> = {};
  const sessions: SessionRow[] = [];
  const unknownModels = new Set<string>();

  for (const { s, turns, full } of selectSessions(scanner, q)) {
    const su = emptyUsage();
    let sc = 0, subCost = 0, think = 0;
    const sModels: Record<string, number> = {};
    for (const t of turns) {
      const day = localDay(t.ts);
      sc += t.cost; think += t.think || 0;
      if (t.sub) subCost += t.cost;
      addUsage(su, t);
      const bm = byModel[t.model] || (byModel[t.model] = { ...emptyUsage(), cost: 0, turns: 0 });
      addUsage(bm, t); bm.cost += t.cost; bm.turns++;
      const bd = byDay[day] || (byDay[day] = { day, cost: 0, tokens: 0, turns: 0, models: {}, sessions: new Set() });
      bd.cost += t.cost; bd.turns++; bd.sessions.add(s.id);
      bd.tokens += t.input + t.output + t.cw5 + t.cw1 + t.cr;
      bd.models[t.model] = (bd.models[t.model] || 0) + t.cost;
      sModels[t.model] = (sModels[t.model] || 0) + t.cost;
      totals.crCost += costOf(t.model, { input: 0, output: 0, cw5: 0, cw1: 0, cr: t.cr }) || 0;
    }
    if (s.unknownModel) for (const m of s.models) if (!PRICES[m] && m !== '<synthetic>') unknownModels.add(m);

    totals.cost += sc; totals.turns += turns.length; addUsage(totals, su); totals.subCost += subCost;
    totals.prompts += s.prompts; totals.toolCalls += s.toolCalls; totals.apiMs += s.apiMs; totals.think += think;
    totals.misses += s.analysis.misses; totals.missCost += s.analysis.missCost;
    if (s.reported != null && full) { totals.reported += s.reported; totals.reportedSessions++; }

    const pk = s.projectKey;
    const p = projects[pk] || (projects[pk] = {
      key: pk, name: projectName(s.cwd, s.projectDir), cwd: s.cwd, dirs: new Set(),
      sessions: 0, turns: 0, cost: 0, reported: 0, ...emptyUsage(), lastTs: null, firstTs: null, models: {}, startupSum: 0, startupN: 0,
    });
    p.dirs.add(s.projectDir);
    p.sessions++; p.turns += turns.length; p.cost += sc; addUsage(p, su);
    if (s.reported != null) p.reported += s.reported;
    if (!p.lastTs || (s.lastTs && s.lastTs > p.lastTs)) p.lastTs = s.lastTs;
    if (!p.firstTs || (s.firstTs && s.firstTs < p.firstTs)) p.firstTs = s.firstTs;
    if (s.analysis.startupTokens) { p.startupSum += s.analysis.startupTokens; p.startupN++; }
    for (const [m, c] of Object.entries(sModels)) p.models[m] = (p.models[m] || 0) + c;

    sessions.push({
      id: s.id, projectKey: pk, project: p.name, cwd: s.cwd, title: s.title, agentName: s.agentName, archived: s.archived,
      firstTs: s.firstTs, lastTs: s.lastTs, wallMs: s.wallMs, apiMs: s.apiMs,
      prompts: s.prompts, turns: turns.length, toolCalls: s.toolCalls, subagents: s.subagents,
      models: Object.keys(sModels), usage: su, cost: sc, subCost,
      reported: s.reported, linesAdded: s.linesAdded, linesRemoved: s.linesRemoved,
      version: s.version, gitBranch: s.gitBranch,
      avgCtx: s.analysis.avgCtx, peakCtx: s.analysis.peakCtx, startupTokens: s.analysis.startupTokens,
      misses: s.analysis.misses, resets: s.analysis.resets, crCost: s.analysis.crCost, think,
    });
  }

  const projectList: ProjectRow[] = Object.values(projects).map((p) => {
    const { dirs, startupSum, startupN, ...rest } = p;
    return { ...rest, dirs: [...dirs], avgStartup: startupN ? Math.round(startupSum / startupN) : 0 };
  }).sort((a, b) => b.cost - a.cost);
  const days: DayRow[] = Object.values(byDay).map((d) => ({ ...d, sessions: d.sessions.size })).sort((a, b) => a.day.localeCompare(b.day));

  return {
    generatedAt: new Date().toISOString(),
    lastScan: scanner.lastScan,
    scanStats: scanner.stats,
    claudeDir: CLAUDE_DIR,
    range: { from, to, project: q.project || null },
    totals: { ...totals, sessions: sessions.length, projects: projectList.length },
    byModel: Object.entries(byModel).map(([model, v]) => ({ model, short: shortModel(model), ...v })).sort((a, b) => b.cost - a.cost),
    byDay: days,
    projects: projectList,
    sessions,
    unknownModels: [...unknownModels],
  };
}

// ---------------------------------------------------------------------------
// breakdown (where the tokens go)
// ---------------------------------------------------------------------------

export function breakdown(scanner: Scanner, q: Query): Breakdown {
  const sel = selectSessions(scanner, q);
  const buckets: Record<string, Bucket> = {};
  const heavy: HeavyRow[] = [];
  const commands: Record<string, number> = {};
  const efforts: Record<string, number> = {};
  const subRuns: Record<string, SubRunRow> = {};
  let total = 0, totalMain = 0, think = 0, output = 0, sessionsN = 0;
  const longSessions: LongSession[] = [];
  const missSessions: MissSession[] = [];
  const modelCost: Record<string, number> = {};
  const modelUsage: Record<string, Usage> = {};
  let startupSum = 0, startupN = 0;

  for (const { s } of sel) {
    sessionsN++;
    total += s.cost;
    mergeBuckets(buckets, s.analysis.buckets);
    const pname = projectName(s.cwd, s.projectDir);
    for (const h of s.analysis.heavy) heavy.push({ ...h, session: s.id, title: s.title, project: pname });
    for (const [c, n] of Object.entries(s.commands || {})) commands[c] = (commands[c] || 0) + n;
    for (const [e, n] of Object.entries(s.efforts || {})) efforts[e] = (efforts[e] || 0) + n;
    for (const r of s.analysis.subRuns) {
      const x = subRuns[r.type] || (subRuns[r.type] = { type: r.type, runs: 0, cost: 0, calls: 0, tokens: 0 });
      x.runs++; x.cost += r.cost; x.calls += r.calls; x.tokens += r.tokens;
    }
    think += s.think; output += s.usage.output;
    if (s.analysis.startupTokens) { startupSum += s.analysis.startupTokens; startupN++; }
    for (const [m, v] of Object.entries(s.byModel)) {
      modelCost[m] = (modelCost[m] || 0) + v.cost;
      const mu = modelUsage[m] || (modelUsage[m] = emptyUsage());
      addUsage(mu, v);
    }
    const mainCost = s.cost - s.turnList.filter((t) => t.sub).reduce((a, t) => a + t.cost, 0);
    totalMain += mainCost;
    if (s.analysis.avgCtx >= 100000 && s.cost > 1) {
      longSessions.push({ id: s.id, title: s.title, project: pname, cost: s.cost, crCost: s.analysis.crCost, avgCtx: s.analysis.avgCtx, peakCtx: s.analysis.peakCtx, calls: s.turns, prompts: s.prompts, wallMs: s.wallMs, resets: s.analysis.resets });
    }
    if (s.analysis.misses > 0 && s.analysis.missCost > 0.05) {
      missSessions.push({ id: s.id, title: s.title, project: pname, misses: s.analysis.misses, missCost: s.analysis.missCost, cost: s.cost });
    }
  }

  // what-if: every Opus call billed at Sonnet rates
  const whatIf: Breakdown['whatIf'] = {};
  for (const [m, u] of Object.entries(modelUsage)) {
    if (/opus/.test(m)) whatIf[m] = { current: modelCost[m], asSonnet: costOf('claude-sonnet-5', u) };
  }

  const list: BucketRow[] = Object.values(buckets).map((b) => ({ ...b, category: categoryOf(b.key) })).sort((a, b) => b.total - a.total);
  const categories: Record<string, CategoryRow> = {};
  for (const b of list) {
    const c = categories[b.category] || (categories[b.category] = { category: b.category, calls: 0, ctxTokens: 0, ingestCost: 0, carryCost: 0, outCost: 0, total: 0 });
    c.calls += b.calls; c.ctxTokens += b.ctxTokens; c.ingestCost += b.ingestCost; c.carryCost += b.carryCost; c.outCost += b.outCost; c.total += b.total;
  }
  heavy.sort((a, b) => (b.carryCost + b.ingestCost) - (a.carryCost + a.ingestCost));
  longSessions.sort((a, b) => b.crCost - a.crCost);
  missSessions.sort((a, b) => b.missCost - a.missCost);

  return {
    range: { from: q.from || null, to: q.to || null, project: q.project || null },
    sessions: sessionsN, total, totalMain,
    attributed: list.reduce((a, b) => a + b.total, 0),
    buckets: list,
    categories: Object.values(categories).sort((a, b) => b.total - a.total),
    heavy: heavy.slice(0, 40),
    subRuns: Object.values(subRuns).sort((a, b) => b.cost - a.cost),
    commands: Object.entries(commands).map(([c, n]) => ({ command: c, count: n })).sort((a, b) => b.count - a.count),
    efforts, think, output,
    avgStartup: startupN ? Math.round(startupSum / startupN) : 0,
    longSessions: longSessions.slice(0, 15),
    missSessions: missSessions.slice(0, 15),
    whatIf,
  };
}

// ---------------------------------------------------------------------------
// lifetime (Claude Code's own stats-cache.json)
// ---------------------------------------------------------------------------

export function lifetime(): Lifetime {
  const file = path.join(CLAUDE_HOME, 'stats-cache.json');
  let j: Record<string, unknown>;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { available: false, file }; }
  const mu = (j.modelUsage || {}) as Record<string, Record<string, number>>;
  const models = Object.entries(mu).map(([model, u]) => {
    const usage: Usage = { input: u.inputTokens || 0, output: u.outputTokens || 0, cw5: u.cacheCreationInputTokens || 0, cw1: 0, cr: u.cacheReadInputTokens || 0 };
    return { model, short: shortModel(model), ...usage, cost: costOf(model, usage) };
  }).sort((a, b) => (b.cost || 0) - (a.cost || 0));
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_HOME, 'settings.json'), 'utf8')); } catch { /* none */ }
  let lastCleanup: string | null = null;
  try { lastCleanup = fs.readFileSync(path.join(CLAUDE_HOME, '.last-cleanup'), 'utf8').trim(); } catch { /* none */ }
  return {
    available: true, file,
    lastComputedDate: j.lastComputedDate as string,
    firstSessionDate: j.firstSessionDate as string,
    totalSessions: j.totalSessions as number,
    totalMessages: j.totalMessages as number,
    longestSession: j.longestSession as Lifetime['longestSession'],
    hourCounts: (j.hourCounts || {}) as Record<string, number>,
    dailyActivity: (j.dailyActivity || []) as Lifetime['dailyActivity'],
    dailyModelTokens: (j.dailyModelTokens || []) as Lifetime['dailyModelTokens'],
    models,
    cost: models.reduce((a, m) => a + (m.cost || 0), 0),
    cleanupPeriodDays: (settings.cleanupPeriodDays as number) || 30,
    lastCleanup,
    settingsModel: (settings.model as string) || null,
    home: CLAUDE_HOME,
  };
}

// ---------------------------------------------------------------------------
// session detail
// ---------------------------------------------------------------------------

export function sessionDetail(scanner: Scanner, id: string): SessionDetail | null {
  const s = scanner.sessions.find((x) => x.id === id);
  if (!s) return null;
  let cum = 0;
  const turns = s.turnList.map((t) => {
    cum += t.cost;
    return { ts: t.ts, model: t.model, input: t.input, output: t.output, cw5: t.cw5, cw1: t.cw1, cr: t.cr, cost: t.cost, cum, sub: t.sub, think: t.think || 0 };
  });
  const buckets: BucketRow[] = Object.values(s.analysis.buckets).map((b) => ({ ...b, category: categoryOf(b.key) })).sort((a, b) => b.total - a.total);
  const { subRuns: _subRuns, ...analysis } = s.analysis;
  void _subRuns;
  return {
    id: s.id, projectDir: s.projectDir, projectKey: s.projectKey, cwd: s.cwd, project: projectName(s.cwd, s.projectDir),
    title: s.title, agentName: s.agentName, version: s.version, gitBranch: s.gitBranch, archived: s.archived,
    firstTs: s.firstTs, lastTs: s.lastTs, wallMs: s.wallMs, apiMs: s.apiMs,
    prompts: s.promptList, commands: s.commands, turnCount: s.turns, toolCalls: s.toolCalls, subagents: s.subagents,
    byModel: Object.entries(s.byModel).map(([model, v]) => ({ model, short: shortModel(model), ...v })).sort((a, b) => b.cost - a.cost),
    usage: s.usage, cost: s.cost, reported: s.reported, think: s.think, efforts: s.efforts,
    linesAdded: s.linesAdded, linesRemoved: s.linesRemoved, stopReasons: s.stopReasons,
    turns,
    analysis: { ...analysis, buckets },
    file: path.join(CLAUDE_DIR, s.projectDir, s.id + '.jsonl'),
  };
}
