// Number / date formatting shared by all pages. Digits stay Latin in every language.

export const usd = (n: number | null | undefined, d = 2): string =>
  n == null || Number.isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (a: number, b: number): string => (b ? (a / b * 100).toFixed(1) + '%' : '—');

export const num = (n: number): string => Number(n).toLocaleString('en-US');

export function tok(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

export function dur(ms: number | null | undefined): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export const dt = (ts: string | number | null | undefined, locale?: string): string =>
  ts ? new Date(ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const dtShort = (ts: string | number | null | undefined, locale?: string): string =>
  ts ? new Date(ts).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const dDay = (d: Date, locale?: string): string => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

export const dFull = (d: string | Date | null | undefined, locale?: string): string => (d ? new Date(d).toLocaleDateString(locale) : '?');

export function parseDay(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

export function isoLocal(d: Date): string { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

export function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export const fmtTick = (v: number): string =>
  v >= 1e9 ? v / 1e9 + 'B' : v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
