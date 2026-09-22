'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { SettingsState, EditableKey } from '@/lib/settings';
import { Card, Btn, Info } from './ui';

/**
 * Edits the handful of ~/.claude/settings.json keys that change what this
 * dashboard measures, so nobody has to hand-edit the file.
 */
export default function SettingsCard() {
  const { t } = useT();
  const [s, setS] = useState<SettingsState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { fetch('/api/settings').then((r) => r.json()).then(setS).catch(() => setS(null)); }, []);

  const apply = useCallback(async (key: EditableKey, value: number | string | null) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [key]: value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      setS(j);
      setMsg({ ok: true, text: t('settings.saved') });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }, [t]);

  if (!s) return null;
  const ttl = (key: EditableKey) => (
    <div className="flex gap-1.5 flex-wrap">
      {(['5m', '1h'] as const).map((v) => <Btn key={v} active={s.values[key] === v} onClick={() => apply(key, v)}>{v}</Btn>)}
      <Btn active={s.values[key] === undefined} onClick={() => apply(key, null)}>{t('settings.default')}</Btn>
    </div>
  );

  return (
    <Card title={<>{t('settings.title')} <span className="text-muted text-xs font-normal ltr">{s.file}</span></>}>
      <p className="lead text-ink-2 text-[13px] mb-3">{t('settings.lead')}</p>
      {!s.writable && <p className="text-s4 text-[13px] mb-3">{t('settings.readonly')}</p>}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Row label={<>cleanupPeriodDays<Info k="retention" /></>} value={s.values.cleanupPeriodDays ?? `${s.defaults.cleanupPeriodDays} (${t('settings.default')})`} hint={t('settings.retentionHint')}>
          <div className="flex gap-1.5 flex-wrap">
            {[30, 90, 365, 3650].map((d) => <Btn key={d} active={s.values.cleanupPeriodDays === d} onClick={() => apply('cleanupPeriodDays', d)}>{t('f.retention.days', { n: d })}</Btn>)}
          </div>
        </Row>
        <Row label={<>promptCacheTtl<Info k="misses" /></>} value={s.values.promptCacheTtl ?? t('settings.default')} hint={t('settings.ttlHint')}>{ttl('promptCacheTtl')}</Row>
        <Row label={<>subagentPromptCacheTtl<Info k="subagents" /></>} value={s.values.subagentPromptCacheTtl ?? t('settings.default')} hint={t('settings.subTtlHint')}>{ttl('subagentPromptCacheTtl')}</Row>
      </div>
      <div className="text-xs mt-3 flex items-center gap-2">
        {busy && <span className="text-muted">{t('settings.saving')}</span>}
        {msg && <span className={msg.ok ? 'text-s3' : 'text-s8'}>{msg.text}</span>}
        <span className="text-muted">{t('settings.restart')}</span>
      </div>
    </Card>
  );
}

function Row({ label, value, hint, children }: { label: React.ReactNode; value: React.ReactNode; hint: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2.5">
      <div className="font-mono text-[13px] flex items-center">{label}</div>
      <div className="text-xs text-ink-2 my-1">{hint}</div>
      <div className="text-xs text-muted mb-2">= <strong className="text-ink">{value}</strong></div>
      {children}
    </div>
  );
}
