'use client';

import { useT } from '@/lib/i18n';
import { useApi } from '@/lib/app-context';
import { usd, num, tok, dur, dtShort, dFull, parseDay, dDay } from '@/lib/format';
import { modelColor, shortModel, sortModels } from '@/lib/models';
import type { Lifetime } from '@/lib/types';
import { Card, Tile, Empty, Warn, Info, Table, Th, Td, Chip, Legend } from './ui';
import { StackedBars, type StackedDay } from './charts';

export default function LifetimeView() {
  const { t, locale } = useT();
  const lt = useApi<Lifetime>('/api/lifetime');
  if (lt.error) return <Warn>{t('common.error', { msg: lt.error })}</Warn>;
  if (!lt.data) return <Empty>{t('common.loading')}</Empty>;
  const l = lt.data;
  if (!l.available) return <Warn>{t('lt.missing', { file: l.file })}</Warn>;

  const days = l.daily || [];
  const so = l.statsOnly, tx = l.tx;
  const factor = so ? so.factor.toFixed(2) : '1';
  const models = sortModels([...new Set(days.flatMap((d) => Object.keys(d.tokensByModel)))]);
  const data: StackedDay[] = days.map((d) => {
    const total = Object.values(d.tokensByModel).reduce((a, b) => a + b, 0);
    const rows = Object.entries(d.tokensByModel).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<tr><td>${shortModel(m)}</td><td class="num">${tok(v)}</td></tr>`).join('');
    const src = d.fromStats ? `<tr><td colspan=2>${t('lt.dailyFromStats', { factor })}</td></tr>` : '';
    return {
      key: d.date, label: dDay(parseDay(d.date), locale), total,
      // days from stats-cache.json are drawn faded
      segments: models.map((m) => ({ color: d.fromStats ? `color-mix(in srgb, ${modelColor(m)} 45%, transparent)` : modelColor(m), value: d.tokensByModel[m] || 0 })),
      tip: `<strong>${d.date}</strong><table>${rows}<tr><td>${t('tip.total')}</td><td class="num"><strong>${tok(total)}</strong></td></tr>${src}</table>`,
    };
  });
  const hc = l.hourCounts || {}, hmax = Math.max(...Object.values(hc), 1);
  const outputSum = (l.models || []).reduce((a, m) => a + m.output, 0), crSum = (l.models || []).reduce((a, m) => a + m.cr, 0);
  const p = (html: string) => <p dangerouslySetInnerHTML={{ __html: html }} />;

  return (
    <>
      <h2 className="text-xl font-semibold flex items-center">{t('lt.title')}<Info k="lifetime" /></h2>
      <p className="lead text-ink-2 mb-3.5" dangerouslySetInnerHTML={{ __html: t('lt.lead') }} />
      <div className="prose bg-surface-2 rounded-xl px-4 py-3 mb-3.5">
        <h3 className="mt-0!">{t('lt.compare.title')}</h3>
        {tx && tx.from && p(t('lt.src.tx', { cost: usd(tx.cost), files: num(tx.files), from: dFull(tx.from, locale), to: dFull(tx.to, locale) }))}
        {so && so.days > 0 && so.from && so.to && p(t('lt.src.stats', { n: so.days, from: dFull(parseDay(so.from), locale), to: dFull(parseDay(so.to), locale), cost: usd(so.cost), raw: usd(so.raw), factor }))}
        {p(t('lt.src.reported', { n: l.reportedUsed || 0, est: usd(l.estimate || 0) }))}
        {p(l.statsAvailable ? t('lt.src.computed', { date: l.lastComputedDate || '?' }) : t('lt.src.noStats'))}
        {p(t('lt.src.archive'))}
      </div>
      <div className="grid gap-2.5 mb-3.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Tile label={t('lt.tile.cost')} info="cost" value={usd(l.cost || 0)} sub={t('lt.tile.costSub', { date: dFull(l.firstDay, locale) })} />
        <Tile label={t('lt.tile.sessions')} value={num(l.sessions || 0)} sub={t('lt.tile.sessionsSub', { n: num(l.calls || 0) })} />
        <Tile label={t('lt.tile.output')} info="output" value={tok(outputSum)} sub={t('lt.tile.outputSub', { n: tok(crSum) })} />
        <Tile label={t('lt.tile.longest')} value={dur(l.longestSession?.duration)} sub={l.longestSession ? t('lt.tile.longestSub', { n: l.longestSession.messageCount, when: dtShort(l.longestSession.timestamp, locale) }) : ''} />
        <Tile label={t('lt.tile.retention')} value={t('f.retention.days', { n: l.cleanupPeriodDays || 30 })} sub={t('lt.tile.retentionSub', { when: l.lastCleanup ? dtShort(l.lastCleanup, locale) : '?' })} />
      </div>
      <Card title={t('lt.daily')}>
        <StackedBars data={data} height={240} />
        <Legend items={models.map((m) => ({ color: modelColor(m), label: shortModel(m) }))} />
        {so && so.days > 0 && <div className="text-xs text-muted mt-1">{t('lt.dailyFaded', { factor })}</div>}
      </Card>
      <div className="grid gap-3.5 lg:[grid-template-columns:minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={t('lt.byModel')}>
          <Table>
            <thead><tr><Th label={t('col.model')} /><Th label={t('col.cost')} num /><Th label={t('col.output')} num /><Th label={t('col.cacheRead')} num /><Th label={t('col.cacheWrite')} num /><Th label={t('col.input')} num /></tr></thead>
            <tbody>{(l.models || []).map((m) => <tr key={m.model}><Td><Chip model={m.model} /></Td><Td num><strong>{m.cost ? usd(m.cost) : '—'}</strong></Td><Td num>{tok(m.output)}</Td><Td num>{tok(m.cr)}</Td><Td num>{tok(m.cw5 + m.cw1)}</Td><Td num>{tok(m.input)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card title={t('lt.hours')}>
          <div className="grid grid-cols-24 gap-[3px] items-end h-[90px]" dir="ltr">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="bg-s1 rounded-t-[3px] min-h-[2px]" style={{ height: `${((hc[h] || 0) / hmax * 100).toFixed(0)}%` }} title={t('lt.hoursHint', { h, n: hc[h] || 0 })} />)}
          </div>
          <div className="grid grid-cols-24 gap-[3px] text-[10px] text-muted text-center" dir="ltr">{Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? h : ''}</span>)}</div>
        </Card>
      </div>
    </>
  );
}
