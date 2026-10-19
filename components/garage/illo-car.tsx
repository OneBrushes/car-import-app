'use client';

/**
 * Coche del garaje en el estilo "Illustrated": sólidos con 3 tonos sacados del color del coche
 * (arriba claro, frente medio, lado oscuro) y contorno cálido. Carrocería con canto redondeado y capó
 * que cae hacia el morro, cabina con lunas inclinadas, ventanillas con pilares y brillo, pasos de rueda,
 * llantas, faros, calandra, paragolpes, retrovisor, pilotos y matrícula legible al acercarse.
 */
import { memo } from 'react';
import { iso, pts, type Pt } from '@/lib/garage/world';
import { CAR_L, CAR_W } from '@/lib/garage/geometry';
import type { BodyType } from '@/lib/garage/data';
import { FitText } from './figures';
import { dark, FONT, light, onFront, onSide, S } from './illustrated';

interface Shape {
  lower: number; cabinH: number;          // alto de carrocería y cabina (px)
  a: number; b: number;                   // la cabina va de a a b (fracción del largo; 0 = trasera, 1 = morro)
  rakeF: number; rakeR: number;           // inclinación de la luna delantera / trasera (fracción del largo)
  hood?: number;                          // caída del capó hacia el morro (px)
  bed?: boolean; rails?: boolean;
}
const SHAPES: Record<BodyType, Shape> = {
  hatchback: { lower: 12, cabinH: 12, a: 0.05, b: 0.66, rakeF: 0.19, rakeR: 0.07, hood: 2 },
  saloon: { lower: 12, cabinH: 11, a: 0.2, b: 0.7, rakeF: 0.17, rakeR: 0.12, hood: 2 },
  estate: { lower: 12, cabinH: 12, a: 0.04, b: 0.7, rakeF: 0.17, rakeR: 0.03, hood: 2 },
  suv: { lower: 16, cabinH: 14, a: 0.05, b: 0.72, rakeF: 0.13, rakeR: 0.03, hood: 1, rails: true },
  van: { lower: 15, cabinH: 19, a: 0.02, b: 0.82, rakeF: 0.1, rakeR: 0 },
  coupe: { lower: 11, cabinH: 10, a: 0.22, b: 0.66, rakeF: 0.2, rakeR: 0.17, hood: 2 },
  pickup: { lower: 14, cabinH: 13, a: 0.4, b: 0.74, rakeF: 0.12, rakeR: 0.02, bed: true },
};

export interface IlloCarProps {
  cx: number; cy: number; z?: number;
  /** "y": aparcado mirando a la calle (largo en y); "x": circulando por un carril (largo en x) */
  dir: 'x' | 'y';
  /** el morro mira hacia x / y decreciente (de espaldas a la cámara): se ve la trasera */
  rev?: boolean;
  color: string; body: BodyType; label: string;
  forSale?: boolean; sold?: boolean; night?: boolean;
}

/** Volúmenes del coche (carrocería y cabina) en el suelo, con su altura: para ajustar la capa de noche a su silueta */
export function carVolumes({ cx, cy, z = 0, dir, rev = false, body }: Pick<IlloCarProps, 'cx' | 'cy' | 'z' | 'dir' | 'rev' | 'body'>) {
  const sh = SHAPES[body] ?? SHAPES.hatchback;
  const L = CAR_L; const Wd = CAR_W;
  const dx = dir === 'y' ? Wd : L; const dy = dir === 'y' ? L : Wd;
  const x0 = cx - dx / 2; const y0 = cy - dy / 2;
  const span = (l0: number, l1: number) => (rev ? [L - l1, L - l0] : [l0, l1]);
  const rect = (l0: number, l1: number, w0: number, w1: number) => {
    const [a, b] = span(l0, l1);
    return dir === 'y' ? { x0: x0 + w0, x1: x0 + w1, y0: y0 + a, y1: y0 + b } : { x0: x0 + a, x1: x0 + b, y0: y0 + w0, y1: y0 + w1 };
  };
  const zc = z + 4 + sh.lower;
  const corners = (r: { x0: number; x1: number; y0: number; y1: number }, zz: number): [number, number, number][] =>
    [[r.x0, r.y0, zz], [r.x1, r.y0, zz], [r.x1, r.y1, zz], [r.x0, r.y1, zz]];
  const hull = rect(0, L, 0, Wd);
  const base = rect(sh.a * L, sh.b * L, 0.1, Wd - 0.1);
  const roof = rect(sh.a * L + sh.rakeR * L, sh.b * L - sh.rakeF * L, 0.17, Wd - 0.17);
  // puntos 3D de cada pieza: la carrocería y la cabina (que se estrecha hacia el techo)
  return [[...corners(hull, z), ...corners(hull, zc)], [...corners(base, zc - 1), ...corners(roof, zc + sh.cabinH)]];
}

type V3 = [number, number, number];
type Face = { edge: number | 'top'; q: Pt[] };
const proj = (p: V3) => iso(p[0], p[1], p[2]);
const area = (q: Pt[]) => q.reduce((s, p, i) => { const n = q[(i + 1) % q.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0);
const mix = (p: Pt, q: Pt, k: number): Pt => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
/** punto (u, v) dentro de un cuadrilátero [abajo-ini, abajo-fin, arriba-fin, arriba-ini] */
const bil = (q: Pt[], u: number, v: number): Pt => mix(mix(q[0], q[1], u), mix(q[3], q[2], u), v);
const sub = (q: Pt[], u0: number, u1: number, v0: number, v1: number): Pt[] => [bil(q, u0, v0), bil(q, u1, v0), bil(q, u1, v1), bil(q, u0, v1)];

/** Caras visibles de un sólido convexo dado por sus 4 esquinas de abajo y de arriba (orden x0y0, x1y0, x1y1, x0y1). */
function hull(B: V3[], T: V3[]): Face[] {
  const faces: Face[] = [{ edge: 'top', q: T.map(proj) }];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push({ edge: i, q: [B[i], B[j], T[j], T[i]].map(proj) }); }
  return faces.filter((f) => area(f.q) > 0.5);
}

export const IlloCar = memo(function IlloCar({ cx, cy, z = 0, dir, rev = false, color, body, label, forSale, sold, night }: IlloCarProps) {
  const sh = SHAPES[body] ?? SHAPES.hatchback;
  const line = dark(color, 62);
  const tone = { top: light(color, 24), front: color, side: dark(color, 20) };
  const cabinTone = { top: light(color, 34), front: light(color, 8), side: dark(color, 12) };
  const L = CAR_L; const Wd = CAR_W;
  const dx = dir === 'y' ? Wd : L; const dy = dir === 'y' ? L : Wd;
  const x0 = cx - dx / 2; const y0 = cy - dy / 2;

  // Coordenadas del coche: l a lo largo (0 = trasera, L = morro), w a lo ancho (Wd = lado visible)
  // con rev el largo se recorre al revés: el morro queda en el lado del fondo y la trasera mira a la cámara
  const P = (l0: number, w: number, zz: number): V3 => { const l = rev ? L - l0 : l0; return dir === 'y' ? [x0 + w, y0 + l, zz] : [x0 + l, y0 + w, zz]; };
  const toL = (X: number, Y: number) => { const l = dir === 'y' ? Y - y0 : X - x0; return rev ? L - l : l; };
  const corners = (l0: number, l1: number, w0: number, w1: number, zf: (l: number) => number): V3[] => {
    const a = P(l0, w0, 0); const b = P(l1, w1, 0);
    const X0 = Math.min(a[0], b[0]); const X1 = Math.max(a[0], b[0]); const Y0 = Math.min(a[1], b[1]); const Y1 = Math.max(a[1], b[1]);
    return ([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]] as Pt[]).map(([X, Y]) => [X, Y, zf(toL(X, Y))] as V3);
  };
  const flat = (zz: number) => () => zz;
  // las caras x1 son "lado" (oscuro), las y1 "frente" (medio), el resto solo asoma si está inclinada (claro)
  const fill = (e: Face['edge'], t: typeof tone) => (e === 'top' ? t.top : e === 1 ? t.side : e === 2 ? t.front : t.top);
  const longEdge = (e: Face['edge']) => (dir === 'y' ? e === 1 || e === 3 : e === 0 || e === 2);
  const draw = (faces: Face[], t: typeof tone, w = 1) => faces.map((f, i) => <polygon key={i} points={pts(...f.q)} style={S(fill(f.edge, t), line, w)} />);

  const zb = z + 4;                                   // bajos (las ruedas asoman por debajo)
  const zc = zb + sh.lower;                           // línea de cintura
  const zTop = (l: number) => zc - (sh.hood ?? 0) * (l / L);
  const cz1 = zc + sh.cabinH;
  const ins = 0.1;

  const side = (l0: number, l1: number, z0: number, z1: number) => pts(...[P(l0, Wd, z0), P(l1, Wd, z0), P(l1, Wd, z1), P(l0, Wd, z1)].map(proj));
  const lEnd = rev ? 0 : L;                          // extremo que mira a la cámara
  const nose = (w0: number, w1: number, z0: number, z1: number, l = lEnd) => pts(...[P(l, w0, z0), P(l, w1, z0), P(l, w1, z1), P(l, w0, z1)].map(proj));

  // Sólidos: carrocería, canto redondeado con capó, cabina
  const lowerFaces = hull(corners(0, L, 0, Wd, flat(zb)), corners(0, L, 0, Wd, flat(zc - 3)));
  const shoulderFaces = hull(corners(0, L, 0, Wd, flat(zc - 3)), corners(0.04, L - 0.04, 0.05, Wd - 0.05, zTop));
  const ca = sh.a * L; const cb = sh.b * L;
  const cabinFaces = hull(
    corners(ca, cb, ins, Wd - ins, zTop),
    corners(ca + sh.rakeR * L, cb - sh.rakeF * L, ins + 0.07, Wd - ins - 0.07, flat(cz1)),
  );

  // Ventanillas sobre las caras visibles de la cabina: dos en el lateral (con pilar B), una en las lunas
  const windows: { q: Pt[]; long: boolean }[] = [];
  for (const f of cabinFaces) {
    if (f.edge === 'top') continue;
    if (longEdge(f.edge)) {
      windows.push({ q: sub(f.q, 0.07, 0.47, 0.16, 0.86), long: true }, { q: sub(f.q, 0.53, 0.93, 0.16, 0.86), long: true });
    } else windows.push({ q: sub(f.q, 0.08, 0.92, 0.12, 0.9), long: false });
  }
  const glare = (q: Pt[]) => [bil(q, 0.22, 0.12), bil(q, 0.36, 0.12), bil(q, 0.26, 0.88), bil(q, 0.12, 0.88)];

  // Ruedas en el plano del lateral visible (círculos de verdad, deformados con la perspectiva)
  const sx = dir === 'x' ? 1 : -1;
  const wheels = [0.19, 0.8].map((k) => proj(P(k * L, Wd + 0.01, z + 6)));

  // Matrícula en el morro (en el plano de esa cara, para que se lea bien)
  const plateW = Wd * 32 * 0.56;
  const plateH = 6;
  const plateO = dir === 'y' ? proj(P(lEnd, Wd * 0.22, zb + 0.6 + plateH)) : proj(P(lEnd, Wd * 0.78, zb + 0.6 + plateH));
  const plateT = dir === 'y' ? onFront(plateO) : onSide(plateO);
  const lightZ0 = zc - 6.5; const lightZ1 = zc - 3.4;

  const shadow = [iso(x0 - 0.08, y0 - 0.04), iso(x0 + dx + 0.22, y0 - 0.04), iso(x0 + dx + 0.22, y0 + dy + 0.2), iso(x0 - 0.08, y0 + dy + 0.2)];
  const seams = [((sh.a + sh.b) / 2) * L, cb - 0.04];

  // Cartel "SE VENDE" en la ventanilla trasera del lateral
  const rearPt = proj(P(0, Wd, zc));
  const dist = (q: Pt[]) => Math.hypot((q[0][0] + q[1][0]) / 2 - rearPt[0], (q[0][1] + q[1][1]) / 2 - rearPt[1]);
  const rearWin = windows.filter((w) => w.long).sort((a, b) => dist(a.q) - dist(b.q))[0];
  const sale = forSale && rearWin ? (() => {
    const q = rearWin.q;
    const start = q[0][0] < q[1][0] ? q[0] : q[1];   // onSide y onFront avanzan hacia la derecha de la pantalla
    const span = Math.abs(q[1][0] - q[0][0]);
    return { t: dir === 'y' ? onSide([start[0] + span * 0.07, start[1] - 1.2]) : onFront([start[0] + span * 0.07, start[1] - 1.2]), w: span * 0.86 };
  })() : null;

  return (
    <g>
      <polygon points={pts(...shadow)} style={S('shadow')} />
      {night && (() => { const [gx, gy] = proj(P(L + 0.45, Wd / 2, z)); return <ellipse cx={gx} cy={gy} rx={14} ry={6.5} style={{ fill: '#ffe9a0', opacity: 0.42 }} />; })()}
      {/* neumáticos que asoman bajo el morro */}
      {[[0.07, 0.27], [Wd - 0.27, Wd - 0.07]].map(([a, b], i) => <polygon key={i} points={nose(a, b, z, zb + 3, rev ? 0.2 : L - 0.2)} style={{ fill: '#2c2f3a', stroke: '#1a1c24', strokeWidth: 0.6 }} />)}
      {draw(lowerFaces, tone)}
      {draw(shoulderFaces, tone)}

      {/* lateral: faldón, línea de cintura, puertas con tiradores, piloto trasero e intermitente */}
      <polygon points={side(0.03, L - 0.03, zb, zb + 2.6)} style={{ fill: dark(color, 42) }} />
      <polyline points={pts(proj(P(0.08, Wd, zc - 5.2)), proj(P(L - 0.08, Wd, zc - 5.2)))} style={{ fill: 'none', stroke: light(color, 42), strokeWidth: 1, strokeLinecap: 'round' }} />
      {seams.map((l, i) => (
        <g key={i}>
          <polyline points={pts(proj(P(l, Wd, zb + 2.8)), proj(P(l, Wd, zc - 3.2)))} style={{ fill: 'none', stroke: dark(color, 48), strokeWidth: 0.8 }} />
          <polygon points={side(l - 0.17, l - 0.06, zc - 7, zc - 5.8)} style={{ fill: light(color, 55), stroke: dark(color, 40), strokeWidth: 0.4 }} />
        </g>
      ))}
      <polygon points={side(0.005, 0.07, zc - 7.5, zc - 3.6)} style={{ fill: '#e2483e', stroke: '#8a1f18', strokeWidth: 0.5 }} />
      <polygon points={side(L - 0.08, L - 0.01, zc - 6.4, zc - 4.6)} style={{ fill: '#f59e0b', stroke: '#92400e', strokeWidth: 0.4 }} />

      {/* morro (calandra y faros) o, si va hacia el fondo, trasera (pilotos y portón) */}
      <polygon points={nose(0.02, Wd - 0.02, zb, zb + 2.8)} style={{ fill: dark(color, 46), stroke: line, strokeWidth: 0.6 }} />
      {rev ? (
        <>
          <polyline points={pts(proj(P(0, Wd * 0.3, zc - 3.6)), proj(P(0, Wd * 0.7, zc - 3.6)))} style={{ fill: 'none', stroke: dark(color, 48), strokeWidth: 0.8 }} />
          {[[0.05, 0.25], [Wd - 0.25, Wd - 0.05]].map(([a, b], i) => <polygon key={i} points={nose(a, b, lightZ0, lightZ1)} style={{ fill: '#e2483e', stroke: '#8a1f18', strokeWidth: 0.7 }} />)}
        </>
      ) : (
        <>
          <polygon points={nose(Wd * 0.3, Wd * 0.7, lightZ0 + 0.4, lightZ1 - 0.2)} style={{ fill: '#2c2f3a', stroke: '#1a1c24', strokeWidth: 0.5 }} />
          <polyline points={pts(proj(P(L, Wd * 0.32, (lightZ0 + lightZ1) / 2)), proj(P(L, Wd * 0.68, (lightZ0 + lightZ1) / 2)))} style={{ fill: 'none', stroke: '#6b7280', strokeWidth: 0.6 }} />
          {[[0.06, 0.27], [Wd - 0.27, Wd - 0.06]].map(([a, b], i) => <polygon key={i} points={nose(a, b, lightZ0, lightZ1)} style={S('lamp', line, 0.7)} />)}
        </>
      )}

      {/* pasos de rueda y ruedas con llanta */}
      {wheels.map(([wx, wy], i) => (
        <g key={i} transform={`matrix(${sx} 0.5 0 1 ${wx.toFixed(1)} ${wy.toFixed(1)})`}>
          <path d="M -8.6 0.5 A 8.6 8.6 0 0 1 8.6 0.5 Z" style={{ fill: dark(color, 58) }} />
          <circle r={6.5} style={{ fill: '#2c2f3a', stroke: '#1a1c24', strokeWidth: 1 }} />
          <circle r={3.8} style={{ fill: '#cbd5e1', stroke: '#8a94a6', strokeWidth: 0.6 }} />
          <circle r={1.3} style={{ fill: '#8a94a6' }} />
        </g>
      ))}

      {sh.bed && (
        <polygon points={pts(...corners(0.06, ca - 0.05, 0.1, Wd - 0.1, zTop).map(proj))} style={S(dark(color, 42), line, 0.8)} />
      )}

      {/* cabina, lunas y ventanillas */}
      {draw(cabinFaces, cabinTone)}
      {windows.map((w, i) => <polygon key={i} points={pts(...w.q)} style={S(w.long ? '#dcf4ff' : '#c8e8f6', dark(color, 55), 0.8)} />)}
      {windows.filter((w, i) => !w.long || i === windows.findIndex((x) => x.long)).map((w, i) => <polygon key={i} points={pts(...glare(w.q))} style={{ fill: '#ffffff', opacity: 0.8 }} />)}
      {sh.rails && [ins + 0.16, Wd - ins - 0.16].map((w, i) => (
        <polyline key={i} points={pts(proj(P(ca + sh.rakeR * L + 0.06, w, cz1 + 1.6)), proj(P(cb - sh.rakeF * L - 0.06, w, cz1 + 1.6)))} style={{ fill: 'none', stroke: dark(color, 50), strokeWidth: 1.6, strokeLinecap: 'round' }} />
      ))}
      {/* retrovisor */}
      {draw(hull(corners(cb - 0.16, cb - 0.05, Wd - 0.04, Wd + 0.09, flat(zc + 1)), corners(cb - 0.16, cb - 0.05, Wd - 0.04, Wd + 0.09, flat(zc + 4.5))), cabinTone, 0.6)}


      {/* matrícula / nombre */}
      <g transform={plateT}>
        <rect width={plateW} height={plateH} rx={1.6} style={S('plate', 'plate-border', 0.7)} />
        <FitText max={plateW - 2.4} x={plateW / 2} y={plateH / 2 + 1.7} textAnchor="middle" style={{ fill: 'var(--px-plate-ink)', fontFamily: FONT, fontWeight: 800, fontSize: 4.8 }}>{label}</FitText>
      </g>
      {sale && (
        <g transform={sale.t}>
          <rect y={-7.5} width={sale.w} height={6.5} rx={1.2} style={{ fill: '#fffaf0', stroke: '#c2410c', strokeWidth: 0.6 }} />
          <FitText max={sale.w - 2} x={sale.w / 2} y={-2.5} textAnchor="middle" style={{ fill: '#c2410c', fontFamily: FONT, fontWeight: 900, fontSize: 4.4 }}>SE VENDE</FitText>
        </g>
      )}
      {sold && (() => {
        const [tx, ty] = iso(cx, cy, cz1 + 12);
        return (
          <g transform={`translate(${tx} ${ty})`}>
            <rect x={-22} y={-8} width={44} height={14} rx={7} style={{ fill: '#ec4899', stroke: '#8a1f55', strokeWidth: 1 }} />
            <text y={2.6} textAnchor="middle" style={{ fill: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 8 }}>VENDIDO</text>
          </g>
        );
      })()}
    </g>
  );
});
