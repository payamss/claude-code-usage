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
    applyReportedTotals(s.sessions);
  }
  return s;
}

// When a session exits, Claude Code saves its own totals per project in ~/.claude.json (lastCost, lastSessionId, …).
// They include API calls that never reach a transcript, so they are the closest thing to /usage. They only cover
// the last run of the process, so they are used only when that run started before the session's first message.
// Only the last session per project is kept there, so each total is copied into our own cache the first time it
// is seen (Claude Code's files are only ever read).
const CLAUDE_JSON = process.env.CLAUDE_JSON || path.join(path.dirname(CLAUDE_HOME), '.claude.json');
const REPORTED_FILE = path.join(process.cwd(), 'cache', 'reported.json');
interface SavedTotal { cost: number; to: number; linesAdded?: number; linesRemoved?: number }
function applyReportedTotals(sessions: Session[]) {
  let saved: Record<string, SavedTotal> = {};
  try { saved = JSON.parse(fs.readFileSync(REPORTED_FILE, 'utf8')); } catch { /* none yet */ }
  let projects: Record<string, { lastSessionId?: string; lastCost?: number; lastStartTime?: number; lastDuration?: number; lastLinesAdded?: number; lastLinesRemoved?: number }> = {};
  try { projects = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8')).projects || {}; } catch { /* not readable (e.g. Docker) */ }
  const byId = new Map(Object.values(projects).filter((p) => p && p.lastSessionId && typeof p.lastCost === 'number').map((p) => [p.lastSessionId!, p]));
  let dirty = false;
  for (const s of sessions) {
    const p = byId.get(s.id);
    if (p && p.lastStartTime && s.firstTs && p.lastStartTime <= Date.parse(s.firstTs) + 60_000) {
      const to = p.lastStartTime + (p.lastDuration || 0);
      const cur = saved[s.id];
      if (!cur || cur.cost !== p.lastCost || cur.to !== to) {
        saved[s.id] = { cost: p.lastCost!, to, linesAdded: p.lastLinesAdded, linesRemoved: p.lastLinesRemoved };
        dirty = true;
      }
    }
    const v = saved[s.id];
    if (!v || s.reported != null) continue;
    s.reported = v.cost; s.reportedTo = v.to;
    if (s.linesAdded == null && typeof v.linesAdded === 'number') { s.linesAdded = v.linesAdded; s.linesRemoved = v.linesRemoved ?? 0; }
  }
  if (dirty) {
    try {
      fs.mkdirSync(path.dirname(REPORTED_FILE), { recursive: true });
      fs.writeFileSync(REPORTED_FILE + '.tmp', JSON.stringify(saved));
      fs.renameSync(REPORTED_FILE + '.tmp', REPORTED_FILE);
    } catch (e) { console.error('saving reported totals failed:', (e as Error).message); }
  }
}

/** Claude Code's own total where there is one (plus estimated calls made after it), else the transcript estimate. */
function sessionCost(s: Session): number {
  if (s.reported == null) return s.cost;
  if (s.reportedTo == null) return s.reported;
  let after = 0;
  for (const t of s.turnList) if (t.ts && Date.parse(t.ts) > s.reportedTo) after += t.cost;
  return s.reported + after;
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
  const { from, to, inRange } = rangeFilter(q);
  const totals = { ...emptyUsage(), cost: 0, estimate: 0, reportedUsed: 0, reported: 0, reportedSessions: 0, turns: 0, prompts: 0, toolCalls: 0, apiMs: 0, think: 0, crCost: 0, missCost: 0, misses: 0, subCost: 0 };
  const byModel: Record<string, Usage & { cost: number; turns: number }> = {};
  const byDay: Record<string, Omit<DayRow, 'sessions'> & { sessions: Set<string> }> = {};
  type P = Omit<ProjectRow, 'dirs' | 'avgStartup'> & { dirs: Set<string>; startupSum: number; startupN: number };
  const projects: Record<string, P> = {};
  const sessions: SessionRow[] = [];
  const unknownModels = new Set<string>();

  for (const { s, turns, full } of selectSessions(scanner, q)) {
    const su = emptyUsage();
    let sc = 0, subCost = 0, think = 0, toolCalls = 0;
    const sModels: Record<string, number> = {};
    for (const t of turns) {
      const day = localDay(t.ts);
      sc += t.cost; think += t.think || 0; toolCalls += t.toolN || 0;
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

    // Claude Code's own total replaces the estimate when the whole session is in range
    const useReported = full && s.reported != null;
    const cost = useReported ? sessionCost(s) : sc;
    const prompts = full ? s.prompts : s.promptList.filter((x) => x.ts && inRange(localDay(x.ts))).length;
    if (full) toolCalls = s.toolCalls;
    totals.cost += cost; totals.estimate += sc; if (useReported) totals.reportedUsed++;
    totals.turns += turns.length; addUsage(totals, su); totals.subCost += subCost;
    totals.prompts += prompts; totals.toolCalls += toolCalls; totals.apiMs += s.apiMs; totals.think += think;
    totals.misses += s.analysis.misses; totals.missCost += s.analysis.missCost;
    if (s.reported != null && full) { totals.reported += s.reported; totals.reportedSessions++; }

    const pk = s.projectKey;
    const p = projects[pk] || (projects[pk] = {
      key: pk, name: projectName(s.cwd, s.projectDir), cwd: s.cwd, dirs: new Set(),
      sessions: 0, turns: 0, cost: 0, reported: 0, ...emptyUsage(), lastTs: null, firstTs: null, models: {}, startupSum: 0, startupN: 0,
    });
    p.dirs.add(s.projectDir);
    p.sessions++; p.turns += turns.length; p.cost += cost; addUsage(p, su);
    if (s.reported != null) p.reported += s.reported;
    if (!p.lastTs || (s.lastTs && s.lastTs > p.lastTs)) p.lastTs = s.lastTs;
    if (!p.firstTs || (s.firstTs && s.firstTs < p.firstTs)) p.firstTs = s.firstTs;
    if (s.analysis.startupTokens) { p.startupSum += s.analysis.startupTokens; p.startupN++; }
    for (const [m, c] of Object.entries(sModels)) p.models[m] = (p.models[m] || 0) + c;

    sessions.push({
      id: s.id, projectKey: pk, project: p.name, cwd: s.cwd, title: s.title, agentName: s.agentName, archived: s.archived,
      firstTs: s.firstTs, lastTs: s.lastTs, wallMs: s.wallMs, apiMs: s.apiMs,
      prompts, turns: turns.length, toolCalls, subagents: s.subagents,
      models: Object.keys(sModels), usage: su, cost, estimate: sc, costReported: useReported, subCost,
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
// lifetime: the parsed transcripts (incl. archived ones) for every day they cover; before the first
// transcript, Claude Code's own stats-cache.json, corrected for its double counting
// ---------------------------------------------------------------------------

export function lifetime(scanner: Scanner): Lifetime {
  const file = path.join(CLAUDE_HOME, 'stats-cache.json');
  let st: Record<string, unknown> | null = null;
  try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* not there: transcripts only */ }
  const utcDay = (ts: string) => ts.slice(0, 10); // stats-cache.json uses UTC days

  // transcripts
  const daily: Record<string, Record<string, number>> = {};
  const models: Record<string, Usage & { cost: number }> = {};
  let firstTx: string | null = null, lastTx: string | null = null, txCost = 0, estimate = 0, reportedUsed = 0, calls = 0;
  let longest: Lifetime['longestSession'] | null = null;
  for (const s of scanner.sessions) {
    for (const t of s.turnList) {
      if (!t.ts || t.model === '<synthetic>') continue;
      if (!firstTx || t.ts < firstTx) firstTx = t.ts;
      if (!lastTx || t.ts > lastTx) lastTx = t.ts;
      const d = daily[utcDay(t.ts)] || (daily[utcDay(t.ts)] = {});
      d[t.model] = (d[t.model] || 0) + t.input + t.output + t.cw5 + t.cw1 + t.cr;
      const m = models[t.model] || (models[t.model] = { ...emptyUsage(), cost: 0 });
      addUsage(m, t); m.cost += t.cost;
      calls++;
    }
    estimate += s.cost; txCost += sessionCost(s);
    if (s.reported != null) reportedUsed++;
    if (s.firstTs && (!longest || s.wallMs > longest.duration)) longest = { sessionId: s.id, timestamp: s.firstTs, duration: s.wallMs, messageCount: s.turns };
  }
  const firstTxDay = firstTx ? utcDay(firstTx) : null;

  // stats-cache.json adds up every transcript line; a response is written as several lines, so it counts
  // most tokens more than once. The factor is measured per model on the days both sources cover.
  const statsDays = ((st && st.dailyModelTokens) || []) as { date: string; tokensByModel: Record<string, number> }[];
  const lastComputed = (st && (st.lastComputedDate as string)) || null;
  const ratio: Record<string, [number, number]> = {};
  const all: [number, number] = [0, 0];
  for (const d of statsDays) {
    const ours = daily[d.date];
    if (!ours || (firstTxDay && d.date <= firstTxDay)) continue; // the first transcript day may be partly deleted
    for (const [m, v] of Object.entries(d.tokensByModel)) {
      const r = ratio[m] || (ratio[m] = [0, 0]);
      r[0] += v; r[1] += ours[m] || 0; all[0] += v; all[1] += ours[m] || 0;
    }
  }
  const overall = all[1] > 0 ? all[0] / all[1] : 1;
  const factorOf = (m: string) => (ratio[m] && ratio[m][0] > 0 && ratio[m][1] > 0 ? ratio[m][0] / ratio[m][1] : overall);

  const onlyStats = statsDays.filter((d) => !firstTxDay || d.date < firstTxDay);
  const statsTokens: Record<string, [number, number]> = {}; // model -> [tokens on stats-only days, tokens on all stats days]
  for (const d of statsDays) for (const [m, v] of Object.entries(d.tokensByModel)) {
    const x = statsTokens[m] || (statsTokens[m] = [0, 0]);
    x[1] += v; if (!firstTxDay || d.date < firstTxDay) x[0] += v;
  }
  let soCost = 0, soRaw = 0;
  const mu = ((st && st.modelUsage) || {}) as Record<string, Record<string, number>>;
  for (const [m, u] of Object.entries(mu)) {
    const x = statsTokens[m];
    if (!x || !x[0] || !x[1]) continue;
    const share = x[0] / x[1], f = factorOf(m);
    // the daily figures have no split by token type, so the model's lifetime split is used
    const raw: Usage = { input: (u.inputTokens || 0) * share, output: (u.outputTokens || 0) * share, cw5: (u.cacheCreationInputTokens || 0) * share, cw1: 0, cr: (u.cacheReadInputTokens || 0) * share };
    const fixed: Usage = { input: raw.input / f, output: raw.output / f, cw5: raw.cw5 / f, cw1: 0, cr: raw.cr / f };
    const c = costOf(m, fixed) || 0;
    soCost += c; soRaw += costOf(m, raw) || 0;
    const row = models[m] || (models[m] = { ...emptyUsage(), cost: 0 });
    addUsage(row, fixed); row.cost += c;
  }
  for (const d of onlyStats) {
    const row: Record<string, number> = {};
    for (const [m, v] of Object.entries(d.tokensByModel)) row[m] = v / factorOf(m);
    daily[d.date] = row;
  }

  // sessions started per hour: Claude Code's counts up to its last computation, ours after that
  const hourCounts: Record<string, number> = { ...((st && st.hourCounts) || {}) as Record<string, number> };
  let sessions = scanner.sessions.length;
  for (const d of ((st && st.dailyActivity) || []) as { date: string; sessionCount: number }[]) if (!firstTxDay || d.date < firstTxDay) sessions += d.sessionCount || 0;
  for (const s of scanner.sessions) {
    if (!s.firstTs || (lastComputed && localDay(s.firstTs) <= lastComputed)) continue;
    const h = String(new Date(s.firstTs).getHours());
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }

  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_HOME, 'settings.json'), 'utf8')); } catch { /* none */ }
  let lastCleanup: string | null = null;
  try { lastCleanup = fs.readFileSync(path.join(CLAUDE_HOME, '.last-cleanup'), 'utf8').trim(); } catch { /* none */ }
  if (!firstTx && !st) return { available: false, file };
  const firstDay = (st && (st.firstSessionDate as string)) || firstTx;
  return {
    available: true, file, statsAvailable: !!st, lastComputedDate: lastComputed, firstDay,
    cost: txCost + soCost, estimate: estimate + soCost, reportedUsed,
    tx: { cost: txCost, files: scanner.stats.files, from: firstTx, to: lastTx },
    statsOnly: { cost: soCost, raw: soRaw, days: onlyStats.length, from: onlyStats[0]?.date || null, to: onlyStats[onlyStats.length - 1]?.date || null, factor: overall },
    // Claude Code's own pick (its message count); ours is first→last message, which a resumed session stretches
    sessions, calls, longestSession: (st && (st.longestSession as Lifetime['longestSession'])) || longest, hourCounts,
    daily: Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])).map(([date, tokensByModel]) => ({ date, tokensByModel, fromStats: !firstTxDay || date < firstTxDay })),
    models: Object.entries(models).map(([model, u]) => ({ model, short: shortModel(model), ...u })).sort((a, b) => b.cost - a.cost),
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
