'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useApp } from '@/lib/app-context';
import { dt } from '@/lib/format';
import { shortModel } from '@/lib/models';
import type { PriceRow } from '@/lib/pricing';
import { Card, Btn, Table, Th, Td, Chip, Empty, Info } from './ui';

interface PriceState {
  models: Record<string, PriceRow>;
  builtinUpdated: string;
  fetchedAt: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  changed: string[];
  file: string;
  sources: { id: string; name: string; url: string; home: string }[];
}
interface RefreshResult extends PriceState { ok: boolean; error?: string; found: number; added: string[]; updated: string[] }

/** Shows the price table, where it came from, and lets the user refresh it. */
export default function PricesCard() {
  const { t, locale } = useT();
  const { rescan } = useApp();
  const [p, setP] = useState<PriceState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { fetch('/api/prices').then((r) => r.json()).then(setP).catch(() => setP(null)); }, []);

  const post = useCallback(async (action: 'refresh' | 'reset') => {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch('/api/prices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const j = (await r.json()) as RefreshResult;
      setP(j);
      if (action === 'reset') setMsg({ ok: true, text: t('prices.wasReset') });
      else if (j.ok) setMsg({ ok: true, text: t('prices.refreshed', { found: j.found, updated: j.updated.length, added: j.added.length }) + (j.updated.length ? ' — ' + j.updated.map(shortModel).join(', ') : '') });
      else setMsg({ ok: false, text: t('prices.failed', { msg: j.error || '' }) });
      await rescan(); // every cost is recomputed with the new table
    } finally {
      setBusy(null);
    }
  }, [t, rescan]);

  const rows = p ? Object.entries(p.models).filter(([m]) => !/\d{8}$/.test(m)).sort((a, b) => b[1][1] - a[1][1]) : [];

  return (
    <Card title={<>{t('settings.pricing')}<Info k="prices" /></>}>
      <p className="lead text-ink-2 text-[13px] mb-2">{t('settings.pricing.lead')}</p>
      {!p ? <Empty>{t('common.loading')}</Empty> : (
        <>
          <div className="bg-surface-2 rounded-lg px-3 py-2.5 mb-3 text-[13px]">
            <div>
              <strong>{t('prices.inUse')}:</strong>{' '}
              {p.fetchedAt
                ? <>{p.sourceName} · <span className="text-ink-2">{t('prices.fetchedAt', { when: dt(p.fetchedAt, locale) })}</span>{p.sourceUrl && <> · <a className="text-accent ltr" href={p.sourceUrl} target="_blank" rel="noopener">{t('prices.openSource')}</a></>}</>
                : <>{t('prices.builtin')} · <span className="text-ink-2">{t('prices.builtinUpdated', { date: p.builtinUpdated })}</span></>}
            </div>
            <div className="text-ink-2 mt-1">{t('prices.how')}</div>
            <div className="flex gap-1.5 flex-wrap mt-2.5 items-center">
              <Btn onClick={() => post('refresh')}>{busy === 'refresh' ? t('prices.refreshing') : t('prices.refresh')}</Btn>
              {p.fetchedAt && <Btn onClick={() => post('reset')}>{busy === 'reset' ? t('common.rescanning') : t('prices.reset')}</Btn>}
              {msg && <span className={`text-xs ${msg.ok ? 'text-s3' : 'text-s8'}`}>{msg.text}</span>}
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <Th label={t('col.model')} /><Th label={t('col.input')} num info="input" /><Th label={t('col.output')} num info="output" />
                <Th label={t('settings.pricing.cw5')} num info="cachewrite" /><Th label={t('settings.pricing.cw1')} num info="cachewrite" /><Th label={t('col.cacheRead')} num info="cacheread" />
              </tr>
            </thead>
            <tbody>
              {rows.map(([m, row]) => (
                <tr key={m} className="hover:bg-surface-2">
                  <Td>
                    <Chip model={m} /> <span className="text-muted text-xs ltr">{m}</span>
                    {p.changed.includes(m) && <span className="text-s4 text-xs ms-1.5" title={t('prices.differsHint')}>{t('prices.differs')}</span>}
                  </Td>
                  {row.map((v, i) => <Td key={i} num>${v.toFixed(2)}</Td>)}
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-muted text-xs mt-2 ltr break-all">{p.file}</p>
        </>
      )}
    </Card>
  );
}
