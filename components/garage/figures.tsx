'use client';

/**
 * Piezas del garaje virtual portadas de LOOSES & WINS (figures.tsx): aspecto de las personas (piel, pelo, ropa),
 * IsoBox, el monitor con cifras reales y los billetes. Solo lo que usa el estilo "Illustrated".
 */
import { useLayoutEffect, useRef, type SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { iso, pts } from '@/lib/garage/world';

/**
 * Texto SVG que nunca se sale de su hueco: mide el ancho real y, si no cabe en `max`, lo encoge
 * alrededor de su punto de anclaje (hasta la mitad) y, si aún no cabe, lo estrecha.
 */
export function FitText({ max, children, ...rest }: Omit<SVGProps<SVGTextElement>, 'children' | 'ref'> & { max: number; children: string | number }) {
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getComputedTextLength !== 'function') return;
    el.removeAttribute('transform'); el.removeAttribute('textLength'); el.removeAttribute('lengthAdjust');
    const len = el.getComputedTextLength();
    if (!(len > max) || max <= 0) return;
    const k = Math.max(0.55, max / len);
    const x = Number(rest.x ?? 0); const y = Number(rest.y ?? 0);
    el.setAttribute('transform', `translate(${x} ${y}) scale(${k.toFixed(3)}) translate(${-x} ${-y})`);
    if (len * k > max) { el.setAttribute('textLength', (max / k).toFixed(1)); el.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  }, [children, max, rest.x, rest.y]);
  return <text ref={ref} {...rest}>{children}</text>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------------------------------------------------
export const SKIN = ['#f6d0b1', '#e8b48f', '#c98d64', '#a56a43', '#7a4a2c'];
export const SKIN_SHADE = ['#e2b391', '#d0976f', '#ad714a', '#865231', '#5c351e'];
export const HAIR = ['#2a1c14', '#4b2e1e', '#7a4a2a', '#b06a35', '#d9b36c', '#1c2230', '#8f8f99'];
const PANTS = ['#2e3a59', '#3b3f47', '#5b6b8c', '#7b6a4f', '#1f2937', '#4a5568'];
const COAT = ['#6b4f3a', '#3d4a5c', '#7a2e3a', '#2f4a3f', '#5c5470'];
type MaleHair = 'crop' | 'side' | 'buzz' | 'quiff' | 'curly';
type FemaleHair = 'long' | 'bun' | 'pony' | 'bob' | 'curlylong';
export interface Look { gender: 'm' | 'f'; skin: number; hair: number; style: MaleHair | FemaleHair; beard: boolean; pants: string; coat: string; glasses: boolean }

/** Stable person per seed: alternates men and women, varied skin, hair, beard, glasses. */
export function lookFor(seed: number): Look {
  const gender = seed % 2 === 0 ? 'f' : 'm';
  const r = (k: number, n: number) => Math.abs((seed * 9301 + k * 49297) % 233280) % n;
  const male: MaleHair[] = ['crop', 'side', 'buzz', 'quiff', 'curly'];
  const female: FemaleHair[] = ['long', 'bun', 'pony', 'bob', 'curlylong'];
  return {
    gender, skin: r(1, SKIN.length), hair: r(2, HAIR.length - (gender === 'f' ? 1 : 0)), style: gender === 'm' ? male[r(3, male.length)] : female[r(3, female.length)],
    beard: gender === 'm' && r(4, 3) === 0, pants: PANTS[r(5, PANTS.length)], coat: COAT[r(6, COAT.length)], glasses: r(7, 4) === 0,
  };
}

/** Box with top + the two visible sides. */
export function IsoBox({ x, y, w, d, z0 = 0, h, top, left, right, className }: { x: number; y: number; w: number; d: number; z0?: number; h: number; top: string; left: string; right: string; className?: string }) {
  const T = (a: number, b: number, z: number) => iso(x + a, y + b, z);
  return (
    <g className={className}>
      <polygon points={pts(T(0, d, z0), T(w, d, z0), T(w, d, z0 + h), T(0, d, z0 + h))} style={{ fill: left }} />
      <polygon points={pts(T(w, 0, z0), T(w, d, z0), T(w, d, z0 + h), T(w, 0, z0 + h))} style={{ fill: right }} />
      <polygon points={pts(T(0, 0, z0 + h), T(w, 0, z0 + h), T(w, d, z0 + h), T(0, d, z0 + h))} style={{ fill: top }} />
    </g>
  );
}

/** What a desk monitor shows: real figures of the department (never invented — `big` is '—' when unknown). */
export interface MonitorScreen { title: string; big: string; lines: string[]; tone?: 'good' | 'warn' | 'bad' | 'neutral' }
const SCREEN_TONE = { good: '#4ade80', warn: '#fbbf24', bad: '#f87171', neutral: '#e2e8f0' };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Monitor turned towards the viewer (an iso plane spanned by x−y and z, so its text is not skewed). Off = dark glass;
 * on without data = the usual app bars; on with data = a small dark dashboard (title + headline; details when zoomed in).
 */
export function Monitor({ bx, by, color, monitorOn, syncing, screen, detail, wide = 1 }: {
  bx: number; by: number; color: string; monitorOn: boolean; syncing: boolean; screen?: MonitorScreen | null; detail: boolean; wide?: number;
}) {
  const W = 44 * wide; const H = 32;
  const x0 = bx - W / 2; const y0 = by - 12 - H;                 // stand high enough for the desk name plate in front
  const data = monitorOn && screen;
  return (
    <g>
      <ellipse cx={bx} cy={by} rx={8} ry={3} className="fill-[var(--mhq-ink-soft)]" />
      <rect x={bx - 2} y={by - 13} width={4} height={13} className="fill-[var(--mhq-ink-soft)]" />
      <rect x={x0 + 1.5} y={y0 - 3} width={W + 3} height={H + 3} rx={2.5} className="fill-[var(--mhq-monitor)] brightness-75" />
      <rect x={x0 - 1.5} y={y0 - 1.5} width={W + 3} height={H + 3} rx={2.5} className="fill-[var(--mhq-monitor)]" />
      <rect x={x0} y={y0} width={W} height={H} rx={1.2}
        className={cn('transition-[fill] duration-700', !monitorOn ? 'fill-[var(--mhq-screen-off)]' : data ? 'fill-[#0f172a]' : 'fill-[var(--mhq-screen-on)]')} />
      {monitorOn && !screen && (
        <g className="pointer-events-none" style={{ fill: color }}>
          <rect x={x0 + 3} y={y0 + 3} width={W - 6} height={4} opacity={0.9} />
          {[[9, 0.55], [14, 0.35], [19, 0.6], [24, 0.45]].map(([dy, k], i) => <rect key={dy} x={x0 + 4} y={y0 + dy} width={(W - 8) * k} height={2.4} opacity={0.55} className={cn(i === 1 && 'mhq-blink')} style={{ animationDelay: `${(bx + by) % 7}s` }} />)}
          {syncing && <rect x={x0} y={y0 + 1} width={W} height={3} className="mhq-scan" />}
        </g>
      )}
      {data && (
        <g className="pointer-events-none">
          <rect x={x0} y={y0} width={W} height={detail ? 6.5 : 2.5} style={{ fill: color }} />
          {detail && <FitText max={W - 5} x={x0 + 2.5} y={y0 + 5} className="fill-white text-[4.6px] font-bold">{clip(screen.title, 40)}</FitText>}
          <FitText max={W - 5} x={x0 + W / 2} y={detail ? y0 + 15.5 : y0 + 20} textAnchor="middle" className={cn('font-bold', detail ? 'text-[8.5px]' : 'text-[11px]')} fill={SCREEN_TONE[screen.tone ?? 'neutral']}>{clip(screen.big, 16)}</FitText>
          {/* "≈ …" lines are estimates: italic, another colour — never shown like a real figure */}
          {detail && screen.lines.slice(0, 2).map((l, i) => <FitText key={i} max={W - 5} x={x0 + 2.5} y={y0 + 22.5 + i * 6} className={cn('text-[4.4px]', l.startsWith('≈') ? 'fill-sky-300 italic' : 'fill-slate-300')}>{clip(l, 40)}</FitText>)}
          {syncing && <rect x={x0} y={y0 + 4} width={W} height={2} className="mhq-scan" style={{ fill: color }} />}
        </g>
      )}
      <rect x={x0} y={y0} width={W} height={H} fill="url(#mhq-glare)" opacity={monitorOn ? 0.18 : 0.3} className="pointer-events-none" />
    </g>
  );
}

export interface DeskPlateInfo { text: string; dot: 'good' | 'warn' | 'bad' | 'off' }

/** A banded bundle of notes (screen-space anchor). */
export function CashBundle({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <polygon points={`${x - 7},${y} ${x},${y - 3.5} ${x + 7},${y} ${x},${y + 3.5}`} fill="#86efac" />
      <polygon points={`${x - 7},${y} ${x},${y + 3.5} ${x},${y + 6} ${x - 7},${y + 2.5}`} fill="#4ade80" />
      <polygon points={`${x},${y + 3.5} ${x + 7},${y} ${x + 7},${y + 2.5} ${x},${y + 6}`} fill="#22c55e" />
      <polygon points={`${x - 2},${y - 1} ${x + 1},${y - 2.5} ${x + 1},${y + 4.5} ${x - 2},${y + 6}`} fill="#fef3c7" opacity={0.9} />
    </g>
  );
}

