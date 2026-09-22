'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocalStorage } from './storage';

export interface Range { from: string | null; to: string | null }

interface AppState {
  range: Range;
  setRange: (r: Range) => void;
  /** bumps whenever a rescan finished, so pages refetch */
  version: number;
  rescan: () => Promise<void>;
  rescanning: boolean;
  /** session drawer */
  sessionId: string | null;
  openSession: (id: string) => void;
  closeSession: () => void;
  /** theme: 'system' follows the OS */
  dark: boolean;
  theme: string;
  setTheme: (t: 'system' | 'light' | 'dark') => void;
  toggleTheme: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<Range>({ from: null, to: null });
  const [version, setVersion] = useState(0);
  const [rescanning, setRescanning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [theme, setTheme] = useLocalStorage('theme', 'system');
  const dark = theme === 'system' ? (typeof window !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) : theme === 'dark';
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const toggleTheme = useCallback(() => setTheme(dark ? 'light' : 'dark'), [dark, setTheme]);

  const rescan = useCallback(async () => {
    setRescanning(true);
    try { await fetch('/api/refresh', { method: 'POST' }); } finally { setRescanning(false); setVersion((v) => v + 1); }
  }, []);

  const value = useMemo<AppState>(() => ({
    range, setRange, version, rescan, rescanning,
    sessionId, openSession: (id) => setSessionId(id), closeSession: () => setSessionId(null),
    dark, theme, setTheme, toggleTheme,
  }), [range, version, rescan, rescanning, sessionId, dark, theme, setTheme, toggleTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Fetch an API endpoint, re-running when the date range or scan version changes. */
export function useApi<T>(path: string | null, extra?: Record<string, string | null | undefined>) {
  const { range, version } = useApp();
  const extraKey = JSON.stringify(extra || {});
  const url = useMemo(() => {
    if (!path) return null;
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    for (const [k, v] of Object.entries(JSON.parse(extraKey) as Record<string, string | null>)) if (v != null) p.set(k, v);
    return path + (p.toString() ? '?' + p : '');
  }, [path, extraKey, range.from, range.to]);
  const reqKey = url ? `${url}#${version}` : null;
  // state carries the key it belongs to, so "loading" is derived instead of set in the effect
  const [res, setRes] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null });

  useEffect(() => {
    if (!url || !reqKey) return;
    let alive = true;
    fetch(url)
      .then(async (r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json() as Promise<T>; })
      .then((d) => { if (alive) setRes({ key: reqKey, data: d, error: null }); })
      .catch((e: Error) => { if (alive) setRes({ key: reqKey, data: null, error: e.message }); });
    return () => { alive = false; };
  }, [url, reqKey]);

  const current = reqKey != null && res.key === reqKey;
  return { data: current ? res.data : (reqKey ? res.data : null), error: current ? res.error : null, loading: !!reqKey && !current };
}
