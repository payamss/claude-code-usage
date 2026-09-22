'use client';

import { useEffect, useState } from 'react';
import { useT, LANGS, type Lang } from '@/lib/i18n';
import { useApp } from '@/lib/app-context';
import { dt, num } from '@/lib/format';
import PricesCard from './PricesCard';
import { Card, Btn, Table, Td, Empty } from './ui';
import SettingsCard from './SettingsCard';

interface Info {
  claudeHome: string; claudeDir: string; claudeDirExists: boolean;
  cacheFile: string; cacheSize: number; lastScan: string | null;
  stats: { files: number; parsed: number; cached: number; archived: number; ms: number };
  sessions: number; rescanSeconds: number; node: string;
}

export default function SettingsView() {
  const { t, locale, lang, setLang } = useT();
  const { rescan, rescanning, theme, setTheme, version } = useApp();
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => { fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => setInfo(null)); }, [version]);

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB';

  return (
    <>
      <h2 className="text-xl font-semibold">{t('settings.page.title')}</h2>
      <p className="lead text-ink-2 mb-3.5">{t('settings.page.lead')}</p>

      <SettingsCard />

      <div className="grid gap-3.5 lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('settings.appearance')}>
          <Row label={t('settings.language')}>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(LANGS) as Lang[]).map((l) => (
                <Btn key={l} active={lang === l} onClick={() => setLang(l)}>{LANGS[l]._meta?.name || l}</Btn>
              ))}
            </div>
          </Row>
          <Row label={t('settings.theme')}>
            <div className="flex gap-1.5 flex-wrap">
              {(['system', 'light', 'dark'] as const).map((x) => (
                <Btn key={x} active={theme === x} onClick={() => setTheme(x)}>{t('settings.theme.' + x)}</Btn>
              ))}
            </div>
          </Row>
        </Card>

        <Card title={t('settings.data')}>
          {!info ? <Empty>{t('common.loading')}</Empty> : (
            <>
              <Table>
                <tbody>
                  <KV k={t('settings.data.transcripts')} v={<span className="ltr">{info.claudeDir}</span>} bad={!info.claudeDirExists} />
                  <KV k={t('settings.data.home')} v={<span className="ltr">{info.claudeHome}</span>} />
                  <KV k={t('settings.data.cache')} v={<span className="ltr">{info.cacheFile} · {mb(info.cacheSize)}</span>} />
                  <KV k={t('settings.data.lastScan')} v={dt(info.lastScan, locale)} />
                  <KV k={t('settings.data.files')} v={t('settings.data.filesVal', { files: num(info.stats.files), parsed: num(info.stats.parsed), archived: num(info.stats.archived), ms: num(info.stats.ms) })} />
                  <KV k={t('settings.data.sessions')} v={num(info.sessions)} />
                  <KV k={t('settings.data.rescan')} v={t('settings.data.rescanVal', { n: info.rescanSeconds })} />
                  <KV k="Node" v={<span className="ltr">{info.node}</span>} />
                </tbody>
              </Table>
              <div className="mt-3"><Btn onClick={rescan}>{rescanning ? t('common.rescanning') : t('settings.data.rescanNow')}</Btn></div>
            </>
          )}
        </Card>
      </div>

      <PricesCard />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-xs text-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function KV({ k, v, bad }: { k: string; v: React.ReactNode; bad?: boolean }) {
  return <tr><Td className="text-muted text-xs whitespace-nowrap">{k}</Td><Td className={`text-xs break-all ${bad ? 'text-s8' : ''}`}>{v}</Td></tr>;
}
