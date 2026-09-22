'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { useT, LANGS, type Lang } from '@/lib/i18n';
import { isoLocal } from '@/lib/format';
import { Btn } from './ui';

const NAV = [
  { href: '/', key: 'nav.overview', match: (p: string) => p === '/' || p.startsWith('/project') },
  { href: '/burn', key: 'nav.burn', match: (p: string) => p.startsWith('/burn') },
  { href: '/save', key: 'nav.save', match: (p: string) => p.startsWith('/save') },
  { href: '/lifetime', key: 'nav.lifetime', match: (p: string) => p.startsWith('/lifetime') },
  { href: '/help', key: 'nav.help', match: (p: string) => p.startsWith('/help') },
  { href: '/settings', key: 'nav.settings', match: (p: string) => p.startsWith('/settings') },
];

const RANGES = ['all', 'today', '7', '30', 'month'] as const;
const RANGE_KEYS: Record<string, string> = { all: 'range.all', today: 'range.today', '7': 'range.7d', '30': 'range.30d', month: 'range.month' };

export default function Header() {
  const path = usePathname();
  const { t, lang, setLang } = useT();
  const { range, setRange, rescan, rescanning, toggleTheme } = useApp();
  const [preset, setPreset] = usePreset();
  // the date range only drives the data pages
  const showRange = !['/help', '/settings'].some((p) => path.startsWith(p));

  const pick = (r: string) => {
    const now = new Date();
    let from: string | null = null, to: string | null = null;
    if (r === 'today') from = to = isoLocal(now);
    else if (r === 'month') from = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
    else if (r !== 'all') { const d = new Date(now); d.setDate(d.getDate() - (Number(r) - 1)); from = isoLocal(d); }
    setPreset(r); setRange({ from, to });
  };

  return (
    <header className="sticky top-0 z-20 bg-page border-b border-line flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3 mb-3.5">
      <h1 className="text-lg font-semibold"><Link href="/">Claude Code Usage</Link></h1>
      <nav className="flex gap-0.5 flex-wrap">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`text-[13px] px-2.5 py-1.5 rounded-md ${n.match(path) ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}>{t(n.key)}</Link>
        ))}
      </nav>
      <span className="flex-1" />
      <div className={`flex gap-1 flex-wrap items-center ${showRange ? '' : 'hidden'}`}>
        {RANGES.map((r) => <Btn key={r} active={preset === r} onClick={() => pick(r)}>{t(RANGE_KEYS[r])}</Btn>)}
        <input type="date" value={range.from || ''} onChange={(e) => { setPreset(''); setRange({ ...range, from: e.target.value || null }); }} className="text-[13px] px-1.5 py-1 rounded-md border border-line bg-surface" />
        <span className="text-muted">→</span>
        <input type="date" value={range.to || ''} onChange={(e) => { setPreset(''); setRange({ ...range, to: e.target.value || null }); }} className="text-[13px] px-1.5 py-1 rounded-md border border-line bg-surface" />
      </div>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t('settings.language')}
        className="text-[13px] px-1.5 py-1 rounded-md border border-line bg-surface text-ink"
      >
        {(Object.keys(LANGS) as Lang[]).map((l) => (
          <option key={l} value={l}>{LANGS[l]._meta?.name || l}</option>
        ))}
      </select>
      <Btn onClick={toggleTheme} title={t('btn.theme')}>◐</Btn>
      <Btn onClick={rescan} title={t('btn.rescanHint')}>{rescanning ? t('common.rescanning') : t('btn.rescan')}</Btn>
    </header>
  );
}

import { useState } from 'react';
function usePreset() { return useState<string>('all'); }
