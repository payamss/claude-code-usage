'use client';

import { useEffect, useRef, useState } from 'react';
import { Tooltip } from './ui';
import { niceStep, fmtTick } from '@/lib/format';

function useWidth(min: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1000);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(min, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(min, el.clientWidth));
    return () => ro.disconnect();
  }, [min]);
  return { ref, w };
}

function roundedBar(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, h, w / 2);
  return r ? `M${x},${y + h} V${y + r} a${r},${r} 0 0 1 ${r},-${r} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h} Z` : `M${x},${y} h${w} v${h} h-${w} Z`;
}

export interface StackedDay { key: string; label: string; total: number; segments: { color: string; value: number }[]; tip: string }

/** Stacked daily bar chart (SVG) with hover tooltip */
export function StackedBars({ data, height = 260, yPrefix = '' }: { data: StackedDay[]; height?: number; yPrefix?: string }) {
  const { ref, w: W } = useWidth(600);
  const [tip, setTip] = useState<{ html: string; x: number; y: number } | null>(null);
  const H = height, padL = 56, padR = 10, padT = 12, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  const n = data.length || 1, slot = iw / n, bw = Math.max(2, Math.min(28, slot * 0.7));
  const max = Math.max(...data.map((d) => d.total), 0) || 1;
  const y = (v: number) => padT + ih - (v / max) * ih;
  const step = niceStep(max / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const labelEvery = Math.ceil(n / 12);
  return (
    <div ref={ref} className="w-full" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{yPrefix}{fmtTick(v)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + ih} y2={padT + ih} stroke="var(--axis)" />
        {data.map((d, i) => {
          const bx = padL + slot * i + (slot - bw) / 2;
          let acc = 0;
          const segs = d.segments.filter((s) => s.value > 0);
          return (
            <g key={d.key}>
              {segs.map((s, si) => {
                const y1 = y(acc + s.value), y0 = y(acc); acc += s.value;
                return <path key={si} d={roundedBar(bx, y1, bw, y0 - y1, si === segs.length - 1 ? 4 : 0)} fill={s.color} stroke="var(--surface)" strokeWidth="1" />;
              })}
              <rect x={padL + slot * i} y={padT} width={slot} height={ih} fill="transparent"
                onMouseEnter={(e) => setTip({ html: d.tip, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setTip({ html: d.tip, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTip(null)} />
              {(i % labelEvery === 0 || i === n - 1) && <text x={bx + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <Tooltip html={tip?.html ?? null} x={tip?.x ?? 0} y={tip?.y ?? 0} />
    </div>
  );
}

export interface LinePoint { t: number; v: number; tip: string }
export interface Dot { t: number; v: number; color: string; title: string }

/** Time-series line chart with nearest-point tooltip and optional marker dots */
export function LineChart({ points, dots, color, yFmt, height = 150, startLabel, endLabel, emptyText }: { points: LinePoint[]; dots?: Dot[]; color: string; yFmt: (v: number) => string; height?: number; startLabel: string; endLabel: string; emptyText: string }) {
  const { ref, w: W } = useWidth(400);
  const [tip, setTip] = useState<{ html: string; x: number; y: number } | null>(null);
  if (points.length < 2) return <div className="text-muted text-xs">{emptyText}</div>;
  const H = height, padL = 52, padR = 8, padT = 10, padB = 22, iw = W - padL - padR, ih = H - padT - padB;
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const max = Math.max(...points.map((p) => p.v)) || 1;
  const x = (tt: number) => padL + ((tt - t0) / (t1 - t0 || 1)) * iw, y = (v: number) => padT + ih - (v / max) * ih;
  const step = niceStep(max / 3);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const tt = t0 + ((e.clientX - rect.left) / rect.width * W - padL) / iw * (t1 - t0);
    let best = points[0];
    for (const p of points) if (Math.abs(p.t - tt) < Math.abs(best.t - tt)) best = p;
    setTip({ html: best.tip, x: e.clientX, y: e.clientY });
  };
  return (
    <div ref={ref} className="w-full" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full overflow-visible">
        {ticks.map((v) => <g key={v}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--grid)" /><text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{yFmt(v)}</text></g>)}
        <polyline points={points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {(dots || []).map((d, i) => <circle key={i} cx={x(d.t)} cy={y(d.v)} r="3" fill={d.color}><title>{d.title}</title></circle>)}
        <text x={padL} y={H - 6} fontSize="11" fill="var(--muted)">{startLabel}</text>
        <text x={W - padR} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{endLabel}</text>
        <rect x={padL} y={padT} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setTip(null)} />
      </svg>
      <Tooltip html={tip?.html ?? null} x={tip?.x ?? 0} y={tip?.y ?? 0} />
    </div>
  );
}
