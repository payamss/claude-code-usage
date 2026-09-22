'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { modelColor, shortModel } from '@/lib/models';

/** Card container */
export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-surface border border-line rounded-xl p-4 mb-4 min-w-0 ${className}`}>
      {title && (
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 flex-wrap">
          {title}
          {right && <span className="ms-auto flex gap-1.5 font-normal">{right}</span>}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Stat tile */
export function Tile({ label, value, sub, info }: { label: ReactNode; value: ReactNode; sub?: ReactNode; info?: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl px-3.5 py-3">
      <div className="text-xs text-muted flex items-center gap-1">{label}{info && <Info k={info} />}</div>
      <div className="text-2xl font-semibold mt-0.5 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-ink-2 mt-0.5">{sub}</div>}
    </div>
  );
}

/** Model chip with its fixed colour */
export function Chip({ model }: { model: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-px rounded-full border border-line text-ink-2 whitespace-nowrap">
      <span className="w-[7px] h-[7px] rounded-full" style={{ background: modelColor(model) }} />
      {shortModel(model)}
    </span>
  );
}

export function Chips({ models }: { models: string[] }) {
  return <div className="inline-flex gap-1 flex-wrap">{models.filter((m) => m !== '<synthetic>').map((m) => <Chip key={m} model={m} />)}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-muted p-6 text-center">{children}</div>;
}

export function Warn({ children }: { children: ReactNode }) {
  return <div className="bg-s4/10 border border-s4/40 px-3 py-2 rounded-lg mb-3 text-[13px]">{children}</div>;
}

export function Pill({ children, title, warn }: { children: ReactNode; title?: string; warn?: boolean }) {
  return <span title={title} className={`inline-block text-[11px] px-1.5 py-px rounded-full ms-1.5 ${warn ? 'bg-s4/20' : 'bg-surface-2'} text-ink-2`}>{children}</span>;
}

/** ⓘ icon that opens an explanation popover on click */
export function Info({ k }: { k: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 360 });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-popover]') && e.target !== ref.current) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const show = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation(); e.preventDefault();
    const r = ref.current!.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 16);
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = r.bottom + 8 > window.innerHeight - 160 ? Math.max(8, r.top - 8 - 160) : r.bottom + 8;
    setPos({ left, top, width });
    setOpen((o) => !o);
  };

  const term = t('term.' + k);
  const hasTerm = term !== 'term.' + k;
  return (
    <>
      <span ref={ref} role="button" tabIndex={0} onClick={show} onKeyDown={(e) => e.key === 'Enter' && show(e)}
        className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border border-muted text-muted text-[10px] leading-none cursor-pointer align-[1px] ms-1 hover:border-accent hover:text-accent select-none">i</span>
      {open && (
        <div data-popover className="fixed z-40 bg-surface text-ink border border-line rounded-xl px-3 py-2.5 text-[13px] leading-relaxed shadow-pop"
          style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {hasTerm && <div className="font-semibold mb-1">{term}</div>}
          {t('gloss.' + k)}
        </div>
      )}
    </>
  );
}

/** Generic hover tooltip used by charts */
export function Tooltip({ html, x, y }: { html: string | null; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [adj, setAdj] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAdj({ x: Math.min(x + 14, window.innerWidth - el.offsetWidth - 8), y: Math.min(y + 14, window.innerHeight - el.offsetHeight - 8) });
  }, [x, y, html]);
  if (!html) return null;
  return <div ref={ref} className="fixed pointer-events-none z-30 bg-surface text-ink border border-line shadow-pop rounded-lg px-2.5 py-2 text-xs max-w-[320px] [&_table]:border-collapse [&_td]:py-px [&_td]:pe-1.5"
    style={{ left: adj.x, top: adj.y }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Table helpers */
export type Sort = { key: string; dir: 1 | -1 };

export function getKey(o: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((v, k) => (v == null ? v : (v as Record<string, unknown>)[k]), o);
}
export function sortBy<T>(list: T[], { key, dir }: Sort): T[] {
  return [...list].sort((a, b) => {
    const va = getKey(a, key), vb = getKey(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * dir;
  });
}

export function Th({ label, k, sort, onSort, num: isNum, info, textKey }: { label: ReactNode; k?: string; sort?: Sort; onSort?: (s: Sort) => void; num?: boolean; info?: string; textKey?: boolean }) {
  const active = sort && k && sort.key === k;
  const click = () => {
    if (!k || !sort || !onSort) return;
    onSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : (textKey ? 1 : -1) });
  };
  return (
    <th onClick={click} className={`px-2 py-1.5 border-b border-grid text-start text-xs font-medium whitespace-nowrap sticky top-0 bg-surface select-none ${k ? 'cursor-pointer' : ''} ${active ? 'text-ink' : 'text-muted'} ${isNum ? 'num' : ''}`}>
      {label}{active ? (sort!.dir > 0 ? ' ▲' : ' ▼') : ''}{info && <Info k={info} />}
    </th>
  );
}

export const Td = ({ children, num: isNum, className = '', title, dim }: { children?: ReactNode; num?: boolean; className?: string; title?: string; dim?: boolean }) => (
  <td title={title} className={`px-2 py-1.5 border-b border-grid align-top text-[13px] ${isNum ? 'num' : ''} ${dim ? 'text-ink-2 text-xs' : ''} ${className}`}>{children}</td>
);

export const Table = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <table className={`w-full border-collapse text-[13px] ${className}`}>{children}</table>
);

export const Legend = ({ items }: { items: { color: string; label: string; round?: boolean }[] }) => (
  <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-ink-2 mt-1.5">
    {items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className={`inline-block w-2.5 h-2.5 ${i.round ? 'rounded-full' : 'rounded-[3px]'}`} style={{ background: i.color }} />{i.label}</span>)}
  </div>
);

export function Bar({ value, max, color = 'var(--s1)' }: { value: number; max: number; color?: string }) {
  return <span className="inline-block w-[90px] bg-grid rounded-[3px] align-middle"><span className="block h-1.5 rounded-[3px] min-w-[2px]" style={{ width: `${(value / (max || 1) * 100).toFixed(1)}%`, background: color }} /></span>;
}

export const Btn = ({ active, onClick, children, title, className = '' }: { active?: boolean; onClick?: () => void; children: ReactNode; title?: string; className?: string }) => (
  <button type="button" title={title} onClick={onClick}
    className={`text-[13px] px-2.5 py-1 rounded-md border transition-colors ${active ? 'bg-accent text-white border-transparent' : 'bg-surface border-line hover:bg-surface-2'} ${className}`}>{children}</button>
);
