'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { useApi, useApp } from '@/lib/app-context';
import { usd, pct, num, tok, dur } from '@/lib/format';
import type { Overview, Breakdown } from '@/lib/types';
import { Card, Empty, Warn, Info, Table, Th, Td } from './ui';
import { CategoryBars, HeavyTable, BucketsTable } from './tables';

export default function BurnView() {
  const { t } = useT();
  const { openSession } = useApp();
  const project = useSearchParams().get('project');
  const bd = useApi<Breakdown>('/api/breakdown', { project });
  const ov = useApi<Overview>('/api/overview', { project });
  if (bd.error || ov.error) return <Warn>{t('common.error', { msg: bd.error || ov.error || '' })}</Warn>;
  if (!bd.data || !ov.data) return <Empty>{t('common.loading')}</Empty>;
  const b = bd.data, tt = ov.data.totals;
  const pname = project && ov.data.projects[0] ? ov.data.projects[0].name : null;
  const html = (s: string) => <span dangerouslySetInnerHTML={{ __html: s }} />;

  return (
    <>
      {project && <div className="text-muted text-[13px] mb-2"><Link href="/" className="text-accent">{t('nav.overview')}</Link> › <Link href={`/project/${encodeURIComponent(project)}`} className="text-accent">{pname || project}</Link> › {t('burn.crumb')}</div>}
      <h2 className="text-xl font-semibold">{pname ? t('burn.titleFor', { project: pname }) : t('burn.title')}</h2>
      <p className="lead text-ink-2 mb-3.5">{html(t('burn.lead', { attributed: usd(b.attributed), total: usd(b.total), pct: pct(b.attributed, b.total) }))}</p>

      <div className="grid gap-3.5 lg:[grid-template-columns:minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={t('burn.byCategory')}><CategoryBars bd={b} /></Card>
        <Card title={t('burn.quickFacts')}>
          <Table><tbody>
            <Fact k={t('burn.facts.total')} v={<strong>{usd(b.total)}</strong>} />
            <Fact k={t('burn.facts.sub')} v={`${usd(b.total - b.totalMain)} (${pct(b.total - b.totalMain, b.total)})`} />
            <Fact k={<>{t('burn.facts.cr')}<Info k="cacheread" /></>} v={`${usd(tt.crCost)} (${pct(tt.crCost, tt.cost)})`} />
            <Fact k={<>{t('burn.facts.misses')}<Info k="misses" /></>} v={`${tt.misses} · ≈ ${usd(tt.missCost)}`} />
            <Fact k={<>{t('burn.facts.think')}<Info k="think" /></>} v={t('burn.facts.thinkVal', { n: tok(b.think), pct: pct(b.think, b.output) })} />
            <Fact k={t('burn.facts.efforts')} v={Object.entries(b.efforts).map(([e, n]) => `${e}: ${num(n)}`).join(' · ') || '—'} />
            <Fact k={<>{t('burn.facts.startup')}<Info k="startup" /></>} v={t('burn.facts.startupVal', { n: tok(b.avgStartup) })} />
            <Fact k={t('burn.facts.sessions')} v={b.sessions} />
          </tbody></Table>
        </Card>
      </div>

      <Card title={<>{t('burn.buckets')} <span className="text-muted text-xs font-normal">{t('burn.bucketsHint')}</span></>}><BucketsTable bd={b} /></Card>

      <div className="grid gap-3.5 lg:[grid-template-columns:minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={<>{t('burn.subruns')}<Info k="subagents" /></>}>
          {b.subRuns.length ? (
            <Table>
              <thead><tr><Th label={t('col.agentType')} /><Th label={t('col.runs')} num /><Th label={t('col.calls')} num /><Th label={t('col.tokensIn')} num /><Th label={t('col.cost')} num /></tr></thead>
              <tbody>{b.subRuns.map((r) => <tr key={r.type}><Td>{r.type}</Td><Td num>{r.runs}</Td><Td num>{r.calls}</Td><Td num>{tok(r.tokens)}</Td><Td num><strong>{usd(r.cost)}</strong></Td></tr>)}</tbody>
            </Table>
          ) : <div className="text-muted text-xs">{t('common.none')}</div>}
        </Card>
        <Card title={t('burn.commands')}>
          {b.commands.length ? (
            <Table>
              <thead><tr><Th label={t('col.command')} /><Th label={t('col.times')} num /></tr></thead>
              <tbody>{b.commands.map((c) => <tr key={c.command}><Td className="font-mono ltr">{c.command}</Td><Td num>{c.count}</Td></tr>)}</tbody>
            </Table>
          ) : <div className="text-muted text-xs">{t('common.noneRecorded')}</div>}
        </Card>
      </div>

      <Card title={<>{t('burn.heavy')}<Info k="carry" /></>}>
        <p className="text-ink-2 text-xs mb-2">{t('burn.heavyLead')}</p>
        <div className="max-h-[70vh] overflow-auto"><HeavyTable rows={b.heavy} withSession /></div>
      </Card>

      <div className="grid gap-3.5 lg:[grid-template-columns:1fr_1fr]">
        <Card title={<>{t('burn.long')}<Info k="ctx" /></>}>
          <p className="text-ink-2 text-xs mb-2">{t('burn.longLead')}</p>
          {b.longSessions.length ? (
            <Table>
              <thead><tr><Th label={t('col.session')} /><Th label={t('col.avgCtx')} num /><Th label={t('col.peak')} num /><Th label={t('col.calls')} num /><Th label={t('col.crCost')} num /><Th label={t('col.cost')} num /></tr></thead>
              <tbody>{b.longSessions.map((l) => (
                <tr key={l.id} onClick={() => openSession(l.id)} className="cursor-pointer hover:bg-surface-2">
                  <Td className="max-w-[300px] text-xs"><div className="truncate" title={l.title}>{l.title}</div><span className="text-muted">{l.project} · {dur(l.wallMs)} · {t('col.compactions', { n: l.resets })}</span></Td>
                  <Td num>{tok(l.avgCtx)}</Td><Td num>{tok(l.peakCtx)}</Td><Td num>{l.calls}</Td><Td num>{usd(l.crCost)}</Td><Td num><strong>{usd(l.cost)}</strong></Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <div className="text-muted text-xs">{t('common.none')}</div>}
        </Card>
        <Card title={<>{t('burn.misses')}<Info k="misses" /></>}>
          <p className="text-ink-2 text-xs mb-2">{t('burn.missesLead')}</p>
          {b.missSessions.length ? (
            <Table>
              <thead><tr><Th label={t('col.session')} /><Th label={t('col.misses')} num /><Th label={t('col.missCost')} num /><Th label={t('col.sessionCost')} num /></tr></thead>
              <tbody>{b.missSessions.map((l) => (
                <tr key={l.id} onClick={() => openSession(l.id)} className="cursor-pointer hover:bg-surface-2">
                  <Td className="max-w-[300px] text-xs"><div className="truncate" title={l.title}>{l.title}</div><span className="text-muted">{l.project}</span></Td>
                  <Td num>{l.misses}</Td><Td num>{usd(l.missCost)}</Td><Td num>{usd(l.cost)}</Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <div className="text-muted text-xs">{t('common.none')}</div>}
        </Card>
      </div>
    </>
  );
}

function Fact({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <tr><Td>{k}</Td><Td num>{v}</Td></tr>;
}
