'use client';

/**
 * Elementos del garaje en el estilo "Illustrated" (mismas primitivas y paleta que el original):
 * la calle y la puerta enrollable del parking (adaptadas de DockApron / DockDoor), el camión portacoches
 * (adaptado de Truck), la caseta de la ITV, el elevador del taller, árboles, bancos, conos, farolas,
 * murete con setos y palés de cajas (Pallet tal cual).
 */
import { FitText, IsoBox } from './figures';
import { Box, Crown, dark, FONT, light, onFront, onSide, S, v } from './illustrated';
import { iso, pts, SLAB } from '@/lib/garage/world';

const CARD = { top: '#e3b878', left: '#c9965a', right: '#b07f47' };
const STEEL = { top: '#9ca3af', left: '#6b7280', right: '#4b5563' };

/** Calle al mismo nivel que el parking, delante del borde frontal (y = depth), con la acera y el canto de la losa */
export function StreetApron({ x0, x1, y0, y1, gateX }: { x0: number; x1: number; y0: number; y1: number; gateX: number }) {
  const A = (x: number, y: number) => iso(x, y, 0);
  const mid = (y0 + y1) / 2;
  const kerb = 0.35;
  return (
    <g aria-hidden="true">
      <polygon points={pts(A(x0, y0), A(x1, y0), A(x1, y1), A(x0, y1))} style={{ fill: '#8f96a3' }} />
      {/* acera del otro lado y canto de madera, como el resto de la losa */}
      <polygon points={pts(A(x0, y1 - kerb), A(x1, y1 - kerb), A(x1, y1), A(x0, y1))} style={{ fill: '#d6d0c4', stroke: '#b9b2a5', strokeWidth: 0.8 }} />
      <polygon points={pts(A(x0, y1), A(x1, y1), iso(x1, y1, -SLAB), iso(x0, y1, -SLAB))} style={S('wood-front', 'wood-line', 1)} />
      <polygon points={pts(A(x1, y0), A(x1, y1), iso(x1, y1, -SLAB), iso(x1, y0, -SLAB))} style={S('wood-side', 'wood-line', 1)} />
      {/* línea discontinua central */}
      <line x1={A(x0, mid)[0]} y1={A(x0, mid)[1]} x2={A(x1, mid)[0]} y2={A(x1, mid)[1]} style={{ stroke: '#facc15', strokeWidth: 2, strokeDasharray: '14 10' }} />
      {/* paso de cebra a la salida de la puerta */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = gateX - 1.25 + i * 0.45;
        return <polygon key={i} points={pts(A(a, y0 + 0.15), A(a + 0.22, y0 + 0.15), A(a + 0.22, mid - 0.25), A(a, mid - 0.25))} style={{ fill: '#fffaf0', opacity: 0.85 }} />;
      })}
    </g>
  );
}

/** Puerta enrollable del parking en el borde frontal (cara y = const), siempre abierta: la persiana arriba. */
export function ParkGate({ x, y }: { x: number; y: number }) {
  const H = 64; const half = 1.45;
  const a = x - half; const b = x + half;
  const F = (xx: number, z: number) => iso(xx, y, z);
  return (
    <g aria-hidden="true">
      <IsoBox x={a - 0.3} y={y - 0.15} w={0.3} d={0.3} h={H + 14} top={STEEL.top} left={STEEL.left} right={STEEL.right} />
      <IsoBox x={b} y={y - 0.15} w={0.3} d={0.3} h={H + 14} top={STEEL.top} left={STEEL.left} right={STEEL.right} />
      <IsoBox x={a - 0.3} y={y - 0.15} w={b - a + 0.6} d={0.3} z0={H} h={14} top={STEEL.top} left={STEEL.left} right={STEEL.right} />
      {/* la persiana enrollada asoma bajo la caja */}
      <polygon points={pts(F(a, H - 6), F(b, H - 6), F(b, H), F(a, H))} style={{ fill: '#94a3b8' }} />
      {[H - 4, H - 2].map((z) => <line key={z} x1={F(a, z)[0]} y1={F(a, z)[1]} x2={F(b, z)[0]} y2={F(b, z)[1]} style={{ stroke: '#64748b', strokeWidth: 1 }} />)}
      <g transform={onFront(iso(a + 0.3, y + 0.15, H + 12))}>
        <rect x={0} y={0} width={(b - a - 0.6) * 32} height={10} rx={2} style={{ fill: '#facc15' }} />
        <FitText max={(b - a - 0.6) * 32 - 6} x={(b - a - 0.6) * 16} y={7.4} textAnchor="middle" style={{ fill: '#1e293b', fontFamily: FONT, fontWeight: 900, fontSize: 6.6, letterSpacing: '0.22em' }}>NORDRIVE · ENTRADA</FitText>
      </g>
      {/* rayas de peligro en el suelo bajo la puerta */}
      {Array.from({ length: 10 }, (_, i) => {
        const s0 = a + (i * (b - a)) / 10; const s1 = s0 + (b - a) / 10;
        return <polygon key={i} points={pts(iso(s0, y - 0.4), iso(s1, y - 0.4), iso(s1, y), iso(s0, y))} style={{ fill: i % 2 ? '#111827' : '#facc15', opacity: 0.85 }} />;
      })}
    </g>
  );
}

/**
 * Camión portacoches en la calle (largo en x, la cabina mira a la puerta, +x). Se dibuja en dos partes para que
 * los coches de la plataforma queden encima de ella pero detrás de la cabina: 'base' (sombra, chasis, plataforma,
 * rampa) y 'cab' (cabina y su rueda).
 */
export function CarCarrier({ x, y, part }: { x: number; y: number; part: 'base' | 'cab' }) {
  const g = 0;
  const L = 6.6; const d = 1.5;
  const x0 = x - L; const y0 = y - d / 2;
  const wheel = (a: number) => {
    const [wx, wy] = iso(x0 + a, y0 + d + 0.01, g + 8);
    return (
      <g key={a} transform={`matrix(1 0.5 0 1 ${wx.toFixed(1)} ${wy.toFixed(1)})`}>
        <circle r={8} style={{ fill: '#2c2f3a', stroke: '#1a1c24', strokeWidth: 1 }} />
        <circle r={4} style={{ fill: '#cbd5e1', stroke: '#8a94a6', strokeWidth: 0.6 }} />
        <circle r={1.4} style={{ fill: '#8a94a6' }} />
      </g>
    );
  };
  if (part === 'cab') return (
    <g aria-hidden="true">
      <IsoBox x={x0 + L + 0.05} y={y0 + 0.05} w={1.35} d={d - 0.1} z0={g + 14} h={40} top="#1d4ed8" left="#2563eb" right="#1e40af" />
      <polygon points={pts(iso(x0 + L + 1.4, y0 + 0.25, g + 34), iso(x0 + L + 1.4, y0 + d - 0.25, g + 34), iso(x0 + L + 1.4, y0 + d - 0.25, g + 50), iso(x0 + L + 1.4, y0 + 0.25, g + 50))} fill="#bfdbfe" />
      <polygon points={pts(iso(x0 + L + 0.25, y0 + d - 0.05, g + 34), iso(x0 + L + 1.15, y0 + d - 0.05, g + 34), iso(x0 + L + 1.15, y0 + d - 0.05, g + 50), iso(x0 + L + 0.25, y0 + d - 0.05, g + 50))} fill="#bfdbfe" opacity={0.9} />
      <g transform={onFront(iso(x0 + L + 0.2, y0 + d - 0.05, g + 30))}>
        <text x={0} y={8} style={{ fill: '#e0e7ff', fontFamily: FONT, fontWeight: 900, fontSize: 6 }}>NORDRIVE</text>
      </g>
      {wheel(L + 0.95)}
    </g>
  );
  return (
    <g aria-hidden="true">
      <polygon points={pts(iso(x0 - 0.1, y0 - 0.05, g), iso(x0 + L + 1.6, y0 - 0.05, g), iso(x0 + L + 1.6, y0 + d + 0.25, g), iso(x0 - 0.1, y0 + d + 0.25, g))} style={S('shadow')} />
      {/* chasis y plataforma */}
      <IsoBox x={x0} y={y0 + 0.1} w={L + 1.4} d={d - 0.2} z0={g + 8} h={6} top="#374151" left="#1f2937" right="#111827" />
      <IsoBox x={x0} y={y0} w={L} d={d} z0={g + 14} h={4} top="#cbd5e1" left="#94a3b8" right="#64748b" />
      <polygon points={pts(iso(x0 + 0.2, y0 + d, g + 15), iso(x0 + L - 0.2, y0 + d, g + 15), iso(x0 + L - 0.2, y0 + d, g + 17), iso(x0 + 0.2, y0 + d, g + 17))} style={{ fill: 'var(--brand)' }} />
      {/* rampa trasera */}
      <polygon points={pts(iso(x0, y0 + 0.15, g + 18), iso(x0, y0 + d - 0.15, g + 18), iso(x0 - 0.9, y0 + d - 0.15, g + 2), iso(x0 - 0.9, y0 + 0.15, g + 2))} style={{ fill: '#94a3b8', stroke: '#475569', strokeWidth: 0.8 }} />
      {[0.9, 2.6, L - 0.8].map(wheel)}
    </g>
  );
}

/** Caseta de la ITV con ventanilla, cartel y el montón de papeles (crece con los coches en trámites). */
export function ItvBooth({ x, y, pending }: { x: number; y: number; pending: number }) {
  const w = 1.6; const d = 1.4; const h = 52;
  const purple = '#8b5cf6';
  return (
    <g>
      <polygon points={pts(iso(x + 0.1, y + d), iso(x + w + 0.25, y + d), iso(x + w + 0.25, y + 0.1), iso(x + w + 0.35, y + d + 0.25), iso(x + 0.1, y + d + 0.25))} style={S('shadow')} />
      <Box x0={x} x1={x + w} y0={y} y1={y + d} z0={0} z1={h} top={light(purple, 30)} front={purple} side={dark(purple, 22)} line={dark(purple, 60)} />
      <polygon points={pts(iso(x + 0.25, y + d, 20), iso(x + w - 0.25, y + d, 20), iso(x + w - 0.25, y + d, 42), iso(x + 0.25, y + d, 42))} style={S('#dcf4ff', dark(purple, 60), 1)} />
      <polygon points={pts(iso(x + 0.25, y + d, 20), iso(x + w - 0.25, y + d, 20), iso(x + w - 0.25, y + d + 0.25, 20), iso(x + 0.25, y + d + 0.25, 20))} style={S('wood-top', 'wood-line', 0.8)} />
      <Box x0={x - 0.15} x1={x + w + 0.15} y0={y - 0.15} y1={y + d + 0.15} z0={h} z1={h + 6} top="plate" front="plate-shade" side="plate-shade" line="plate-border" />
      <g transform={onFront(iso(x + 0.05, y + d + 0.15, h + 18))}>
        <rect width={(w + 0.1) * 32} height={11} rx={2.5} style={S('plate', 'plate-border', 1)} />
        <FitText max={(w + 0.1) * 32 - 8} x={((w + 0.1) * 32) / 2} y={8} textAnchor="middle" style={{ fill: v('plate-ink'), fontFamily: FONT, fontWeight: 800, fontSize: 7 }}>ITV · PAPELES</FitText>
      </g>
      {/* papeles en el mostrador */}
      {Array.from({ length: Math.max(1, Math.min(6, pending + 1)) }, (_, i) => {
        const [px, py] = iso(x + 0.8, y + d + 0.12, 20 + i * 1.6);
        return <polygon key={i} points={`${px - 8},${py} ${px},${py - 4} ${px + 8},${py} ${px},${py + 4}`} fill={i % 2 ? '#f8fafc' : '#eef2f7'} stroke="#cbd5e1" strokeWidth={0.5} />;
      })}
    </g>
  );
}

/** Elevador del taller (dos columnas, brazos amarillos), carro de herramientas rojo y panel de herramientas. */
export function WorkshopLift({ x, y }: { x: number; y: number }) {
  const m = { top: STEEL.top, left: STEEL.left, right: STEEL.right };
  const yellow = { top: '#facc15', left: '#eab308', right: '#ca8a04' };
  const red = '#d64a4a';
  return (
    <g>
      <IsoBox x={x} y={y + 0.15} w={0.3} d={0.3} h={78} {...m} />
      <IsoBox x={x} y={y + 2.25} w={0.3} d={0.3} h={78} {...m} />
      <IsoBox x={x + 0.3} y={y + 0.25} w={1.4} d={0.12} z0={14} h={4} {...yellow} />
      <IsoBox x={x + 0.3} y={y + 2.35} w={1.4} d={0.12} z0={14} h={4} {...yellow} />
      {/* carro de herramientas */}
      <Box x0={x + 1.9} x1={x + 2.6} y0={y - 0.5} y1={y - 0.05} z0={0} z1={30} top={light(red, 25)} front={red} side={dark(red, 22)} line="chair-line" />
      {[9, 17, 25].map((z) => <line key={z} x1={iso(x + 1.95, y - 0.05, z)[0]} y1={iso(x + 1.95, y - 0.05, z)[1]} x2={iso(x + 2.55, y - 0.05, z)[0]} y2={iso(x + 2.55, y - 0.05, z)[1]} style={{ stroke: 'var(--px-chair-line)', strokeWidth: 0.9 }} />)}
      {[0.12, 0.3, 0.48].map((k) => { const [hx, hy] = iso(x + 1.95 + k, y - 0.05, 27); return <rect key={k} x={hx - 1} y={hy - 1} width={2.4} height={1.2} rx={0.5} fill="#ffd75e" />; })}
      {/* llave inglesa y destornillador sobre el carro */}
      {(() => { const [tx, ty] = iso(x + 2.25, y - 0.28, 30); return <g><rect x={tx - 7} y={ty - 1} width={10} height={2} rx={1} fill="#94a3b8" /><rect x={tx + 2} y={ty - 4} width={2} height={7} rx={1} fill="#2a78d6" /></g>; })()}
    </g>
  );
}

/** Árbol de copa redonda (la misma copa que las plantas del original, más grande). */
export function Tree({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  const [px, py] = iso(x, y); const s = size;
  return (
    <g className="mhq-sway" style={{ transformOrigin: `${px}px ${py}px`, animationDelay: `${(x * 3 + y) % 5}s` }}>
      <ellipse cx={px + 4} cy={py} rx={26 * s} ry={9 * s} style={S('shadow')} />
      <rect x={px - 3.5 * s} y={py - 38 * s} width={7 * s} height={38 * s} rx={3} style={S('trunk', 'wood-line', 1)} />
      <rect x={px - 2 * s} y={py - 34 * s} width={2 * s} height={28 * s} rx={1} style={S('trunk-hi')} />
      <Crown cx={px} cy={py - 62 * s} clusters={[[-16 * s, 10 * s, 15 * s], [16 * s, 10 * s, 15 * s], [0, 14 * s, 15 * s], [-10 * s, -10 * s, 15 * s], [11 * s, -9 * s, 14 * s], [0, -22 * s, 13 * s], [0, 0, 16 * s]]} />
    </g>
  );
}

/** Banco de madera de dos tablas con patas metálicas. */
export function Bench({ x, y, axis = 'x' }: { x: number; y: number; axis?: 'x' | 'y' }) {
  if (axis === 'y') {
    // largo en y, el asiento mira a +x (al camino) y el respaldo queda detrás
    return (
      <g>
        {[[0.1, 0.1], [0.1, 1.3], [0.42, 0.1], [0.42, 1.3]].map(([a, b]) => { const [p1x, p1y] = iso(x + a, y + b, 0); const [p2x, p2y] = iso(x + a, y + b, 14); return <line key={`${a}${b}`} x1={p1x} y1={p1y} x2={p2x} y2={p2y} style={{ stroke: 'var(--px-metal-line)', strokeWidth: 2.4, strokeLinecap: 'round' }} />; })}
        <Box x0={x - 0.02} x1={x + 0.1} y0={y} y1={y + 1.4} z0={20} z1={34} top="wood-top" front="wood-front" side="wood-side" line="wood-line" />
        <Box x0={x} x1={x + 0.5} y0={y} y1={y + 1.4} z0={14} z1={17} top="wood-top" front="wood-front" side="wood-side" line="wood-line" />
      </g>
    );
  }
  return (
    <g>
      {[[0.1, 0.1], [1.3, 0.1], [0.1, 0.42], [1.3, 0.42]].map(([a, b]) => { const [p1x, p1y] = iso(x + a, y + b, 0); const [p2x, p2y] = iso(x + a, y + b, 14); return <line key={`${a}${b}`} x1={p1x} y1={p1y} x2={p2x} y2={p2y} style={{ stroke: 'var(--px-metal-line)', strokeWidth: 2.4, strokeLinecap: 'round' }} />; })}
      <Box x0={x} x1={x + 1.4} y0={y} y1={y + 0.5} z0={14} z1={17} top="wood-top" front="wood-front" side="wood-side" line="wood-line" />
      <Box x0={x} x1={x + 1.4} y0={y - 0.02} y1={y + 0.1} z0={20} z1={34} top="wood-top" front="wood-front" side="wood-side" line="wood-line" />
    </g>
  );
}

export function Cone({ x, y }: { x: number; y: number }) {
  const [bx, by] = iso(x, y);
  return (
    <g style={{ stroke: '#7a2e12', strokeWidth: 1, strokeLinejoin: 'round' }}>
      <ellipse cx={bx + 2} cy={by + 1} rx={9} ry={3.5} style={{ fill: 'var(--px-shadow)', stroke: 'none' }} />
      <polygon points={`${bx - 7},${by} ${bx + 7},${by} ${bx + 6},${by - 3} ${bx - 6},${by - 3}`} fill="#c4502a" />
      <polygon points={`${bx - 5},${by - 3} ${bx + 5},${by - 3} ${bx},${by - 19}`} fill="#eb6834" />
      <polygon points={`${bx - 3.4},${by - 8} ${bx + 3.4},${by - 8} ${bx + 2.3},${by - 12} ${bx - 2.3},${by - 12}`} fill="#fffaf0" style={{ stroke: 'none' }} />
    </g>
  );
}

/** Farola exterior: el mismo poste que la lámpara del original con un farol encima. */
export function StreetLamp({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  const [px, py] = iso(x, y);
  return (
    <g>
      <ellipse cx={px + 2} cy={py} rx={10} ry={3.5} style={S('shadow')} />
      <ellipse cx={px} cy={py - 1} rx={6} ry={2.4} style={S('metal', 'metal-line', 1)} />
      <rect x={px - 1.6} y={py - 104} width={3.2} height={103} style={S('metal', 'metal-line', 0.7)} />
      <path d={`M${px} ${py - 102} q 0 -10 12 -10`} style={{ fill: 'none', stroke: v('metal'), strokeWidth: 3, strokeLinecap: 'round' }} />
      <path d={`M${px + 5} ${py - 112} L${px + 19} ${py - 112} L${px + 16} ${py - 104} L${px + 8} ${py - 104} Z`} style={S(lit ? '#ffe9a0' : 'lamp', 'lamp-sh', 1.1)} />
      {lit && <ellipse cx={px + 12} cy={py - 103} rx={8} ry={2.4} style={{ fill: '#fff7cc' }} />}
    </g>
  );
}

/** Murete de ladrillo (eje x o y) con setos encima a trozos. */
export function LowWall({ x, y, len, axis }: { x: number; y: number; len: number; axis: 'x' | 'y' }) {
  const brick = { top: '#e9a07c', front: '#c46a48', side: '#a4553a', line: '#6a2c18' };
  const hedge = { top: 'leaf-hi', front: 'leaf', side: 'leaf-dark', line: 'leaf-line' };
  const w = axis === 'x' ? len : 0.32; const d = axis === 'x' ? 0.32 : len;
  const pieces = Math.floor(len / 2.4);
  return (
    <g>
      <Box x0={x} x1={x + w} y0={y} y1={y + d} z0={0} z1={16} {...brick} />
      {Array.from({ length: pieces }, (_, i) => {
        const a = 0.3 + i * 2.4; const l = 1.6;
        return axis === 'x'
          ? <Box key={i} x0={x + a} x1={x + a + l} y0={y - 0.06} y1={y + 0.38} z0={16} z1={30} {...hedge} />
          : <Box key={i} x0={x - 0.06} x1={x + 0.38} y0={y + a} y1={y + a + l} z0={16} z1={30} {...hedge} />;
      })}
    </g>
  );
}

/** Palé con hasta 12 cajas (2 × 2 por capa). Tal cual el original. */
export function Pallet({ x, y, boxes }: { x: number; y: number; boxes: number }) {
  const n = Math.max(0, Math.min(12, boxes));
  return (
    <g>
      <IsoBox x={x} y={y} w={1.3} d={1.1} h={6} top="#d6b37a" left="#a47c45" right="#8a673a" />
      {Array.from({ length: n }, (_, i) => {
        const layer = Math.floor(i / 4); const k = i % 4;
        return <IsoBox key={i} x={x + 0.05 + (k % 2) * 0.62} y={y + 0.05 + Math.floor(k / 2) * 0.52} w={0.56} d={0.48} z0={6 + layer * 17} h={16} top={CARD.top} left={CARD.left} right={CARD.right} />;
      })}
    </g>
  );
}

/** Banderines de colores entre dos postes (la exposición de coches a la venta). */
export function Bunting({ from, to, colors }: { from: [number, number]; to: [number, number]; colors: string[] }) {
  const flags = 12; const sag = 10;
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + sag * 1.25];
  return (
    <g>
      <path d={`M ${from[0]} ${from[1]} Q ${mid[0]} ${mid[1]} ${to[0]} ${to[1]}`} fill="none" style={{ stroke: 'var(--px-wood-line)', strokeWidth: 1 }} />
      {Array.from({ length: flags }, (_, i) => {
        const t = (i + 0.5) / flags;
        const x = from[0] + (to[0] - from[0]) * t;
        const y = from[1] + (to[1] - from[1]) * t + Math.sin(Math.PI * t) * sag;
        const c = colors[i % colors.length];
        return <polygon key={i} points={`${x - 4},${y} ${x + 4},${y} ${x},${y + 8}`} style={{ fill: c, stroke: dark(c, 45), strokeWidth: 0.7, strokeLinejoin: 'round' }} />;
      })}
    </g>
  );
}

/** Cartel en el suelo-pared: placa con texto sobre la cara frontal o lateral */
export function FacePlate({ at, plane, width, text, size = 7 }: { at: [number, number]; plane: 'front' | 'side'; width: number; text: string; size?: number }) {
  return (
    <g transform={plane === 'front' ? onFront(at) : onSide(at)}>
      <rect width={width} height={size + 5} rx={2.5} style={S('plate', 'plate-border', 1)} />
      <FitText max={width - 6} x={width / 2} y={(size + 5) / 2 + size * 0.36} textAnchor="middle" style={{ fill: v('plate-ink'), fontFamily: FONT, fontWeight: 800, fontSize: size }}>{text}</FitText>
    </g>
  );
}
