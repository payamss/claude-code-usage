'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { useApp } from '@/lib/app-context';
import { usd, pct, num, tok, dur, dtShort, parseDay, isoLocal, dDay } from '@/lib/format';
import { modelColor, shortModel } from '@/lib/models';
import type { Overview, Breakdown, BucketRow, HeavyRow, HeavyItem } from '@/lib/types';
import { Table, Th, Td, Chip, Chips, Bar, Empty, Legend, Pill, sortBy, type Sort, Btn } from './ui';
import { StackedBars, type StackedDay } from './charts';

// ---------------------------------------------------------------------------
// Daily chart with metric switch
// ---------------------------------------------------------------------------
export function DailyChart({ d }: { d: Overview }) {
  const { t, locale } = useT();
  const [metric, setMetric] = useState<'cost' | 'tokens' | 'turns'>('cost');
  const models = d.byModel.map((m) => m.model).filter((m) => m !== '<synthetic>');
  if (!d.byDay.length) return <Empty>{t('common.noData')}</Empty>;
  const first = parseDay(d.byDay[0].day), last = parseDay(d.byDay[d.byDay.length - 1].day);
  const byKey = Object.fromEntries(d.byDay.map((x) => [x.day, x]));
  const data: StackedDay[] = [];
  for (let x = new Date(first); x <= last; x.setDate(x.getDate() + 1)) {
    const key = isoLocal(x);
    const row = byKey[key] || { day: key, cost: 0, tokens: 0, turns: 0, models: {}, sessions: 0 };
    const total = metric === 'cost' ? row.cost : metric === 'tokens' ? row.tokens : row.turns;
    const segs = metric === 'cost'
      ? models.map((m) => ({ color: modelColor(m), value: row.models[m] || 0 }))
      : [{ color: 'var(--s1)', value: total }];
    const rows = Object.entries(row.models).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${modelColor(m)}"></span> ${shortModel(m)}</td><td class="num">${usd(v)}</td></tr>`).join('');
    const tip = `<strong>${parseDay(key).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><table><tr><td>${t('tip.cost')}</td><td class="num"><strong>${usd(row.cost)}</strong></td></tr>${rows}<tr><td>${t('tip.tokens')}</td><td class="num">${tok(row.tokens)}</td></tr><tr><td>${t('tip.calls')}</td><td class="num">${row.turns}</td></tr><tr><td>${t('tip.sessions')}</td><td class="num">${row.sessions}</td></tr></table>`;
    data.push({ key, label: dDay(parseDay(key), locale), total, segments: segs, tip });
  }
  return (
    <>
      <div className="flex justify-end gap-1.5 -mt-9 mb-2">
        {(['cost', 'tokens', 'turns'] as const).map((m) => <Btn key={m} active={metric === m} onClick={() => setMetric(m)}>{t(m === 'cost' ? 'overview.metric.cost' : m === 'tokens' ? 'overview.metric.tokens' : 'overview.metric.calls')}</Btn>)}
      </div>
      <StackedBars data={data} yPrefix={metric === 'cost' ? '$' : ''} />
      <Legend items={metric === 'cost' ? models.map((m) => ({ color: modelColor(m), label: shortModel(m) })) : [{ color: 'var(--s1)', label: t(metric === 'tokens' ? 'overview.legend.tokens' : 'overview.legend.calls') }]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export function ModelTable({ rows, total }: { rows: Overview['byModel']; total: number }) {
  const { t } = useT();
  return (
    <Table>
      <thead><tr><Th label={t('col.model')} /><Th label={t('col.cost')} num /><Th label={t('col.share')} num /><Th label={t('col.calls')} num info="apicalls" /><Th label={t('col.output')} num info="output" /><Th label={t('col.cacheRead')} num info="cacheread" /><Th label={t('col.cacheWrite')} num info="cachewrite" /><Th label={t('col.input')} num info="input" /></tr></thead>
      <tbody>{rows.map((m) => (
        <tr key={m.model} className="hover:bg-surface-2"><Td><Chip model={m.model} /></Td><Td num><strong>{usd(m.cost)}</strong></Td><Td num>{pct(m.cost, total)}</Td><Td num>{num(m.turns)}</Td><Td num>{tok(m.output)}</Td><Td num>{tok(m.cr)}</Td><Td num>{tok(m.cw5 + m.cw1)}</Td><Td num>{tok(m.input)}</Td></tr>
      ))}</tbody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export function ProjectsTable({ rows }: { rows: Overview['projects'] }) {
  const { t, locale } = useT();
  const [sort, setSort] = useState<Sort>({ key: 'cost', dir: -1 });
  const ps = sortBy(rows, sort);
  const max = Math.max(...ps.map((p) => p.cost), 0.01);
  return (
    <Table>
      <thead><tr>
        <Th label={t('col.project')} k="name" sort={sort} onSort={setSort} textKey /><Th label={t('col.sessions')} k="sessions" sort={sort} onSort={setSort} num /><Th label={t('col.cost')} k="cost" sort={sort} onSort={setSort} num /><Th label="" />
        <Th label={t('col.calls')} k="turns" sort={sort} onSort={setSort} num info="apicalls" /><Th label={t('col.output')} k="output" sort={sort} onSort={setSort} num info="output" /><Th label={t('col.cacheRead')} k="cr" sort={sort} onSort={setSort} num info="cacheread" /><Th label={t('col.startupCtx')} k="avgStartup" sort={sort} onSort={setSort} num info="startup" /><Th label={t('col.lastActive')} k="lastTs" sort={sort} onSort={setSort} />
      </tr></thead>
      <tbody>{ps.map((p) => (
        <tr key={p.key} className="hover:bg-surface-2">
          <Td title={p.cwd}><Link href={`/project/${encodeURIComponent(p.key)}`} className="text-accent hover:underline">{p.name}</Link><div><Chips models={Object.entries(p.models).sort((a, b) => b[1] - a[1]).map(([m]) => m)} /></div></Td>
          <Td num>{p.sessions}</Td><Td num><strong>{usd(p.cost)}</strong></Td><Td><Bar value={p.cost} max={max} /></Td>
          <Td num>{num(p.turns)}</Td><Td num>{tok(p.output)}</Td><Td num>{tok(p.cr)}</Td><Td num>{tok(p.avgStartup)}</Td><Td dim>{dtShort(p.lastTs, locale)}</Td>
        </tr>
      ))}</tbody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export function SessionsTable({ rows }: { rows: Overview['sessions'] }) {
  const { t, locale } = useT();
  const { openSession, sessionId } = useApp();
  const [sort, setSort] = useState<Sort>({ key: 'lastTs', dir: -1 });
  const [search, setSearch] = useState('');
  let list = rows;
  if (search) {
    const qq = search.toLowerCase();
    list = list.filter((s) => (s.title + ' ' + s.project + ' ' + s.id + ' ' + (s.agentName || '') + ' ' + (s.gitBranch || '')).toLowerCase().includes(qq));
  }
  list = sortBy(list, sort);
  const S = { sort, onSort: setSort };
  return (
    <>
      <div className="flex gap-2 items-center flex-wrap mb-2">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('overview.search')} className="min-w-[240px] flex-1 max-w-[420px] text-[13px] px-2.5 py-1.5 rounded-md border border-line bg-surface" />
        <span className="text-muted text-xs">{t('overview.sessionsCount', { n: list.length, cost: usd(list.reduce((a, x) => a + x.cost, 0)) })}</span>
      </div>
      {!list.length ? <Empty>{t('overview.noMatch')}</Empty> : (
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <thead><tr>
              <Th label={t('col.started')} k="firstTs" {...S} /><Th label={t('col.title')} k="title" {...S} textKey /><Th label={t('col.project')} k="project" {...S} textKey />
              <Th label={t('col.cost')} k="cost" {...S} num info="cost" /><Th label={t('col.calls')} k="turns" {...S} num info="apicalls" /><Th label={t('col.prompts')} k="prompts" {...S} num info="prompts" /><Th label={t('col.tools')} k="toolCalls" {...S} num info="toolcalls" />
              <Th label={t('col.avgCtx')} k="avgCtx" {...S} num info="ctx" /><Th label={t('col.misses')} k="misses" {...S} num info="misses" /><Th label={t('col.output')} k="usage.output" {...S} num info="output" /><Th label={t('col.cacheRead')} k="usage.cr" {...S} num info="cacheread" />
              <Th label={t('col.wall')} k="wallMs" {...S} num info="apitime" /><Th label={t('col.api')} k="apiMs" {...S} num info="apitime" /><Th label={t('col.models')} />
            </tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.id} onClick={() => openSession(x.id)} className={`cursor-pointer hover:bg-surface-2 ${sessionId === x.id ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}`}>
                <Td dim className="whitespace-nowrap">{dtShort(x.firstTs, locale)}</Td>
                <Td title={x.title} className="max-w-[380px] truncate">{x.title}{x.subagents ? <span className="text-muted text-xs"> {t('common.agents', { n: x.subagents })}</span> : null}{x.archived && <Pill warn title={t('common.archivedHint')}>{t('common.archived')}</Pill>}</Td>
                <Td dim title={x.cwd}><Link href={`/project/${encodeURIComponent(x.projectKey)}`} onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">{x.project}</Link></Td>
                <Td num><strong>{usd(x.cost)}</strong></Td><Td num>{x.turns}</Td><Td num>{x.prompts}</Td><Td num>{x.toolCalls}</Td>
                <Td num>{tok(x.avgCtx)}</Td><Td num>{x.misses || ''}</Td><Td num>{tok(x.usage.output)}</Td><Td num>{tok(x.usage.cr)}</Td>
                <Td num>{dur(x.wallMs)}</Td><Td num>{dur(x.apiMs)}</Td><Td><Chips models={x.models} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Category bars (ingest / carry / output)
// ---------------------------------------------------------------------------
export function CategoryBars({ bd }: { bd: Breakdown }) {
  const { t, tl } = useT();
  const total = bd.total || 1;
  const max = Math.max(...bd.categories.map((c) => c.total), 0.01);
  const w = (v: number) => `${(v / max * 100).toFixed(2)}%`;
  return (
    <>
      {bd.categories.map((c) => (
        <div key={c.category} className="flex items-center gap-2 my-1 text-[13px]" title={t('burn.catHint', { cat: tl(c.category), ingest: usd(c.ingestCost), carry: usd(c.carryCost), out: usd(c.outCost), tokens: tok(c.ctxTokens) })}>
          <span className="w-[260px] shrink-0 truncate">{tl(c.category)}</span>
          <span className="flex-1 h-3.5 bg-grid rounded overflow-hidden flex">
            <span className="h-full border-e-2 border-surface" style={{ width: w(c.ingestCost), background: 'var(--s3)' }} />
            <span className="h-full border-e-2 border-surface" style={{ width: w(c.carryCost), background: 'var(--s1)' }} />
            <span className="h-full border-e-2 border-surface" style={{ width: w(c.outCost), background: 'var(--s2)' }} />
          </span>
          <span className="w-[90px] text-end shrink-0 num"><strong>{usd(c.total)}</strong> <span className="text-muted text-xs">{pct(c.total, total)}</span></span>
        </div>
      ))}
      <Legend items={[{ color: 'var(--s3)', label: t('legend.ingest') }, { color: 'var(--s1)', label: t('legend.carry') }, { color: 'var(--s2)', label: t('legend.output') }]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Heaviest tool results
// ---------------------------------------------------------------------------
export function HeavyTable({ rows, withSession }: { rows: (HeavyRow | HeavyItem)[]; withSession?: boolean }) {
  const { t, tl, locale } = useT();
  const { openSession } = useApp();
  if (!rows.length) return <div className="text-muted text-xs">{t('burn.heavyNone')}</div>;
  return (
    <Table>
      <thead><tr><Th label={t('col.when')} /><Th label={t('col.tool')} />{withSession && <Th label={t('col.session')} />}<Th label={<span title={t('col.tokensHint')}>{t('col.tokens')}</span>} num /><Th label={t('col.ingest')} num info="ingest" /><Th label={t('col.carry')} num info="carry" /><Th label={t('col.total')} num /></tr></thead>
      <tbody>{rows.map((h, i) => {
        const hr = h as HeavyRow;
        return (
          <tr key={i} onClick={() => hr.session && openSession(hr.session)} className={`hover:bg-surface-2 ${hr.session ? 'cursor-pointer' : ''}`}>
            <Td dim className="whitespace-nowrap">{dtShort(h.ts, locale)}</Td>
            <Td>{h.name} <span className="text-muted text-xs">{h.label !== h.name ? tl(h.label) : ''}</span></Td>
            {withSession && <Td title={hr.title} className="max-w-[380px] truncate text-xs">{hr.title} <span className="text-muted">· {hr.project}</span></Td>}
            <Td num>{tok(h.tokens)}</Td><Td num>{usd(h.ingestCost)}</Td><Td num>{usd(h.carryCost)}</Td><Td num><strong>{usd(h.carryCost + h.ingestCost)}</strong></Td>
          </tr>
        );
      })}</tbody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// All buckets with category filter
// ---------------------------------------------------------------------------
export function BucketsTable({ bd }: { bd: Breakdown }) {
  const { t, tl } = useT();
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: 'total', dir: -1 });
  const cats = [...new Set(bd.buckets.map((b) => b.category))];
  type Row = BucketRow & { perUse: number | null; label_t: string; category_t: string };
  const rows: Row[] = (cat ? bd.buckets.filter((b) => b.category === cat) : bd.buckets).map((b) => ({ ...b, perUse: b.calls ? b.ctxTokens / b.calls : null, label_t: tl(b.label), category_t: tl(b.category) }));
  const list = sortBy(rows, sort);
  const total = bd.total || 1;
  const S = { sort, onSort: setSort };
  return (
    <>
      <div className="flex gap-1.5 flex-wrap mb-2">
        <Btn active={!cat} onClick={() => setCat(null)} className="text-xs!">{t('burn.filterAll')}</Btn>
        {cats.map((c) => <Btn key={c} active={cat === c} onClick={() => setCat(c)} className="text-xs!">{tl(c)}</Btn>)}
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <Table>
          <thead><tr>
            <Th label={t('col.what')} k="label_t" {...S} textKey /><Th label={t('col.category')} k="category_t" {...S} textKey /><Th label={t('col.uses')} k="calls" {...S} num info="toolcalls" /><Th label={t('col.tokensIn')} k="ctxTokens" {...S} num /><Th label={t('col.perUse')} k="perUse" {...S} num />
            <Th label={t('col.ingest')} k="ingestCost" {...S} num info="ingest" /><Th label={t('col.carry')} k="carryCost" {...S} num info="carry" /><Th label={t('col.outputCost')} k="outCost" {...S} num info="outcost" /><Th label={t('col.total')} k="total" {...S} num /><Th label={t('col.share')} num />
          </tr></thead>
          <tbody>{list.map((b) => (
            <tr key={b.key} className="hover:bg-surface-2"><Td>{b.label_t}</Td><Td dim>{b.category_t}</Td><Td num>{b.calls ? num(b.calls) : ''}</Td><Td num>{tok(b.ctxTokens)}</Td><Td num>{b.perUse != null ? tok(b.perUse) : ''}</Td><Td num>{usd(b.ingestCost)}</Td><Td num>{usd(b.carryCost)}</Td><Td num>{usd(b.outCost)}</Td><Td num><strong>{usd(b.total)}</strong></Td><Td num>{pct(b.total, total)}</Td></tr>
          ))}</tbody>
        </Table>
      </div>
    </>
  );
}
