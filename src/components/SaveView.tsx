'use client';

import { useT } from '@/lib/i18n';
import { useApi } from '@/lib/app-context';
import { usd, pct, num, tok, dt, dFull, parseDay } from '@/lib/format';
import type { Overview, Breakdown, Lifetime } from '@/lib/types';
import { Empty, Warn } from './ui';
import SettingsCard from './SettingsCard';

type Level = 'hot' | 'warn' | 'note' | 'good';
interface Finding { level: Level; impact: string; title: string; body: string; tips: string[] }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const BORDER: Record<Level, string> = { hot: 'border-s-s8', warn: 'border-s-s4', note: 'border-s-s7', good: 'border-s-s3' };

export default function SaveView() {
  const { t, tl, locale } = useT();
  const ov = useApi<Overview>('/api/overview');
  const bd = useApi<Breakdown>('/api/breakdown');
  const lt = useApi<Lifetime>('/api/lifetime');
  const err = ov.error || bd.error || lt.error;
  if (err) return <Warn>{t('common.error', { msg: err })}</Warn>;
  if (!ov.data || !bd.data || !lt.data) return <Empty>{t('common.analysing')}</Empty>;

  const o = ov.data, b = bd.data, l = lt.data;
  const tt = o.totals, total = tt.cost || 1;
  const cat = (name: string) => b.categories.find((c) => c.category === name) || { total: 0, ctxTokens: 0, calls: 0, carryCost: 0 };
  const cmdCount = (c: string) => (b.commands.find((x) => x.command === c) || {}).count || 0;
  const tips = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => t(`${prefix}.tip${i + 1}`));
  const F: Finding[] = [];

  const longCost = b.longSessions.reduce((a, x) => a + x.cost, 0);
  const longCr = b.longSessions.reduce((a, x) => a + x.crCost, 0);
  if (tt.crCost / total > 0.4) F.push({ level: 'hot', impact: usd(tt.crCost), title: t('f.long.title', { pct: pct(tt.crCost, total) }),
    body: t('f.long.body', { detail: b.longSessions.length ? t('f.long.detail', { n: b.longSessions.length, cr: usd(longCr), cost: usd(longCost), ctx: tok(b.longSessions[0].avgCtx), title: esc(b.longSessions[0].title) }) : '' }),
    tips: tips('f.long', 4) });

  if (tt.missCost > 5) F.push({ level: 'hot', impact: usd(tt.missCost), title: t('f.miss.title', { n: tt.misses }),
    body: t('f.miss.body', { model: cmdCount('/model'), title: esc(b.missSessions[0]?.title || ''), misses: b.missSessions[0]?.misses || 0, cost: usd(b.missSessions[0]?.missCost || 0) }),
    tips: tips('f.miss', 4) });

  const opus = Object.values(b.whatIf);
  if (opus.length) {
    const cur = opus.reduce((a, v) => a + v.current, 0), son = opus.reduce((a, v) => a + (v.asSonnet || 0), 0);
    F.push({ level: 'warn', impact: usd(cur - son), title: t('f.model.title', { pct: pct(cur, total), son: usd(son), cur: usd(cur) }), body: t('f.model.body', { model: esc(l.settingsModel || 'not set') }), tips: tips('f.model', 3) });
  }

  if (b.think / Math.max(1, b.output) > 0.15) F.push({ level: 'warn', impact: usd(b.think / 1e6 * 25 * 0.5), title: t('f.think.title', { pct: pct(b.think, b.output) }),
    body: t('f.think.body', { n: tok(b.think), efforts: Object.entries(b.efforts).map(([e, n]) => `${e} ${pct(n, tt.turns)}`).join(', ') }), tips: tips('f.think', 3) });

  const shell = cat('Shell commands');
  if (shell.total / total > 0.1) F.push({ level: 'warn', impact: usd(shell.carryCost * 0.5), title: t('f.shell.title', { cost: usd(shell.total), pct: pct(shell.total, total) }),
    body: t('f.shell.body', { n: num(shell.calls), tokens: tok(shell.ctxTokens), per: tok(shell.ctxTokens / Math.max(1, shell.calls)), carry: usd(shell.carryCost) }), tips: tips('f.shell', 4) });

  const rd = cat('Reading & searching code'), ed = cat('Editing files');
  if (rd.total + ed.total > total * 0.15) F.push({ level: 'warn', impact: usd((rd.carryCost + ed.carryCost) * 0.3), title: t('f.files.title', { cost: usd(rd.total + ed.total), pct: pct(rd.total + ed.total, total) }),
    body: t('f.files.body', { rd: tok(rd.ctxTokens), ed: tok(ed.ctxTokens), max: tok((b.heavy.find((h) => h.name === 'Read') || {}).tokens || 0) }), tips: tips('f.files', 4) });

  const su = cat('Session startup');
  if (b.avgStartup > 25000) F.push({ level: 'warn', impact: usd(su.total), title: t('f.startup.title', { n: tok(b.avgStartup) }),
    body: t('f.startup.body', { cost: usd(su.total), projects: [...o.projects].sort((x, y) => y.avgStartup - x.avgStartup).slice(0, 3).map((p) => `${esc(p.name)} (${tok(p.avgStartup)})`).join(', ') }), tips: tips('f.startup', 3) });
  else F.push({ level: 'good', impact: tok(b.avgStartup), title: t('f.startupOk.title', { n: tok(b.avgStartup) }), body: t('f.startupOk.body', { cost: usd(su.total) }), tips: [] });

  const skills = b.buckets.filter((x) => x.key.startsWith('skill:') || x.key.startsWith('command:')).slice(0, 5);
  const mcps = b.buckets.filter((x) => x.key.startsWith('mcp:')).slice(0, 5);
  if (skills.length || mcps.length) F.push({ level: 'note', impact: usd(cat('Skills & commands').total + cat('MCP servers').total), title: t('f.skills.title'),
    body: (skills.length ? t('f.skills.skills', { list: skills.map((x) => t('f.skills.skillItem', { label: esc(tl(x.label)), cost: usd(x.total), uses: x.calls, per: tok(x.ctxTokens / Math.max(1, x.calls)) })).join(' · ') }) + ' ' : '')
      + (mcps.length ? t('f.skills.mcp', { list: mcps.map((x) => t('f.skills.mcpItem', { label: esc(tl(x.label)), cost: usd(x.total), calls: x.calls })).join(' · ') }) : ''),
    tips: tips('f.skills', 3) });

  const sub = b.total - b.totalMain;
  if (sub / total > 0.05) F.push({ level: 'note', impact: usd(sub), title: t('f.sub.title', { cost: usd(sub), pct: pct(sub, total) }),
    body: t('f.sub.body', { list: b.subRuns.map((r) => t('f.sub.item', { runs: r.runs, type: esc(r.type), cost: usd(r.cost) })).join(', ') }), tips: tips('f.sub', 3) });

  const days = l.cleanupPeriodDays || 30;
  F.push({ level: days <= 30 ? 'warn' : 'good', impact: t('f.retention.days', { n: days }), title: t('f.retention.title', { days }),
    body: t('f.retention.body', { first: dFull(l.firstDay, locale), firstTx: o.byDay[0] ? dFull(parseDay(o.byDay[0].day), locale) : '?', last: l.lastCleanup ? dt(l.lastCleanup, locale) : '?', archived: t('common.archived') }),
    tips: tips('f.retention', 1) });

  const order: Record<Level, number> = { hot: 0, warn: 1, note: 2, good: 3 };
  F.sort((a, c) => order[a.level] - order[c.level]);

  return (
    <>
      <h2 className="text-xl font-semibold">{t('save.title')}</h2>
      <p className="lead text-ink-2 mb-3.5">{t('save.lead', { cost: usd(tt.cost), n: tt.sessions })}</p>
      {F.map((f, i) => (
        <div key={i} className={`finding bg-surface border border-line border-s-4 rounded-lg px-3.5 py-3 my-2.5 ${BORDER[f.level]}`}>
          <span className="float-end font-semibold text-base ms-3" title={t('save.impactHint')}>{f.impact}</span>
          <h3 className="text-[15px] font-semibold mb-1">{f.title}</h3>
          <p dangerouslySetInnerHTML={{ __html: f.body }} />
          {f.tips.length > 0 && <ul>{f.tips.map((x, j) => <li key={j} dangerouslySetInnerHTML={{ __html: x }} />)}</ul>}
        </div>
      ))}
      <SettingsCard />
      <section className="prose bg-surface border border-line rounded-xl p-4 mt-4 leading-relaxed">
        <h2 className="text-sm font-semibold">{t('guide.title')}</h2>
        <div className="prose-cols" dangerouslySetInnerHTML={{ __html: t('guide.html', { perDay: usd(tt.cost / (o.byDay.length || 1)) }) }} />
      </section>
    </>
  );
}
