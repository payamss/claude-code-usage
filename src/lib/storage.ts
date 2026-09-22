'use client';

import { useCallback, useSyncExternalStore } from 'react';

// localStorage-backed value that is hydration-safe: the server snapshot is the
// default, the client snapshot is what is saved, and React reconciles after hydration.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => { listeners.delete(cb); window.removeEventListener('storage', cb); };
}

export function useLocalStorage(key: string, fallback: string): [string, (v: string) => void] {
  const get = () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const value = useSyncExternalStore(subscribe, get, () => fallback);
  const set = useCallback((v: string) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } emit(); }, [key]);
  return [value, set];
}
