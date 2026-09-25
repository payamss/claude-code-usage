'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useApp } from '@/lib/app-context';
import { usd, pct, tok, dur, dt, dtShort, fmtTick } from '@/lib/format';
import { shortModel } from '@/lib/models';
import type { SessionDetail } from '@/lib/types';
import { Info, Table, Th, Td, Chip, Pill, Empty } from './ui';
import { LineChart } from './charts';
import { HeavyTable } from './tables';

export default function SessionDrawer() {
  const { t, tl, locale, dir } = useT();
  const { sessionId, closeSession } = useApp();
  const [d, setD] = useState<SessionDetail | null>(null);

  useEffect(() => {
    if (!sessionId) { setD(null); return; }
    let alive = true;
    fetch('/api/session/' + encodeURIComponent(sessionId)).then((r) => r.json()).then((x) => { if (alive) setD(x); });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSession(); };
    document.addEventListener('keydown', esc);
    return () => { alive = false; document.removeEventListener('keydown', esc); };
  }, [sessionId, closeSession]);

  const open = !!sessionId;
  const side = dir === 'rtl' ? 'left-0 border-e' : 'right-0 border-s';
  const hidden = dir === 'rtl' ? '-translate-x-full' : 'translate-x-full';

  return (
    <>
      <div onClick={closeSession} className={`fixed inset-0 bg-black/35 z-[25] ${open ? '' : 'hidden'}`} />
      <aside className={`fixed top-0 ${side} h-screen w-[min(760px,100vw)] bg-surface border-line shadow-pop z-30 overflow-auto px-4.5 pt-4 pb-10 transition-transform ${open ? '' : hidden}`}>
        <button type="button" onClick={closeSession} className="absolute top-3 end-3 px-2 py-1 rounded-md border border-line bg-surface hover:bg-surface-2">✕</button>
        {!d ? <Empty>{t('common.loading')}</Empty> : <Body d={d} />}
      </aside>
    </>
  );

  function Body({ d }: { d: SessionDetail }) {
    const u = d.usage, a = d.analysis, total = d.cost || 1;
    const kv: [string, React.ReactNode][] = [
      [t('dr.cost'), usd(d.cost)], [t('dr.reported'), d.reported != null ? usd(d.reported) : '—'],
      [t('dr.started'), dt(d.firstTs, locale)], [t('dr.last'), dt(d.lastTs, locale)],
      [t('dr.wall'), dur(d.wallMs)], [t('dr.api'), dur(d.apiMs)],
      [t('dr.calls'), `${d.turnCount}${d.subagents ? ' ' + t('dr.callsSub', { n: d.subagents }) : ''}`], [t('dr.tools'), d.toolCalls],
      [t('dr.prompts'), d.prompts.length], [t('dr.lines'), d.linesAdded != null ? `+${d.linesAdded} / −${d.linesRemoved}` : '—'],
      [t('dr.ctx'), `${tok(a.avgCtx)} / ${tok(a.peakCtx)}`], [t('dr.startup'), tok(a.startupTokens)],
      [t('dr.misses'), `${a.misses} (≈ ${usd(a.missCost)})`], [t('dr.compactions'), a.resets],
      [t('dr.output'), t('dr.outputVal', { n: tok(u.output), pct: pct(d.think, u.output) })], [t('dr.cr'), `${tok(u.cr)} = ${usd(a.crCost)}`],
      [t('dr.cw'), `${tok(u.cw5)} / ${tok(u.cw1)}`], [t('dr.effort'), Object.entries(d.efforts || {}).map(([e, n]) => `${e} ×${n}`).join(', ') || '—'],
      [t('dr.version'), d.version || '—'], [t('dr.branch'), d.gitBranch || '—'],
    ];
    const calls = a.calls.filter((c) => c.ts);
    const ctxPts = calls.map((c) => ({ t: Date.parse(c.ts), v: c.ctx, tip: `<strong>${dt(c.ts, locale)}</strong><table><tr><td>${t('tip.context')}</td><td class="num"><strong>${tok(c.ctx)}</strong></td></tr><tr><td>${t('tip.newTokens')}</td><td class="num">${tok(c.newTok)}</td></tr><tr><td>${t('tip.output')}</td><td class="num">${tok(c.out)} (${tok(c.think)} ${t('common.thinking')})</td></tr><tr><td>${t('tip.thisCall')}</td><td class="num">${usd(c.cost, 4)}</td></tr><tr><td>${t('tip.model')}</td><td>${shortModel(c.model)}</td></tr>${c.miss ? `<tr><td colspan=2>${t('tip.cacheMiss')}</td></tr>` : ''}${c.reset ? `<tr><td colspan=2>${t('tip.compaction')}</td></tr>` : ''}</table>` }));
    const ctxDots = calls.filter((c) => c.miss || c.reset).map((c) => ({ t: Date.parse(c.ts), v: c.ctx, color: c.reset ? 'var(--s3)' : 'var(--s2)', title: c.reset ? t('dot.compaction') : t('dot.miss') }));
    const turns = d.turns.filter((x) => x.ts);
    const cumPts = turns.map((x) => ({ t: Date.parse(x.ts), v: x.cum, tip: `<strong>${dt(x.ts, locale)}</strong><table><tr><td>${t('tip.cumulative')}</td><td class="num"><strong>${usd(x.cum)}</strong></td></tr><tr><td>${t('tip.thisCall')}</td><td class="num">${usd(x.cost, 4)}</td></tr><tr><td>${t('tip.model')}</td><td>${shortModel(x.model)}${x.sub ? ' ' + t('tip.subagent') : ''}</td></tr><tr><td>${t('tip.outCr')}</td><td class="num">${tok(x.output)} / ${tok(x.cr)}</td></tr></table>` }));
    const cumDots = turns.filter((x) => x.sub).map((x) => ({ t: Date.parse(x.ts), v: x.cum, color: 'var(--s2)', title: t('common.subagentCall') }));
    const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-xs text-muted mt-3.5 mb-1.5 flex items-center gap-1">{children}</h3>;
    return (
      <>
        <h2 className="text-base font-semibold pe-8">{d.title}{d.archived && <Pill warn>{t('common.archived')}</Pill>}</h2>
        <div className="text-xs text-ink-2"><Link href={`/project/${encodeURIComponent(d.projectKey)}`} onClick={closeSession} className="text-accent">{d.project}</Link> · <span className="font-mono ltr">{d.id}</span></div>
        <div className="text-xs text-muted font-mono ltr mt-0.5 break-all">{d.file}</div>
        <div className="grid gap-2 my-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          {kv.map(([l, v]) => <div key={l} className="bg-surface-2 rounded-lg px-2.5 py-2"><div className="text-[11px] text-muted">{l}</div><div className="font-semibold">{v}</div></div>)}
        </div>
        {d.reported == null && <div className="text-xs text-muted -mt-1 mb-3">{t('dr.unloggedNote')}</div>}
        <H>{t('dr.ctxChart')}<Info k="ctx" /><span className="text-muted">{t('dr.ctxChartHint')}</span></H>
        <LineChart points={ctxPts} dots={ctxDots} color="var(--s7)" yFmt={(v) => tok(v)} startLabel={dtShort(calls[0]?.ts, locale)} endLabel={dtShort(calls[calls.length - 1]?.ts, locale)} emptyText={t('common.notEnough')} />
        <H>{t('dr.cum')}</H>
        <LineChart points={cumPts} dots={cumDots} color="var(--s1)" yFmt={(v) => '$' + fmtTick(v)} startLabel={dtShort(turns[0]?.ts, locale)} endLabel={dtShort(turns[turns.length - 1]?.ts, locale)} emptyText={t('common.notEnough')} />
        <H>{t('dr.where')}<Info k="carry" /></H>
        <div className="max-h-[320px] overflow-auto">
          <Table>
            <thead><tr><Th label={t('col.what')} /><Th label={t('col.uses')} num /><Th label={t('col.tokensIn')} num /><Th label={t('col.ingest')} num info="ingest" /><Th label={t('col.carry')} num info="carry" /><Th label={t('col.outputCost')} num info="outcost" /><Th label={t('col.total')} num /><Th label={t('col.share')} num /></tr></thead>
            <tbody>{a.buckets.map((b) => <tr key={b.key}><Td className="text-xs">{tl(b.label)}</Td><Td num>{b.calls || ''}</Td><Td num>{tok(b.ctxTokens)}</Td><Td num>{usd(b.ingestCost)}</Td><Td num>{usd(b.carryCost)}</Td><Td num>{usd(b.outCost)}</Td><Td num><strong>{usd(b.total)}</strong></Td><Td num>{pct(b.total, total)}</Td></tr>)}</tbody>
          </Table>
        </div>
        {a.heavy.length > 0 && <><H>{t('dr.heavy')}</H><HeavyTable rows={a.heavy.slice(0, 8)} /></>}
        <H>{t('dr.byModel')}</H>
        <Table>
          <thead><tr><Th label={t('col.model')} /><Th label={t('col.cost')} num /><Th label={t('col.calls')} num /><Th label={t('col.output')} num /><Th label={t('col.cacheRead')} num /><Th label={t('col.cacheWrite')} num /><Th label={t('col.input')} num /></tr></thead>
          <tbody>{d.byModel.map((m) => <tr key={m.model}><Td><Chip model={m.model} /></Td><Td num><strong>{usd(m.cost)}</strong></Td><Td num>{m.turns}</Td><Td num>{tok(m.output)}</Td><Td num>{tok(m.cr)}</Td><Td num>{tok(m.cw5 + m.cw1)}</Td><Td num>{tok(m.input)}</Td></tr>)}</tbody>
        </Table>
        {Object.keys(d.commands || {}).length > 0 && <><H>{t('dr.commands')}</H><div className="flex gap-1 flex-wrap">{Object.entries(d.commands).map(([c, n]) => <span key={c} className="text-[11px] px-1.5 py-px rounded-full border border-line text-ink-2 font-mono ltr">{c} ×{n}</span>)}</div></>}
        <H>{t('dr.prompts.title', { n: d.prompts.length })}</H>
        {d.prompts.length ? d.prompts.map((p, i) => (
          <div key={i} dir="auto" className="border-s-[3px] border-grid ps-2.5 py-1 my-1.5 whitespace-pre-wrap break-words text-[13px]"><span className="block text-[11px] text-muted mb-0.5">{dt(p.ts, locale)}</span>{p.text}</div>
        )) : <div className="text-muted text-xs">{t('common.noneRecorded')}</div>}
      </>
    );
  }
}
