'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { useApi } from '@/lib/app-context';
import { usd, pct, num, tok, dur } from '@/lib/format';
import type { Overview, Breakdown } from '@/lib/types';
import { Card, Tile, Empty, Warn } from './ui';
import { DailyChart, ModelTable, ProjectsTable, SessionsTable, CategoryBars, HeavyTable } from './tables';

export default function OverviewView({ project }: { project: string | null }) {
  const { t } = useT();
  const ov = useApi<Overview>('/api/overview', { project });
  const bd = useApi<Breakdown>(project ? '/api/breakdown' : null, { project });
  if (ov.error) return <Warn>{t('common.error', { msg: ov.error })}</Warn>;
  if (!ov.data) return <Empty>{t('common.loading')}</Empty>;
  const d = ov.data;
  const tt = d.totals;
  const days = d.byDay.length || 1;
  const p = project ? d.projects[0] : null;
  if (project && !p) return <><div className="text-muted text-[13px] mb-2"><Link href="/" className="text-accent">{t('nav.overview')}</Link></div><Empty>{t('project.noSessions')}</Empty></>;

  return (
    <>
      {d.unknownModels.length > 0 && <Warn>{t('common.unknownModels', { models: d.unknownModels.join(', ') })}</Warn>}
      {p && (
        <>
          <div className="text-muted text-[13px] mb-2"><Link href="/" className="text-accent">{t('nav.overview')}</Link> › {t('project.crumb')}</div>
          <h2 className="text-xl font-semibold">{p.name}</h2>
          <p className="ltr text-ink-2 text-xs font-mono mb-3.5 break-all">{p.cwd}{p.dirs.length > 1 ? ' · ' + t('project.mergedDirs', { n: p.dirs.length }) : ''}</p>
        </>
      )}
      <div className="grid gap-2.5 mb-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Tile label={t('overview.tile.cost')} info="cost" value={usd(tt.cost)} sub={t('common.perActiveDay', { cost: usd(tt.cost / days), n: days })} />
        <Tile label={t('overview.tile.crShare')} info="cacheread" value={pct(tt.crCost, tt.cost)} sub={t('overview.tile.crShareSub', { cost: usd(tt.crCost) })} />
        <Tile label={t('overview.tile.misses')} info="misses" value={num(tt.misses)} sub={t('overview.tile.missesSub', { cost: usd(tt.missCost) })} />
        <Tile label={t('overview.tile.output')} info="output" value={tok(tt.output)} sub={t('overview.tile.outputSub', { pct: pct(tt.think, tt.output), n: tok(tt.think) })} />
        <Tile label={t('overview.tile.cacheRead')} info="cacheread" value={tok(tt.cr)} sub={t('overview.tile.cacheReadSub', { cw: tok(tt.cw5 + tt.cw1), cw1: tok(tt.cw1) })} />
        <Tile label={t('overview.tile.sessions')} info="subagents" value={`${tt.sessions} / ${tt.projects}`} sub={t('overview.tile.sessionsSub', { prompts: num(tt.prompts), sub: usd(tt.subCost) })} />
        <Tile label={t('overview.tile.calls')} info="apicalls" value={num(tt.turns)} sub={t('overview.tile.callsSub', { tools: num(tt.toolCalls), per: (tt.turns / Math.max(1, tt.prompts)).toFixed(1) })} />
        <Tile label={t('overview.tile.apiTime')} info="apitime" value={dur(tt.apiMs)} sub={t('overview.tile.apiTimeSub')} />
        <Tile label={t('overview.tile.reported')} info="reported" value={tt.reportedSessions ? usd(tt.reported) : '—'} sub={tt.reportedSessions ? t('overview.tile.reportedSub', { n: tt.reportedSessions }) : t('overview.tile.reportedNone')} />
      </div>

      <Card title={t('overview.daily')}><DailyChart d={d} /></Card>

      <div className="grid gap-3.5 lg:[grid-template-columns:minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={t('overview.byModel')}><ModelTable rows={d.byModel} total={tt.cost} /></Card>
        {p ? (
          <Card title={<>{t('project.where')}</>}>
            {bd.data ? <CategoryBars bd={bd.data} /> : <Empty>{t('common.loading')}</Empty>}
            <div className="text-xs text-muted mt-2">{t('project.fullBreakdown')} <Link href={`/burn?project=${encodeURIComponent(project!)}`} className="text-accent">{t('project.fullBreakdownLink')}</Link></div>
          </Card>
        ) : (
          <Card title={<>{t('overview.byProject')} <span className="text-muted text-xs font-normal">{t('overview.byProjectHint')}</span></>}>
            <div className="max-h-[70vh] overflow-auto"><ProjectsTable rows={d.projects} /></div>
          </Card>
        )}
      </div>

      {p && bd.data && <Card title={t('project.heavy')}><HeavyTable rows={bd.data.heavy.slice(0, 12)} withSession /></Card>}

      <Card title={t('overview.sessions')}><SessionsTable rows={d.sessions} /></Card>
    </>
  );
}
