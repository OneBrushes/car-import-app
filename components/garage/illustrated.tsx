'use client';

/**
 * Portado de LOOSES & WINS (illustrated.tsx) para el garaje virtual de NorDrive.
 * "Illustrated" skin of the company office (the same cosy style as the Marketing office): papered walls with a boarded
 * wainscot and curtained windows, plank floor, rooms as soft carpets, wooden desks with drawers, chunky colleagues with
 * big heads, leafy plants, a ping-pong table. Drawing only: the scene (scene.tsx) keeps every behaviour — same
 * positions, same walks, same monitors with real data, same links. Colours come from the --px-* palette (.mhq-pixel).
 */
import type { CSSProperties } from 'react';
import { CashBundle, HAIR, Monitor, SKIN, SKIN_SHADE, type DeskPlateInfo, type Look, type MonitorScreen, FitText } from './figures';
import { DESK, iso, pts, WALL } from '@/lib/garage/world';

/** Lo que lleva en las manos una persona (en el original vivía en figures.tsx). */
export type Carry = 'doc' | 'box' | 'cup' | null;
/** Ropa (en el original dependía del tiempo): en el garaje siempre camisa. */
export type Outfit = 'coat' | 'sweater' | 'shirt' | 'tshirt';

type Pt = [number, number];
export const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';
export const v = (n: string) => `var(--px-${n})`;
export const dark = (c: string, k = 30) => `color-mix(in oklab, ${c} ${100 - k}%, #2a1830)`;
export const light = (c: string, k = 35) => `color-mix(in oklab, ${c} ${100 - k}%, #fffbea)`;
const col = (c: string) => (c.startsWith('var(') || c.startsWith('#') || c.startsWith('color') || c.startsWith('rgb') ? c : v(c));
/** fill / stroke from palette names (CSS variables cannot go in SVG presentation attributes). */
export const S = (fill: string | null, stroke?: string, w = 1): CSSProperties => ({ fill: fill ? col(fill) : 'none', ...(stroke ? { stroke: col(stroke), strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const } : {}) });
const onBack = (x: number, z: number) => `matrix(1 0.5 0 1 ${iso(x, 0, z).join(' ')})`;
const onLeft = (yFront: number, z: number) => `matrix(1 -0.5 0 1 ${iso(0, yFront, z).join(' ')})`;
/** flat drawing mapped onto a vertical plane facing front-left (y = const) / front-right (x = const) */
export const onFront = (o: Pt) => `matrix(1 0.5 0 1 ${o[0].toFixed(1)} ${o[1].toFixed(1)})`;
export const onSide = (o: Pt) => `matrix(1 -0.5 0 1 ${o[0].toFixed(1)} ${o[1].toFixed(1)})`;

export function Box({ x0, x1, y0, y1, z0, z1, top, front, side, line, w = 0.9 }: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; top: string; front: string; side: string; line: string; w?: number }) {
  return (
    <g>
      <polygon points={pts(iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1))} style={S(front, line, w)} />
      <polygon points={pts(iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1))} style={S(side, line, w)} />
      <polygon points={pts(iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1))} style={S(top, line, w)} />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Patterns, walls, floor
// ---------------------------------------------------------------------------------------------------------------------
export function IlloDefs() {
  return (
    <defs>
      {(['back', 'side'] as const).map((s) => (
        <pattern key={s} id={`io-paper-${s}`} patternUnits="userSpaceOnUse" width="28" height="28" patternTransform={s === 'back' ? 'matrix(1 0.5 0 1 0 0)' : 'matrix(1 -0.5 0 1 0 0)'}>
          <rect width="28" height="28" style={S(s === 'back' ? 'paper-a' : 'paper-c')} />
          <rect x="14" width="14" height="28" style={S(s === 'back' ? 'paper-b' : 'paper-d')} />
          <circle cx="7" cy="14" r="1.8" style={S('paper-motif')} />
          {[[-3, 0], [3, 0], [0, -3], [0, 3]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={7 + dx} cy={14 + dy} r="1.2" style={S('paper-motif-soft')} />)}
        </pattern>
      ))}
      {(['back', 'side'] as const).map((s) => (
        <pattern key={`b${s}`} id={`io-boards-${s}`} patternUnits="userSpaceOnUse" width="12" height="300" patternTransform={s === 'back' ? 'matrix(1 0.5 0 1 0 0)' : 'matrix(1 -0.5 0 1 0 0)'}>
          <rect width="12" height="300" style={S('panel')} />
          <rect width="1.2" height="300" style={S('panel-sh')} />
          <rect x="1.2" width="1.4" height="300" style={S('panel-hi')} />
        </pattern>
      ))}
      <pattern id="io-floor" patternUnits="userSpaceOnUse" width="96" height="32" patternTransform="matrix(1 0.5 -1 0.5 0 0)">
        <rect width="96" height="16" style={S('floor-a')} />
        <rect y="16" width="96" height="16" style={S('floor-b')} />
        <rect x="58" width="38" height="16" style={S('floor-c')} />
        <rect y="0" width="96" height="1.2" style={S('seam')} />
        <rect y="16" width="96" height="1.2" style={S('seam')} />
        <rect y="1.2" width="96" height="1.3" style={S('floor-hi')} />
        <rect y="17.2" width="96" height="1.3" style={S('floor-hi')} />
        <rect x="58" y="0" width="1.2" height="16" style={S('seam')} />
        <rect x="22" y="16" width="1.2" height="16" style={S('seam')} />
        <rect x="80" y="16" width="1.2" height="16" style={S('seam')} />
      </pattern>
    </defs>
  );
}

const WAIN = 36;

/** Walls with the same window holes as the classic office (the real sky shows through), wainscot, curtains, flower boxes. */
export function IlloWalls({ winBack, winSide, W, D }: { winBack: [number, number][]; winSide: [number, number][]; W: number; D: number }) {
  const hole = (a: [number, number, number][]) => `M ${a.map((p) => iso(p[0], p[1], p[2]).join(' ')).join(' L ')} Z`;
  const back = [hole([[0, 0, 0], [W, 0, 0], [W, 0, WALL], [0, 0, WALL]]), ...winBack.map(([a, b]) => hole([[a, 0, 40], [a, 0, 118], [b, 0, 118], [b, 0, 40]]))].join(' ');
  const side = [hole([[0, 0, 0], [0, D, 0], [0, D, WALL], [0, 0, WALL]]), ...winSide.map(([a, b]) => hole([[0, a, 40], [0, a, 118], [0, b, 118], [0, b, 40]]))].join(' ');
  const frame = (w: number, h: number) => (
    <>
      <rect width={w} height={h} style={S(null, 'frame', 5)} />
      <line x1={w / 2} y1={0} x2={w / 2} y2={h} style={{ stroke: v('frame'), strokeWidth: 3 }} />
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} style={{ stroke: v('frame'), strokeWidth: 3 }} />
      <rect x={-2.5} y={-2.5} width={w + 5} height={h + 5} style={S(null, 'frame-sh', 0.8)} />
      <rect x={-5} y={h + 2.5} width={w + 10} height={5} rx={1.5} style={S('sill-hi', 'sill', 0.8)} />
    </>
  );
  const curtains = (w: number, h: number) => [-20, w + 2].map((cx) => (
    <g key={cx}>
      <path d={`M${cx} -6 H${cx + 18} V${h + 6} Q${cx + 9} ${h} ${cx} ${h + 6} Z`} style={S('curtain', 'curtain-sh', 0.9)} />
      {[4.5, 9, 13.5].map((x) => <line key={x} x1={cx + x} y1={-5} x2={cx + x} y2={h + 2} style={{ stroke: v('curtain-sh'), strokeWidth: 1.1 }} />)}
      <line x1={cx + 2} y1={-5} x2={cx + 2} y2={h + 2} style={{ stroke: v('curtain-hi'), strokeWidth: 1 }} />
      <rect x={cx - 0.5} y={h * 0.45} width={19} height={3} rx={1.4} style={S('curtain-sh')} />
    </g>
  ));
  const flowers = (w: number) => (
    <g>
      {Array.from({ length: Math.ceil(w / 5) }, (_, i) => <ellipse key={`l${i}`} cx={i * 5 + 2.5} cy={-2.5 - ((i * 7) % 3)} rx={4} ry={3.6} style={S(i % 2 ? 'leaf' : 'leaf-dark')} />)}
      {Array.from({ length: Math.ceil(w / 8) }, (_, i) => (
        <g key={`f${i}`}><circle cx={i * 8 + 4} cy={-6.5 - ((i * 5) % 3)} r={2.5} style={S(i % 2 ? 'flower-red' : 'flower-yellow')} /><circle cx={i * 8 + 4} cy={-6.5 - ((i * 5) % 3)} r={0.9} style={{ fill: '#fff2a8' }} /></g>
      ))}
    </g>
  );
  return (
    <g>
      <path d={back} fillRule="evenodd" style={{ fill: 'url(#io-paper-back)' }} />
      <path d={side} fillRule="evenodd" style={{ fill: 'url(#io-paper-side)' }} />
      <polygon points={pts(iso(0, 0), iso(W, 0), iso(W, 0, WAIN), iso(0, 0, WAIN))} style={{ fill: 'url(#io-boards-back)' }} />
      <polygon points={pts(iso(0, 0), iso(0, D), iso(0, D, WAIN), iso(0, 0, WAIN))} style={{ fill: 'url(#io-boards-side)' }} />
      {(['back', 'side'] as const).map((s) => {
        const a = (z0: number, z1: number) => (s === 'back' ? pts(iso(0, 0, z0), iso(W, 0, z0), iso(W, 0, z1), iso(0, 0, z1)) : pts(iso(0, 0, z0), iso(0, D, z0), iso(0, D, z1), iso(0, 0, z1)));
        return (
          <g key={s}>
            <polygon points={a(WAIN, WAIN + 5)} style={S('rail-hi', 'rail-sh', 0.9)} />
            <polygon points={a(0, 6)} style={S('base', 'base-hi', 0.7)} />
            <polygon points={a(WALL - 8, WALL)} style={S('trim', 'trim-hi', 0.9)} />
          </g>
        );
      })}
      <polygon points={pts(iso(0, 0, WALL), iso(W, 0, WALL), iso(W, -0.35, WALL), iso(0, -0.35, WALL))} style={S('trim-top', 'trim-hi', 0.7)} />
      <polygon points={pts(iso(0, 0, WALL), iso(0, D, WALL), iso(-0.35, D, WALL), iso(-0.35, 0, WALL))} style={S('trim-top-b', 'trim-hi', 0.7)} />
      <line x1={iso(0, 0)[0]} y1={iso(0, 0)[1]} x2={iso(0, 0, WALL)[0]} y2={iso(0, 0, WALL)[1]} style={{ stroke: v('corner'), strokeWidth: 1.6 }} />
      {winBack.map(([a, b]) => {
        const w = (b - a) * 32;
        return (
          <g key={`b${a}`}>
            <g transform={onBack(a, 118)}>
              <rect x={-24} y={-11} width={w + 48} height={3.4} rx={1.7} style={S('rod', 'rod-hi', 0.7)} />
              {curtains(w, 78)}
              {frame(w, 78)}
            </g>
            <Box x0={a - 0.05} x1={b + 0.05} y0={0} y1={0.24} z0={22} z1={32} top="soil" front="wood-front" side="wood-side" line="wood-line" />
            <g transform={onBack(a, 32)}><g transform="translate(0 0)">{flowers(w)}</g></g>
          </g>
        );
      })}
      {winSide.map(([a, b]) => {
        const w = (b - a) * 32;
        return (
          <g key={`s${a}`} transform={onLeft(b, 118)}>
            <rect x={-24} y={-11} width={w + 48} height={3.4} rx={1.7} style={S('rod', 'rod-hi', 0.7)} />
            {curtains(w, 78)}
            {frame(w, 78)}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Furniture and plants (same footprints as the classic ones)
// ---------------------------------------------------------------------------------------------------------------------
export function Crown({ cx, cy, clusters }: { cx: number; cy: number; clusters: readonly (readonly [number, number, number])[] }) {
  return (
    <g>
      {clusters.map(([dx, dy, r], i) => <circle key={`o${i}`} cx={cx + dx} cy={cy + dy} r={r + 1.1} style={S('leaf-line')} />)}
      {clusters.map(([dx, dy, r], i) => (
        <g key={i}>
          <circle cx={cx + dx} cy={cy + dy} r={r} style={S('leaf-dark')} />
          <circle cx={cx + dx - r * 0.12} cy={cy + dy - r * 0.12} r={r * 0.82} style={S('leaf')} />
          <circle cx={cx + dx - r * 0.35} cy={cy + dy - r * 0.38} r={r * 0.32} style={S('leaf-hi')} />
        </g>
      ))}
    </g>
  );
}

export function Pot({ cx, by, w, h }: { cx: number; by: number; w: number; h: number }) {
  const t = by - h; const b = w * 0.15;
  return (
    <g>
      <path d={`M${cx - w / 2} ${t + 3} L${cx + w / 2} ${t + 3} L${cx + w / 2 - b} ${by} L${cx - w / 2 + b} ${by} Z`} style={S('pot', 'pot-line', 1)} />
      <path d={`M${cx + w / 2 - 4} ${t + 3} L${cx + w / 2} ${t + 3} L${cx + w / 2 - b} ${by} L${cx + w / 2 - b - 4} ${by} Z`} style={S('pot-sh')} />
      <rect x={cx - w / 2 - 1.5} y={t} width={w + 3} height={4} rx={1.5} style={S('pot-rim', 'pot-line', 1)} />
      <rect x={cx - w / 2 + 2} y={t + 5} width={2.4} height={Math.max(2, h - 8)} rx={1} style={S('pot-hi')} />
    </g>
  );
}

export function IlloPlant({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  const [px, py] = iso(x, y); const s = size;
  return (
    <g className="mhq-sway" style={{ transformOrigin: `${px}px ${py}px`, animationDelay: `${(x * 3 + y) % 5}s` }}>
      <ellipse cx={px + 3} cy={py} rx={14 * s} ry={5 * s} style={S('shadow')} />
      <Pot cx={px} by={py + 1} w={17 * s} h={15 * s} />
      <Crown cx={px} cy={py - 15 * s - 20 * s} clusters={[[-9 * s, 6 * s, 10 * s], [9 * s, 6 * s, 10 * s], [0, 9 * s, 10 * s], [-6 * s, -7 * s, 10 * s], [7 * s, -6 * s, 9 * s], [0, -14 * s, 9 * s], [0, 0, 10 * s]]} />
    </g>
  );
}

export function IlloLamp({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  const [px, py] = iso(x, y);
  return (
    <g>
      <ellipse cx={px + 2} cy={py} rx={10} ry={3.5} style={S('shadow')} />
      <ellipse cx={px} cy={py - 1} rx={8} ry={3} style={S('metal', 'metal-line', 1)} />
      <rect x={px - 1.4} y={py - 88} width={2.8} height={87} style={S('metal', 'metal-line', 0.7)} />
      <path d={`M${px - 14} ${py - 86} L${px - 9} ${py - 108} L${px + 9} ${py - 108} L${px + 14} ${py - 86} Z`} style={S(lit ? '#ffe9a0' : 'lamp', 'lamp-sh', 1.2)} />
      <path d={`M${px - 11.5} ${py - 89} L${px - 7.5} ${py - 105}`} style={{ stroke: v('lamp-hi'), strokeWidth: 2, strokeLinecap: 'round' }} />
      {lit && <ellipse cx={px} cy={py - 86} rx={12} ry={3.2} style={{ fill: '#fff7cc' }} />}
    </g>
  );
}

export function IlloCooler({ x, y }: { x: number; y: number }) {
  const [px, py] = iso(x + 0.25, y + 0.25);
  return (
    <g>
      <ellipse cx={px + 3} cy={py + 2} rx={14} ry={5} style={S('shadow')} />
      <rect x={px - 10} y={py - 40} width={20} height={41} rx={2.5} style={S('cooler', 'metal-line', 1.1)} />
      <rect x={px + 4} y={py - 40} width={6} height={41} rx={1.2} style={S('cooler-shade')} />
      <rect x={px - 6} y={py - 31} width={3} height={3} rx={0.7} style={{ fill: '#e05050' }} /><rect x={px - 1.5} y={py - 31} width={3} height={3} rx={0.7} style={{ fill: '#3e9ad8' }} />
      <path d={`M${px - 9} ${py - 40} Q${px - 11} ${py - 60} ${px} ${py - 61} Q${px + 11} ${py - 60} ${px + 9} ${py - 40} Z`} style={S('water', 'water-dark', 1.1)} />
      <path d={`M${px - 5} ${py - 45} Q${px - 6} ${py - 53} ${px - 2} ${py - 56}`} style={{ fill: 'none', stroke: '#ffffff', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.8 }} />
    </g>
  );
}

export function IlloTable({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[[0.12, 1.0], [1.28, 1.0], [1.28, 0.1], [0.12, 0.1]].map(([a, b]) => { const [p1x, p1y] = iso(x + a, y + b, 0); const [p2x, p2y] = iso(x + a, y + b, 21); return <line key={`${a}${b}`} x1={p1x} y1={p1y} x2={p2x} y2={p2y} style={{ stroke: v('wood-line'), strokeWidth: 3.4, strokeLinecap: 'round' }} />; })}
      <Box x0={x} x1={x + 1.4} y0={y} y1={y + 1.1} z0={21} z1={25} top="wood-top" front="wood-front" side="wood-side" line="wood-line" />
    </g>
  );
}

/** Sofa facing +x (towards the room): w = depth (x), d = length (y); backrest on x, arms at both ends. */
export function IlloSofa({ x, y, w = 1.0, d = 2.6 }: { x: number; y: number; w?: number; d?: number }) {
  const c = '#7c6fe0'; const ch = '#9d93f0'; const cd = '#5a4fc0'; const l = '#3a2f7a';
  return (
    <g>
      <Box x0={x} x1={x + w} y0={y} y1={y + d} z0={0} z1={16} top={ch} front={cd} side={c} line={l} />
      <Box x0={x} x1={x + 0.3} y0={y} y1={y + d} z0={16} z1={38} top={ch} front={cd} side={c} line={l} />
      <Box x0={x} x1={x + w} y0={y} y1={y + 0.3} z0={16} z1={26} top={ch} front={cd} side={c} line={l} />
      {[0.32, 0.32 + (d - 0.64) / 2].map((a) => <polygon key={a} points={pts(iso(x + 0.32, y + a, 17), iso(x + w - 0.06, y + a, 17), iso(x + w - 0.06, y + a + (d - 0.64) / 2 - 0.04, 17), iso(x + 0.32, y + a + (d - 0.64) / 2 - 0.04, 17))} style={S(light(c, 25), l, 0.6)} />)}
      <Box x0={x} x1={x + w} y0={y + d - 0.3} y1={y + d} z0={16} z1={26} top={ch} front={cd} side={c} line={l} />
    </g>
  );
}

export function IlloCounter({ x, y }: { x: number; y: number }) {
  const [mx, my] = iso(x + 1.2, y + 0.3, 50);
  return (
    <g>
      <Box x0={x} x1={x + 3.2} y0={y} y1={y + 0.8} z0={0} z1={34} top="#f1ece2" front="wood-front" side="wood-side" line="wood-line" />
      <g transform={onFront(iso(x, y + 0.8, 34))}>
        {[8, 16, 24].map((yy) => <line key={yy} x1={1} y1={yy} x2={3.2 * 32 - 1} y2={yy} style={{ stroke: v('wood-front-line'), strokeWidth: 0.8 }} />)}
      </g>
      <Box x0={x + 0.9} x1={x + 1.5} y0={y + 0.1} y1={y + 0.6} z0={34} z1={60} top="#5f6b7d" front="#3d4656" side="#2c3442" line="metal-line" />
      <path d={`M ${mx} ${my - 6} q 3 -6 0 -12 q -3 -6 0 -12`} fill="none" stroke="#e2e8f0" strokeWidth={1.6} className="mhq-steam" opacity={0.7} />
      {[2.1, 2.5].map((a) => { const [cx, cy] = iso(x + a, y + 0.4, 34); return <g key={a}><rect x={cx - 3.5} y={cy - 9} width={7} height={8.5} rx={1.5} style={S(a === 2.1 ? '#e8684a' : '#4a7ad8', 'person-line', 0.7)} /></g>; })}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// People (big heads), chairs, desks
// ---------------------------------------------------------------------------------------------------------------------
const HEAD_T = 'translate(0 -35) scale(1.02) translate(0 27)';
const CAP = 'M -12.2 -26 C -13 -42.5 13 -42.5 12.2 -26 C 10.5 -30.5 7 -32.5 3 -32 C 0 -34 -5 -34 -8 -31.5 C -10.2 -30 -11.4 -28 -12.2 -26 Z';

function Hair({ look, color }: { look: Look; color: string }) {
  const st = S(color, dark(color, 35), 0.9);
  const s = look.style;
  const hi = <path d="M -7 -37 Q -3 -40.5 2 -39" style={{ fill: 'none', stroke: light(color, 35), strokeWidth: 1.6, strokeLinecap: 'round' }} />;
  const curls = (rs: number[][]) => rs.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} style={st} />);
  switch (s) {
    case 'buzz': return <path d="M -11.8 -27 C -12.5 -40 12.5 -40 11.8 -27 C 6 -33.5 -6 -33.5 -11.8 -27 Z" style={S(dark(color, 12), dark(color, 40), 0.8)} />;
    case 'side': return <g><path d="M -12.2 -24 C -13.5 -42.5 13 -42.5 12.2 -27 C 8 -33.5 0 -35 -6 -31 C -9 -29 -11 -26.5 -12.2 -24 Z" style={st} />{hi}</g>;
    case 'quiff': return <g><path d={CAP} style={st} /><path d="M -7 -36 C -8 -46 7 -47 7 -37 Z" style={st} />{hi}</g>;
    case 'curly': return <g>{curls([[-9, -32, 5], [-4, -37, 5.5], [3, -37.5, 5.5], [9, -33, 5], [11, -27, 3.5], [-11, -27, 3.5], [0, -33, 6]])}</g>;
    case 'long': return <g><path d="M -12 -29 C -15 -18 -14 -9 -10 -4 L -6.5 -4 C -8.5 -11 -9 -20 -8.5 -28 Z" style={st} /><path d="M 12 -29 C 15 -18 14 -9 10 -4 L 6.5 -4 C 8.5 -11 9 -20 8.5 -28 Z" style={st} /><path d={CAP} style={st} />{hi}</g>;
    case 'bob': return <g><path d="M -12 -29 C -14 -22 -13.5 -17 -11 -14 L -8 -15 C -9 -19 -9 -24 -8.5 -28 Z" style={st} /><path d="M 12 -29 C 14 -22 13.5 -17 11 -14 L 8 -15 C 9 -19 9 -24 8.5 -28 Z" style={st} /><path d={CAP} style={st} />{hi}</g>;
    case 'bun': return <g><circle cx={0} cy={-42} r={5.5} style={st} /><path d={CAP} style={st} />{hi}</g>;
    case 'pony': return <g><path d="M 10 -33 C 19 -31 19 -18 14.5 -11 C 13.5 -18 12.5 -25 9 -29 Z" style={st} /><path d={CAP} style={st} />{hi}</g>;
    case 'curlylong': return <g>{curls([[-12, -18, 4], [-12, -11, 4], [12, -18, 4], [12, -11, 4]])}{curls([[-9, -32, 5], [-4, -37, 5.5], [3, -37.5, 5.5], [9, -33, 5], [11, -27, 3.5], [-11, -27, 3.5], [0, -33, 6]])}</g>;
    default: return <g><path d={CAP} style={st} />{hi}</g>;
  }
}

function Head({ look, blinkDelay, headset }: { look: Look; blinkDelay: string; headset?: boolean }) {
  const skin = SKIN[look.skin]; const shade = SKIN_SHADE[look.skin]; const hair = HAIR[look.hair];
  const line = v('person-line');
  return (
    <g transform={HEAD_T}>
      <ellipse cx={-11.4} cy={-25} rx={2.2} ry={3} style={S(shade, line, 1)} />
      <ellipse cx={11.4} cy={-25} rx={2.2} ry={3} style={S(shade, line, 1)} />
      <ellipse cx={0} cy={-27} rx={11.2} ry={11} style={S(skin, line, 1.2)} />
      <path d="M 6 -35.5 A 11.2 11 0 0 1 2 -16.2 Q 9 -21 6 -35.5 Z" style={{ fill: shade, opacity: 0.5 }} />
      {look.beard
        ? <path d="M -10 -24 Q -9 -14 0 -14 Q 9 -14 10 -24 Q 6 -19 0 -19.5 Q -6 -19 -10 -24 Z" style={S(dark(hair, 8), dark(hair, 40), 0.8)} />
        : <><ellipse cx={-7.4} cy={-21} rx={2.2} ry={1.1} style={{ fill: '#f2a0a8', opacity: 0.85 }} /><ellipse cx={6} cy={-21} rx={2.2} ry={1.1} style={{ fill: '#f2a0a8', opacity: 0.85 }} />
          <path d="M -2.4 -19.8 Q -0.6 -17.8 1.2 -19.8" style={{ fill: 'none', stroke: dark(shade, 45), strokeWidth: 1.1, strokeLinecap: 'round' }} /></>}
      <Hair look={look} color={hair} />
      <g className="mhq-px-blink" style={{ animationDelay: blinkDelay }}>
        {[-5.2, 3.6].map((ex) => (
          <g key={ex}>
            <ellipse cx={ex} cy={-25} rx={1.9} ry={2.9} style={{ fill: '#2a1c2c' }} />
            <ellipse cx={ex - 0.5} cy={-26.2} rx={0.8} ry={1} style={{ fill: '#ffffff' }} />
            <circle cx={ex + 0.7} cy={-23.7} r={0.35} style={{ fill: '#ffffff' }} />
          </g>
        ))}
      </g>
      {look.glasses && <g style={{ fill: 'none', stroke: '#3a2c3c', strokeWidth: 1.1 }}><circle cx={-5.2} cy={-25} r={3.8} /><circle cx={3.6} cy={-25} r={3.8} /><line x1={-1.4} y1={-25.4} x2={-0.2} y2={-25.4} /></g>}
      {headset && (
        <g style={{ fill: 'none', stroke: '#2a2f3a', strokeWidth: 2.2 }}>
          <path d="M -12.5 -26 A 12.5 13 0 0 1 12.5 -26" />
          <rect x={10.5} y={-28} width={4.5} height={7} rx={2} style={{ fill: '#2a2f3a', stroke: 'none' }} />
          <path d="M 12 -21 Q 8 -15 1 -17" style={{ strokeWidth: 1.2 }} />
        </g>
      )}
    </g>
  );
}

function HeadBack({ look }: { look: Look }) {
  const shade = SKIN_SHADE[look.skin]; const skin = SKIN[look.skin]; const hair = HAIR[look.hair];
  const line = v('person-line');
  const st = S(look.style === 'buzz' ? dark(hair, 12) : hair, dark(hair, 40), 1);
  const s = look.style;
  const long = s === 'long' || s === 'curlylong';
  return (
    <g transform={HEAD_T}>
      <ellipse cx={-11.4} cy={-25} rx={2.2} ry={3} style={S(shade, line, 1)} />
      <ellipse cx={11.4} cy={-25} rx={2.2} ry={3} style={S(shade, line, 1)} />
      <ellipse cx={0} cy={-27} rx={11.2} ry={11} style={S(skin, line, 1.2)} />
      {long && <path d="M -12.5 -28 C -14.5 -14 -13 -6 -9 -3 L 9 -3 C 13 -6 14.5 -14 12.5 -28 Z" style={st} />}
      {s === 'bob' && <path d="M -12.5 -28 C -13.5 -20 -12.5 -15 -10 -13 L 10 -13 C 12.5 -15 13.5 -20 12.5 -28 Z" style={st} />}
      {s === 'curly' || s === 'curlylong'
        ? [[-8, -33, 6], [0, -36, 6.5], [8, -33, 6], [-9.5, -25, 4.5], [9.5, -25, 4.5], [-5, -22, 4], [5, -22, 4], [0, -26, 7]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} style={st} />)
        : <path d={s === 'buzz' ? 'M -11.8 -26 C -12.5 -41 12.5 -41 11.8 -26 C 11 -21 7 -18.5 0 -18.5 C -7 -18.5 -11 -21 -11.8 -26 Z' : 'M -12.4 -26 C -13.2 -43 13.2 -43 12.4 -26 C 11.6 -19.5 7 -17 0 -17 C -7 -17 -11.6 -19.5 -12.4 -26 Z'} style={st} />}
      {s === 'bun' && <circle cx={0} cy={-38} r={5.5} style={st} />}
      {s === 'pony' && <path d="M -2.5 -24 C -4 -16 -3 -9 0 -6 C 3 -9 4 -16 2.5 -24 Z" style={st} />}
      {s !== 'buzz' && <path d="M -6 -37 Q 0 -40.5 6 -37" style={{ fill: 'none', stroke: light(hair, 35), strokeWidth: 1.6, strokeLinecap: 'round' }} />}
    </g>
  );
}

const shirtOf = (look: Look, outfit: Outfit, color: string) => (outfit === 'coat' ? look.coat : outfit === 'sweater' ? dark(color, 18) : color);

function Torso({ look, outfit, color, belt, back = false }: { look: Look; outfit: Outfit; color: string; belt: boolean; back?: boolean }) {
  const shade = SKIN_SHADE[look.skin]; const shirt = shirtOf(look, outfit, color);
  const line = v('person-line');
  const collar = outfit === 'shirt' ? '#fffdf5' : outfit === 'coat' ? light(look.coat, 35) : dark(shirt, 18);
  return (
    <g>
      <rect x={-2.7} y={-25.5} width={5.4} height={5} style={S(shade, line, 0.8)} />
      <path d="M -11.5 -14 C -11.5 -19.5 -8.5 -22 -4 -22 L 4 -22 C 8.5 -22 11.5 -19.5 11.5 -14 L 9 0.5 L -9 0.5 Z" style={S(shirt, line, 1.1)} />
      <path d="M 4.5 -22 C 8.5 -22 11.5 -19.5 11.5 -14 L 9 0.5 L 5.5 0.5 L 7 -20.5 Z" style={S(dark(shirt, 22))} />
      {back
        ? <path d="M -4 -21.6 Q 0 -20 4 -21.6 M 0 -20.5 L 0 0" style={{ stroke: dark(shirt, 30), strokeWidth: 0.9, fill: 'none' }} />
        : <path d="M -3.8 -22 L 0 -17.4 L 3.8 -22 Z" style={S(collar, line, 0.8)} />}
      {outfit === 'coat' && !back && <path d="M -3.8 -22 L -1.6 0.5 M 3.8 -22 L 1.6 0.5" style={{ stroke: dark(shirt, 38), strokeWidth: 1.1, fill: 'none' }} />}
      {outfit === 'sweater' && <path d="M -10.6 -9 L 10 -9" style={{ stroke: light(shirt, 30), strokeWidth: 1.2 }} />}
      {belt && <rect x={-9} y={-1.6} width={18} height={2.4} rx={0.8} style={S(dark(look.pants, 30), line, 0.6)} />}
    </g>
  );
}

function Arm({ d, hand, look, outfit, color, far }: { d: string; hand: Pt; look: Look; outfit: Outfit; color: string; far?: boolean }) {
  const skin = far ? SKIN_SHADE[look.skin] : SKIN[look.skin];
  const sleeve = far ? dark(shirtOf(look, outfit, color), 20) : shirtOf(look, outfit, color);
  const line = v('person-line');
  return (
    <g>
      <path d={d} style={{ fill: 'none', stroke: line, strokeWidth: 5.6, strokeLinecap: 'round' }} />
      <path d={d} style={{ fill: 'none', stroke: outfit === 'tshirt' ? skin : sleeve, strokeWidth: 3.9, strokeLinecap: 'round' }} />
      <circle cx={hand[0]} cy={hand[1]} r={2.5} style={S(skin, line, 0.9)} />
    </g>
  );
}

function Carried({ what, x, y }: { what: Carry; x: number; y: number }) {
  if (what === 'doc') return <g><rect x={x - 6} y={y - 9} width={12} height={15} rx={1} style={S('#fafafa', 'person-line', 0.8)} />{[0, 3, 6].map((d) => <line key={d} x1={x - 3.5} y1={y - 5 + d} x2={x + 3.5} y2={y - 5 + d} stroke="#94a3b8" strokeWidth={0.8} />)}</g>;
  if (what === 'box') return <g style={{ stroke: v('wood-line'), strokeWidth: 0.8 }}><polygon points={`${x - 10},${y - 4} ${x},${y - 9} ${x + 10},${y - 4} ${x},${y + 1}`} fill="#e6b678" /><polygon points={`${x - 10},${y - 4} ${x},${y + 1} ${x},${y + 10} ${x - 10},${y + 5}`} fill="#c9965a" /><polygon points={`${x},${y + 1} ${x + 10},${y - 4} ${x + 10},${y + 5} ${x},${y + 10}`} fill="#b07f47" /></g>;
  if (what === 'cup') return <g><rect x={x - 3.5} y={y - 6} width={7} height={8} rx={1.5} style={S('#f8fafc', 'person-line', 0.7)} /><path d={`M ${x - 1} ${y - 8} q 2 -3 0 -6`} fill="none" stroke="#cbd5e1" strokeWidth={1} className="mhq-steam" /></g>;
  return null;
}

/** Standing / walking colleague, feet at (0, 0) — same API as the classic StandingPerson. */
export function IlloStanding({ look, outfit, color, walking, back, flip, carry, seed, sit = false, talk }: {
  look: Look; outfit: Outfit; color: string; walking: boolean; back: boolean; flip: boolean; carry: Carry; seed: number;
  /** sitting (on the sofa): hips at seat height, knees towards the viewer */
  sit?: boolean;
  /** chatting: the near hand gestures now and then (animation delay, s) */
  talk?: number;
}) {
  const line = v('person-line');
  const delay = `${(seed * 0.37) % 1}s`;
  const legCls = (b: boolean) => (walking ? (b ? 'mhq-px-leg-b' : 'mhq-px-leg-a') : undefined);
  const armCls = (b: boolean) => (walking && !carry ? (b ? 'mhq-px-arm-b' : 'mhq-px-arm-a') : !b && talk !== undefined ? 'mhq-gesture' : undefined);
  const armDelay = (b: boolean) => (!walking && !b && talk !== undefined ? `${talk}s` : delay);
  return (
    <g>
      {!sit && <ellipse cx={0} cy={0} rx={11} ry={4} style={S('shadow')} />}
      <g className={talk !== undefined ? 'mhq-nod' : undefined} style={talk !== undefined ? { animationDelay: `${talk}s` } : undefined}>
      <g transform={`${flip ? 'scale(-1 1) ' : ''}translate(0 ${sit ? -13 : -25})`}>
        {sit
          ? (
            <g>
              {/* shins hanging over the seat's front edge, then the lap (thighs seen end-on) over the cushion */}
              {([[-7.2, false], [1.2, true]] as const).map(([lx, b]) => (
                <g key={lx}>
                  <rect x={lx} y={6} width={6} height={11} rx={2.6} style={S(b ? dark(look.pants, 15) : look.pants, line, 1)} />
                  <ellipse cx={lx + 3} cy={17.5} rx={4.4} ry={2.3} style={S('#3a3040', line, 0.8)} />
                </g>
              ))}
              <path d="M -10.5 -1 L 10.5 -1 L 10.5 5 Q 10.5 9.5 6 9.5 L 2.5 9.5 Q 0 8 -2.5 9.5 L -6 9.5 Q -10.5 9.5 -10.5 5 Z" style={S(light(look.pants, 10), line, 1)} />
              <path d="M 0 0 L 0 8.5" style={{ stroke: dark(look.pants, 30), strokeWidth: 0.9 }} />
            </g>
          )
          : ([[-7.4, false], [1.4, true]] as const).map(([lx, b]) => (
            <g key={lx} className={legCls(b)} style={{ animationDelay: delay }}>
              <rect x={lx} y={-1} width={6} height={23} rx={2.6} style={S(b ? dark(look.pants, 15) : look.pants, line, 1)} />
              <ellipse cx={lx + 3} cy={23} rx={4.2} ry={2.3} style={S('#3a3040', line, 0.8)} />
            </g>
          ))}
        {carry && !back ? (
          <>
            <Torso look={look} outfit={outfit} color={color} belt />
            <Head look={look} blinkDelay={delay} />
            <Carried what={carry} x={0} y={-10} />
            <Arm d="M -10 -18.5 Q -12 -11 -6 -8" hand={[-6, -8]} look={look} outfit={outfit} color={color} />
            <Arm d="M 10 -18.5 Q 12 -11 6 -8" hand={[6, -8]} look={look} outfit={outfit} color={color} far />
          </>
        ) : (
          <>
            {sit ? (
              <>
                <g className={armCls(false)} style={{ animationDelay: armDelay(false) }}><Arm d="M -10 -18.5 Q -13 -8 -7 -2" hand={[-7, -2]} look={look} outfit={outfit} color={color} /></g>
                <Arm d="M 10 -18.5 Q 13 -8 7 -2" hand={[7, -2]} look={look} outfit={outfit} color={color} far />
              </>
            ) : (
              <>
                <g className={armCls(false)} style={{ animationDelay: armDelay(false) }}><Arm d="M -10 -18.5 Q -13 -9 -11.8 -1" hand={[-11.8, 0]} look={look} outfit={outfit} color={color} /></g>
                <g className={armCls(true)} style={{ animationDelay: delay }}><Arm d="M 10 -18.5 Q 13 -9 11.8 -1" hand={[11.8, 0]} look={look} outfit={outfit} color={color} far /></g>
              </>
            )}
            <Torso look={look} outfit={outfit} color={color} belt back={back} />
            {back ? <HeadBack look={look} /> : <Head look={look} blinkDelay={delay} />}
            {back && carry && <Carried what={carry} x={0} y={-14} />}
          </>
        )}
      </g>
      </g>
    </g>
  );
}

/** Where a seated colleague's hips are, for a desk at (gx, gy): just behind the desk's back edge. */
const hipsOf = (gx: number, gy: number): Pt => { const [x, y] = iso(gx + 1.0, gy - 0.42); return [x, y - 16]; };

export function IlloChair({ gx, gy, empty }: { gx: number; gy: number; empty: boolean }) {
  const ox = empty ? 0.18 : 0;
  const [fx, fy] = iso(gx + 1.0 + ox, gy - 0.42 - (empty ? 0.12 : 0));
  const hy = fy - 16;
  return (
    <g>
      {[[-11, 3], [11, 3], [0, -4], [0, 6]].map(([dx, dy]) => <line key={`${dx}${dy}`} x1={fx} y1={fy - 2} x2={fx + dx} y2={fy + dy} style={{ stroke: '#3a3f4c', strokeWidth: 2.4, strokeLinecap: 'round' }} />)}
      <rect x={fx - 1.6} y={hy} width={3.2} height={14} style={{ fill: '#3a3f4c' }} />
      <ellipse cx={fx} cy={hy + 1} rx={14} ry={5.5} style={S('chair-dark', 'chair-line', 1)} />
      <rect x={fx - 16} y={hy - 33} width={32} height={31} rx={7} style={S('chair', 'chair-line', 1.2)} />
      <rect x={fx - 13} y={hy - 30} width={4} height={23} rx={2} style={S('chair-hi')} />
      <rect x={fx + 9} y={hy - 30} width={4} height={25} rx={2} style={S('chair-dark')} />
    </g>
  );
}

export function IlloSeated({ gx, gy, look, outfit, color, seed, headset = false }: { gx: number; gy: number; look: Look; outfit: Outfit; color: string; seed: number; headset?: boolean }) {
  const [hx, hy] = hipsOf(gx, gy);
  return (
    <g transform={`translate(${hx.toFixed(1)} ${hy.toFixed(1)})`}>
      <Torso look={look} outfit={outfit} color={color} belt={false} />
      <Head look={look} blinkDelay={`${(seed * 1.7) % 7}s`} headset={headset} />
    </g>
  );
}

/** Arms over the desk, hands on the keyboard (typing = the classic typing animation classes). */
export function IlloSeatedArms({ gx, gy, look, outfit, color, typing, seed }: { gx: number; gy: number; look: Look; outfit: Outfit; color: string; typing: 'sometimes' | 'busy' | 'no'; seed: number }) {
  const [hx, hy] = hipsOf(gx, gy);
  const h1 = iso(gx + 1.25, gy + 0.12, DESK.h + 1); const h2 = iso(gx + 1.45, gy + 0.02, DESK.h + 1);
  const l: Pt = [h1[0] - hx, h1[1] - hy]; const r: Pt = [h2[0] - hx, h2[1] - hy];
  const cls = typing === 'busy' ? 'mhq-px-type-busy' : typing === 'sometimes' ? 'mhq-px-type' : undefined;
  return (
    <g transform={`translate(${hx.toFixed(1)} ${hy.toFixed(1)})`}>
      <g className={cls} style={{ animationDelay: `${(seed * 1.3) % 9}s` }}>
        <Arm d={`M -9.8 -18.5 Q -12.5 -8 ${l[0]} ${l[1]}`} hand={l} look={look} outfit={outfit} color={color} />
        <Arm d={`M 9.8 -18.5 Q 12.5 -8 ${r[0]} ${r[1]}`} hand={r} look={look} outfit={outfit} color={color} far />
      </g>
    </g>
  );
}

/** Name plate standing on the desk's front edge (same place as the classic one), in the desk's perspective. */
function IlloPlate({ gx, gy, color, plate }: { gx: number; gy: number; color: string; plate: DeskPlateInfo }) {
  const x0 = gx + 0.1; const w = 1.4; const y0 = gy + 0.84; const d = 0.1; const z0 = DESK.h; const H = 12;
  const face = w * 32;
  const text = plate.text.length > 24 ? `${plate.text.slice(0, 23)}…` : plate.text;
  const size = 7.4;
  const dot = { good: 'var(--status-good)', warn: 'var(--status-warning)', bad: 'var(--status-critical)', off: 'var(--mhq-ink-soft)' }[plate.dot];
  return (
    <g aria-hidden="true">
      <Box x0={x0} x1={x0 + w} y0={y0} y1={y0 + d} z0={z0} z1={z0 + 1.6} top="plate-base-hi" front="plate-base" side="plate-base-sh" line="plate-base-sh" w={0.5} />
      <g transform={onFront(iso(x0, y0 + d, z0 + H + 1.6))}>
        <rect width={face} height={H} rx={2.5} style={S('plate', 'plate-border', 1)} />
        <rect x={2} y={1.5} width={face - 4} height={1.4} rx={0.7} style={S('plate-hi')} />
        <rect x={2.5} y={2.5} width={2.4} height={H - 5} rx={1} style={{ fill: color }} />
        <circle cx={face - 5} cy={H / 2} r={2.2} style={{ fill: dot, stroke: v('person-line'), strokeWidth: 0.5 }} />
        <FitText max={face - 16} x={face / 2 - 1} y={H / 2 + size * 0.36} textAnchor="middle" style={{ fill: v('plate-ink'), fontFamily: FONT, fontWeight: 800, fontSize: size }}>{text}</FitText>
      </g>
    </g>
  );
}

/** Wooden desk with two drawers, monitor (the classic one: it shows the real figures), keyboard, mug, papers, props. */
export function IlloDesk({ gx, gy, color, monitorOn, syncing, papers = 0, decor = 0, screen = null, detail = false, props = null, plate = null }: {
  gx: number; gy: number; color: string; monitorOn: boolean; syncing: boolean; papers?: number; decor?: number; screen?: MonitorScreen | null; detail?: boolean;
  props?: 'phone' | 'receipts' | 'studio' | 'cash' | null; plate?: DeskPlateInfo | null;
}) {
  const { w, d, h } = DESK;
  const top = (x: number, y: number) => iso(gx + x, gy + y, h);
  const [bx, by] = iso(gx + 0.42, gy + 0.62, h);
  const fw = w * 32;
  return (
    <g>
      <polygon points={pts(iso(gx + 0.12, gy + d), iso(gx + w, gy + d), iso(gx + w, gy + 0.1), iso(gx + w + 0.22, gy + 0.1), iso(gx + w + 0.22, gy + d + 0.18), iso(gx + 0.12, gy + d + 0.18))} style={S('shadow')} />
      <Box x0={gx} x1={gx + w} y0={gy} y1={gy + d} z0={0} z1={h} top="wood-top" front="wood-front" side="wood-side" line="wood-line" />
      {[0.25, 0.5, 0.75].map((k) => <line key={k} x1={top(0.05, k)[0]} y1={top(0.05, k)[1]} x2={top(w - 0.05, k)[0]} y2={top(w - 0.05, k)[1]} style={{ stroke: v('wood-grain'), strokeWidth: 0.8 }} />)}
      <line x1={top(0, d)[0]} y1={top(0, d)[1]} x2={top(w, d)[0]} y2={top(w, d)[1]} style={{ stroke: v('wood-hi'), strokeWidth: 1.4 }} />
      <g transform={onFront(iso(gx, gy + d, h))}>
        <rect x={0.5} y={0.5} width={fw - 1} height={2.4} style={S('wood-shadow')} />
        {[6, 11, 16].map((y) => <line key={y} x1={1} y1={y} x2={fw - 1} y2={y} style={{ stroke: v('wood-front-line'), strokeWidth: 0.6 }} />)}
        {[[4, fw / 2 - 2.5], [fw / 2 + 2.5, fw - 4]].map(([a, b]) => (
          <g key={a}>
            <rect x={a} y={4.5} width={b - a} height={h - 8.5} rx={1.2} style={S('wood-front', 'wood-panel', 1)} />
            <ellipse cx={(a + b) / 2} cy={8.5} rx={3} ry={1.5} style={S('knob', 'wood-line', 0.6)} />
          </g>
        ))}
      </g>
      <g transform={onSide(iso(gx + w, gy + d, h))}>
        <rect x={0.5} y={0.5} width={d * 32 - 1} height={2.4} style={S('wood-shadow')} />
        {[6, 11, 16].map((y) => <line key={y} x1={1} y1={y} x2={d * 32 - 1} y2={y} style={{ stroke: v('wood-side-line'), strokeWidth: 0.6 }} />)}
      </g>
      {/* keyboard lying in front of the colleague */}
      <polygon points={pts(top(1.08, 0.0), top(1.56, 0.0), top(1.56, 0.3), top(1.08, 0.3))} style={S('key', 'metal-line', 0.7)} />
      {[0.1, 0.2].map((k) => <line key={k} x1={top(1.12, k)[0]} y1={top(1.12, k)[1]} x2={top(1.52, k)[0]} y2={top(1.52, k)[1]} style={{ stroke: v('key-dark'), strokeWidth: 0.7, strokeDasharray: '1.6 1' }} />)}
      <Monitor bx={bx} by={by} color={color} monitorOn={monitorOn} syncing={syncing} screen={screen} detail={detail} />
      {papers > 0 && (() => {
        const [px, py] = top(w - 0.42, d - 0.35);
        return <g>{Array.from({ length: papers }, (_, i) => <polygon key={i} points={`${px - 10},${py - i * 1.6} ${px},${py - 5 - i * 1.6} ${px + 10},${py - i * 1.6} ${px},${py + 5 - i * 1.6}`} fill={i % 2 ? '#f8fafc' : '#eef2f7'} stroke="#cbd5e1" strokeWidth={0.5} />)}</g>;
      })()}
      {papers === 0 && !props && (() => {
        const [ux, uy] = top(w - 0.2, d - 0.25);
        return decor % 3 === 2
          ? <g><Pot cx={ux} by={uy} w={9} h={7} /><Crown cx={ux} cy={uy - 12} clusters={[[-3, 1, 4], [3, 1, 4], [0, -3, 4.5]]} /></g>
          : <g><path d={`M${ux + 3} ${uy - 7} q4 0 4 3 q0 3 -4 3`} style={{ fill: 'none', stroke: dark(color, 30), strokeWidth: 1.3 }} /><path d={`M${ux - 4} ${uy - 9} L${ux - 4} ${uy - 1} Q${ux} ${uy + 1.5} ${ux + 4} ${uy - 1} L${ux + 4} ${uy - 9} Z`} style={S(color, dark(color, 45), 0.8)} /><ellipse cx={ux} cy={uy - 9} rx={4} ry={1.5} style={S(dark(color, 40), dark(color, 50), 0.6)} /></g>;
      })()}
      {props === 'phone' && (() => { const [px, py] = top(w - 0.32, d - 0.32); return (
        <g aria-hidden="true">
          <polygon points={`${px - 9},${py} ${px},${py - 4.5} ${px + 9},${py} ${px},${py + 4.5}`} fill="#334155" />
          <polygon points={`${px - 9},${py} ${px},${py + 4.5} ${px},${py + 7} ${px - 9},${py + 2.5}`} fill="#1e293b" />
          <path d={`M ${px - 6} ${py - 3} q 6 -6 12 0`} fill="none" stroke="#0f172a" strokeWidth={3.2} strokeLinecap="round" />
        </g>
      ); })()}
      {props === 'receipts' && (() => { const [px, py] = top(w - 0.32, d - 0.3); return (
        <g aria-hidden="true">
          <line x1={px + 6} y1={py} x2={px + 6} y2={py - 14} stroke="#475569" strokeWidth={1.2} />
          {[0, 3, 6].map((k) => <rect key={k} x={px + 2} y={py - 12 + k} width={8} height={4} fill="#fffbeb" stroke="#e5e7eb" strokeWidth={0.4} transform={`rotate(${k * 4 - 6} ${px + 6} ${py - 10 + k})`} />)}
          {[0, 1, 2].map((k) => <rect key={`r${k}`} x={px - 12 + k * 4} y={py - 4 - k} width={5} height={9} fill="#fafafa" stroke="#cbd5e1" strokeWidth={0.4} transform={`rotate(${-20 + k * 14} ${px - 9 + k * 4} ${py})`} />)}
        </g>
      ); })()}
      {props === 'studio' && (() => { const [px, py] = top(w - 0.3, d - 0.3); return (
        <g aria-hidden="true">
          <rect x={px - 8} y={py - 9} width={16} height={10} rx={1} fill="#111827" />
          <polygon points={`${px - 8},${py - 9} ${px + 8},${py - 13} ${px + 8},${py - 10} ${px - 8},${py - 6}`} fill="#f8fafc" />
        </g>
      ); })()}
      {props === 'cash' && (() => { const [px, py] = top(w - 0.32, d - 0.3); return <g aria-hidden="true">{[0, 1, 2].map((k) => <CashBundle key={k} x={px - 6 + (k % 2) * 7} y={py - k * 3} />)}</g>; })()}
      {plate && <IlloPlate gx={gx} gy={gy} color={color} plate={plate} />}
    </g>
  );
}
