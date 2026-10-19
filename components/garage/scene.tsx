'use client';

/**
 * Escena del garaje virtual en el estilo "Illustrated" de LOOSES & WINS, compuesta igual que su OfficeScene:
 * cielo → paredes → suelo (tablones en la oficina, asfalto cálido en el parking, zonas como alfombras) →
 * elementos de pared → todo lo que pisa el suelo ordenado por depthOrder → capa de noche y luces → avisos encima.
 * Solo dibujo: los datos, las rutas, los clics y el refresco vienen de la página.
 */
import { memo, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { depthOrder } from '@/lib/garage/depth';
import {
  CAR_L, CAR_W, LABEL_BAND, SPOT_D, SPOT_W, STREET_D, ZONES, type GarageLayout, type Point, type ZoneId,
} from '@/lib/garage/geometry';
import {
  box, CLOCK, CORK, COOLER, COUNTER, DESK, deskRect, EXIT_DOOR, iso, OFFICE_D, OFFICE_DESKS, OFFICE_DOOR, OFFICE_FURNITURE,
  OFFICE_LAMPS, OFFICE_PLANTS, OFFICE_W, PERSON_R, pts, SLAB, SOFA, spot, WALL, WALL_SCREEN, WIN_BACK, WIN_SIDE, type DeskKey, type Rect,
} from '@/lib/garage/world';
import { fmtEur, fmtNum, STAGE_LABEL, UNKNOWN, type BoardCard, type GarageCar, type OfficeStats } from '@/lib/garage/data';
import { FitText, lookFor, IsoBox, type MonitorScreen, type DeskPlateInfo } from './figures';
import {
  Box, FONT, IlloChair, IlloCooler, IlloDefs, IlloDesk, IlloLamp, IlloPlant, IlloSeated, IlloSeatedArms, IlloSofa, IlloStanding, IlloWalls, S, v,
} from './illustrated';
import { carVolumes, IlloCar } from './illo-car';
import { Bench, Bunting, CarCarrier, Cone, ItvBooth, LowWall, Pallet, ParkGate, StreetApron, StreetLamp, Tree, WorkshopLift } from './props';
import { Outside, type SkyBounds } from './sky';

/** `rev`: el coche avanza hacia x / y decreciente, así que el morro mira hacia el fondo */
export interface RenderedCar { car: GarageCar; x: number; y: number; z: number; dir: 'x' | 'y'; rev?: boolean; moving: boolean; leaving: boolean }
export interface RenderedPerson {
  id: string; x: number; y: number;
  pose: 'stand' | 'walk' | 'cup' | 'papers' | 'tool' | 'chat';
  role: 'office' | 'mechanic' | 'clerk' | 'sales'; seed: number; flip?: boolean; back?: boolean;
}
export type GarageTarget = 'dashboard' | 'fiscal' | 'customers' | 'expenses' | 'reminders' | 'management' | 'import';

interface SceneProps {
  layout: GarageLayout; cars: RenderedCar[]; trucks: number; people: RenderedPerson[];
  stats: OfficeStats; board: BoardCard[];
  daylight: { isDay: boolean; f: number; altitude: number; darkness: number };
  now: Date; reduced: boolean; detail: boolean; viewBox: string;
  svgHandlers: Record<string, unknown>;
  svgRef: React.Ref<SVGSVGElement>;
  onCar: (car: GarageCar) => void; onNavigate: (target: GarageTarget) => void; onExit: () => void;
  onHover: (car: GarageCar | null, event?: React.PointerEvent) => void;
}

const MONTH = new Date().toLocaleDateString('es-ES', { month: 'long' }).toUpperCase();
const ROLE_COLOR = { mechanic: '#2a5aa8', clerk: '#8b5cf6', sales: '#1baf7a' } as const;

function linkProps(label: string, action: () => void) {
  return {
    role: 'link', tabIndex: 0, 'aria-label': label, className: 'mhq-desk cursor-pointer outline-none',
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); action(); },
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } },
  };
}

/** Texto / formas sobre el plano de una pared (como onWall del original): x interior a lo largo de la pared, y = alto */
function onWall(wall: 'back' | 'side', from: number, to: number, zTop: number) {
  return wall === 'back'
    ? { transform: `matrix(1 0.5 0 1 ${iso(from, 0, zTop).join(' ')})`, width: (to - from) * 32 }
    : { transform: `matrix(1 -0.5 0 1 ${iso(0, to, zTop).join(' ')})`, width: (to - from) * 32 };
}

/** Franja de césped (baldosas) en el lado derecho de la losa: árboles, banco y farolas, fuera de los carriles */
export const SIDE = 2.8

// Silueta en pantalla para la capa de noche: envolvente convexa de un volumen y unión de varios polígonos
type Pt2 = [number, number];
function convexHull(points: Pt2[]): Pt2[] {
  const q = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt2, a: Pt2, b: Pt2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt2[] = []; const upper: Pt2[] = [];
  for (const pt of q) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
  for (const pt of q.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
const volume = (r: Rect, z0: number, z1: number) => convexHull([z0, z1].flatMap((z) => [iso(r.x0, r.y0, z), iso(r.x1, r.y0, z), iso(r.x1, r.y1, z), iso(r.x0, r.y1, z)]));
/** Todas las piezas con el mismo sentido de giro: con fill-rule nonzero se pinta la unión una sola vez */
function unionPath(polys: Pt2[][]) {
  return polys.map((q) => {
    const a = q.reduce((sum, pt, i) => { const n = q[(i + 1) % q.length]; return sum + pt[0] * n[1] - n[0] * pt[1]; }, 0);
    const o = a < 0 ? [...q].reverse() : q;
    return `M ${o.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
  }).join(' ');
}

/** La calle está al mismo nivel que el parking */
export function groundZ(_layout: GarageLayout, _y: number) {
  return 0;
}

/** Tramo de calle que se dibuja: hasta el último camión por la izquierda y la entrada de coches por la derecha */
export function streetSpan(layout: GarageLayout) {
  return { x0: Math.min(-1, ...layout.truckSlots.map((s) => s.x - 7.8)), x1: layout.width + SIDE };
}

// =====================================================================================================================
// Suelo: losa, asfalto, oficina de tablones, zonas como alfombras, plazas
// =====================================================================================================================

const Ground = memo(function Ground({ layout }: { layout: GarageLayout }) {
  const W = layout.width; const D = layout.depth;
  const allSpots = [...layout.spots, ...layout.emptySpots];
  return (
    <g>
      <defs>
        <pattern id="nd-asphalt" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="matrix(1 0.5 -1 0.5 0 0)">
          <rect width="40" height="40" style={{ fill: '#c9c3b8' }} />
          <rect y="20" width="40" height="20" style={{ fill: '#c5bfb3' }} />
          {[[6, 8], [22, 4], [33, 15], [12, 27], [28, 31], [37, 37], [3, 35]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.1} style={{ fill: i % 2 ? '#bdb6aa' : '#b0a99c' }} />)}
        </pattern>
      </defs>
      {/* asfalto de todo el parking y canto de la losa (madera, como la oficina del original) */}
      <polygon points={pts(iso(0, 0), iso(W, 0), iso(W, D), iso(0, D))} style={{ fill: 'url(#nd-asphalt)' }} />
      {/* franja de césped con un caminito, a la derecha */}
      <polygon points={pts(iso(W, 0), iso(W + SIDE, 0), iso(W + SIDE, D), iso(W, D))} style={{ fill: 'color-mix(in oklab, var(--px-leaf) 55%, #f0d8b0)' }} />
      <polygon points={pts(iso(W + SIDE * 0.5, 0), iso(W + SIDE * 0.72, 0), iso(W + SIDE * 0.72, D), iso(W + SIDE * 0.5, D))} style={S('path', 'path-edge', 0.8)} />
      <polygon points={pts(iso(W - 0.12, 0), iso(W + 0.06, 0), iso(W + 0.06, D), iso(W - 0.12, D))} style={{ fill: '#fffaf0', stroke: '#d9cfb8', strokeWidth: 0.6 }} />
      <polygon points={pts(iso(W + SIDE, 0), iso(W + SIDE, D), iso(W + SIDE, D, -SLAB), iso(W + SIDE, 0, -SLAB))} style={S('wood-side', 'wood-line', 1)} />
      {/* oficina: suelo de tablones */}
      <polygon points={pts(iso(0, 0), iso(OFFICE_W, 0), iso(OFFICE_W, OFFICE_D), iso(0, OFFICE_D))} style={{ fill: 'url(#io-floor)' }} />
      <polygon points={pts(iso(0, OFFICE_D), iso(OFFICE_W, OFFICE_D), iso(OFFICE_W, 0))} style={{ fill: 'none', stroke: v('floor-edge'), strokeWidth: 1.4 }} />
      {/* bordillo amarillo hacia la calle, con el hueco de la puerta */}
      {[[0.2, layout.gate.x - 1.8], [layout.gate.x + 1.8, W - 0.2]].map(([a, b]) => (
        <polygon key={a} points={pts(iso(a, D - 0.22), iso(b, D - 0.22), iso(b, D), iso(a, D))} style={{ fill: '#f2c14e', stroke: '#b48a2a', strokeWidth: 0.8 }} />
      ))}
      {/* zonas: alfombras suaves con el nombre en el suelo (IlloFloor) */}
      {layout.bands.map((band) => {
        const zone = ZONES.find((z) => z.id === band.zone)!;
        const ring = (i: number) => pts(iso(band.x0 + i, band.y0 + i), iso(band.x1 - i, band.y0 + i), iso(band.x1 - i, band.y1 - i), iso(band.x0 + i, band.y1 - i));
        const size = Math.min(30, ((band.x1 - band.x0 - 0.6) * 35.8) / (zone.label.length * 0.82));
        return (
          <g key={band.zone}>
            <polygon points={ring(0.12)} style={{ ...S(`color-mix(in oklab, ${zone.accent} 26%, var(--px-rug-base))`, 'rug-line', 1.2), opacity: 0.55 }} />
            <polygon points={ring(0.3)} style={{ ...S(null, `color-mix(in oklab, ${zone.accent} 55%, var(--px-rug-base))`, 2.4), opacity: 0.6 }} />
            <text transform={`matrix(1 0.5 -1 0.5 ${iso(band.x0 + 0.45, band.y0 + LABEL_BAND * 0.78).join(' ')})`} className="pointer-events-none select-none"
              style={{ fill: `color-mix(in oklab, ${zone.accent} 70%, #2a1830)`, fontFamily: FONT, fontWeight: 800, fontSize: `${size}px`, letterSpacing: '0.18em', opacity: 0.55 }}>{zone.label}</text>
            {band.rowAisles.map((ay) => Array.from({ length: Math.max(1, Math.floor((band.x1 - band.x0) / 6)) }, (_, i) => {
              const ax = band.x0 + 2.5 + i * 6; const a = iso(ax, ay); const b = iso(ax + 1, ay);
              return <path key={`${ay}-${i}`} d={`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} m -6 -6 l 6 6 l -8 1`} style={{ fill: 'none', stroke: '#fffaf0', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.75 }} />;
            }))}
          </g>
        );
      })}
      {/* plazas: líneas blancas y números */}
      {allSpots.map((s) => {
        const l = (a: Point, b: Point) => { const p = iso(a.x, a.y); const q = iso(b.x, b.y); return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />; };
        return (
          <g key={`${s.zone}-${s.index}`} style={{ stroke: '#fffaf0', strokeWidth: 2.2, strokeLinecap: 'round' }}>
            {l({ x: s.x, y: s.y + 0.15 }, { x: s.x, y: s.y + SPOT_D - 0.15 })}
            {l({ x: s.x + SPOT_W, y: s.y + 0.15 }, { x: s.x + SPOT_W, y: s.y + SPOT_D - 0.15 })}
            <text transform={`matrix(1 0.5 -1 0.5 ${iso(s.x + SPOT_W / 2 - 0.12, s.y + 0.48).join(' ')})`} style={{ fill: '#fffaf0', stroke: 'none', fontFamily: FONT, fontWeight: 800, fontSize: 9 }}>{s.index}</text>
          </g>
        );
      })}
    </g>
  );
});

// =====================================================================================================================
// Paredes de la oficina: pantalla del mes, reloj, corcho, puerta de salida
// =====================================================================================================================

function WallScreen({ stats, onOpen }: { stats: OfficeStats; onOpen: () => void }) {
  const g = onWall('back', WALL_SCREEN.from, WALL_SCREEN.to, WALL_SCREEN.z1);
  const h = WALL_SCREEN.z1 - WALL_SCREEN.z0;
  const m = stats.month;
  const lines = [
    `Comprados ${fmtNum(m.bought)} · vendidos ${fmtNum(m.sold)}`,
    `Beneficio ${fmtEur(m.profit)}`,
    `Margen medio ${m.avgMarginPct == null ? UNKNOWN : `${m.avgMarginPct.toFixed(1).replace('.', ',')} %`}`,
    `Stock ${fmtEur(m.stockValue)}`,
  ];
  return (
    <g transform={g.transform} {...linkProps(`Resumen de ${MONTH.toLowerCase()}: ${lines.join(', ')}. Abre el Dashboard`, onOpen)}>
      <rect x={-4} y={-4} width={g.width + 8} height={h + 8} rx={4} fill="#111827" />
      <rect x={0} y={0} width={g.width} height={h} rx={2} fill="#0f172a" />
      <rect x={0} y={0} width={g.width} height={15} style={{ fill: 'var(--chart-1)' }} opacity={0.95} />
      <FitText max={g.width - 12} x={6} y={11} style={{ fill: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 8.5, letterSpacing: '0.05em' }}>{`NORDRIVE · ${MONTH}`}</FitText>
      {lines.map((l, i) => (
        <FitText key={i} max={g.width - 14} x={7} y={i === 0 ? 30 : 32 + i * 12} style={{ fill: '#f1f5f9', fontFamily: FONT, fontWeight: i === 1 ? 800 : 600, fontSize: i === 1 ? 10.5 : 8 }}>{l}</FitText>
      ))}
      <rect x={0} y={0} width={g.width} height={h} fill="url(#mhq-glare)" opacity={0.25} />
    </g>
  );
}

function WallClock({ now }: { now: Date }) {
  const g = onWall('back', CLOCK.from, CLOCK.to, CLOCK.z);
  const h = now.getHours() % 12 + now.getMinutes() / 60; const m = now.getMinutes();
  const cx = g.width / 2; const cy = 19;
  return (
    <g transform={g.transform} aria-label={`Reloj ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}>
      <circle cx={cx} cy={cy} r={18} fill="#f8fafc" stroke="#334155" strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1={cx + Math.sin((i * Math.PI) / 6) * 14} y1={cy - Math.cos((i * Math.PI) / 6) * 14} x2={cx + Math.sin((i * Math.PI) / 6) * 16} y2={cy - Math.cos((i * Math.PI) / 6) * 16} stroke="#334155" strokeWidth={1.4} />)}
      <line x1={cx} y1={cy} x2={cx + Math.sin((h * Math.PI) / 6) * 9} y2={cy - Math.cos((h * Math.PI) / 6) * 9} stroke="#0f172a" strokeWidth={2.6} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + Math.sin((m * Math.PI) / 30) * 13} y2={cy - Math.cos((m * Math.PI) / 30) * 13} stroke="#0f172a" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={1.8} fill="#ef4444" />
    </g>
  );
}

/** Corcho en la pared izquierda: los anuncios encontrados, contactados y en negociación (clic → Comprados). */
function CorkBoard({ board, stats, onOpen }: { board: BoardCard[]; stats: OfficeStats; onOpen: () => void }) {
  const g = onWall('side', CORK.from, CORK.to, CORK.z1);
  const h = CORK.z1 - CORK.z0;
  const b = stats.board;
  const cards = board.slice(0, 6);
  const tone = (s: BoardCard['stage']) => (s === 'negotiating' ? '#ec4899' : s === 'contacted' ? '#2a78d6' : '#1baf7a');
  return (
    <g transform={g.transform} {...linkProps(`Corcho: ${b.found} encontrados, ${b.contacted} contactados, ${b.negotiating} negociando. Abre el tablero de Comprados`, onOpen)}>
      <rect x={-5} y={-5} width={g.width + 10} height={h + 10} rx={3} style={S('frame-dark', 'wood-line', 1)} />
      <rect x={0} y={0} width={g.width} height={h} rx={1.5} style={S('cork')} />
      {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={(i * 37) % g.width} cy={(i * 23) % h} r={1} style={S('cork-dark')} />)}
      <rect x={6} y={5} width={g.width - 12} height={11} rx={2} style={S('plate', 'plate-border', 0.7)} />
      <FitText max={g.width - 18} x={g.width / 2} y={13} textAnchor="middle" style={{ fill: v('plate-ink'), fontFamily: FONT, fontWeight: 800, fontSize: 6.4 }}>{`${b.found} encontrados · ${b.contacted} contactados · ${b.negotiating} negociando`}</FitText>
      {cards.map((c, i) => {
        const col = i % 3; const row = Math.floor(i / 3);
        const cw = (g.width - 24) / 3; const x = 6 + col * (cw + 6); const y = 21 + row * 25;
        return (
          <g key={c.id} transform={`rotate(${((i * 7) % 5) - 2} ${x + cw / 2} ${y + 10})`}>
            <rect x={x} y={y} width={cw} height={21} rx={1} fill="#fffaf0" stroke="#c9b48a" strokeWidth={0.5} />
            <rect x={x + 2} y={y + 2} width={cw - 4} height={10} style={{ fill: tone(c.stage), opacity: 0.8 }} />
            <path d={`M ${x + 6} ${y + 10} l 4 -4 l 6 0 l 3 4 Z`} fill="#fffaf0" opacity={0.85} />
            <FitText max={cw - 3} x={x + cw / 2} y={y + 18} textAnchor="middle" style={{ fill: '#2c2234', fontFamily: FONT, fontWeight: 700, fontSize: 4.6 }}>{`${c.brand} ${c.model}`.slice(0, 28)}</FitText>
            <circle cx={x + cw / 2} cy={y + 1} r={1.6} fill="#e2483e" stroke="#7a1e18" strokeWidth={0.4} />
          </g>
        );
      })}
      {cards.length === 0 && <FitText max={g.width - 12} x={g.width / 2} y={h / 2 + 4} textAnchor="middle" style={{ fill: '#3a2010', fontFamily: FONT, fontWeight: 700, fontSize: 8 }}>Sin anuncios pendientes</FitText>}
    </g>
  );
}

function ExitDoor({ onExit }: { onExit: () => void }) {
  const g = onWall('side', EXIT_DOOR.from, EXIT_DOOR.to, 100);
  const props = linkProps('Salida: volver a la vista clásica', onExit);
  return (
    <g transform={g.transform} {...props} className="mhq-door group cursor-pointer outline-none">
      <title>Salir a la vista clásica</title>
      <rect x={-5} y={-3} width={g.width + 10} height={103} fill="#475569" />
      <rect x={0} y={0} width={g.width} height={100} fill="#1e293b" />
      <g className="mhq-door-leaf"><rect x={0} y={0} width={g.width} height={100} fill="#a16207" /><rect x={5} y={6} width={g.width - 10} height={38} rx={2} fill="#000" opacity={0.12} /><rect x={5} y={52} width={g.width - 10} height={40} rx={2} fill="#000" opacity={0.12} /><circle cx={g.width - 8} cy={54} r={2.6} fill="#fde68a" /></g>
      <rect x={2} y={-24} width={g.width - 4} height={17} rx={3} fill="#16a34a" />
      <FitText max={g.width - 10} x={g.width / 2} y={-11.5} textAnchor="middle" style={{ fill: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 9.5, letterSpacing: '0.16em' }}>SALIDA</FitText>
    </g>
  );
}

/** Barra con la cafetera (IlloCounter del original, más corta para una oficina pequeña). */
function CoffeeBar() {
  const { x, y, w, d } = COUNTER;
  const [mx, my] = iso(x + 0.6, y + 0.3, 50);
  return (
    <g>
      <Box x0={x} x1={x + w} y0={y} y1={y + d} z0={0} z1={34} top="#f1ece2" front="wood-front" side="wood-side" line="wood-line" />
      <Box x0={x + 0.35} x1={x + 0.9} y0={y + 0.1} y1={y + 0.55} z0={34} z1={60} top="#5f6b7d" front="#3d4656" side="#2c3442" line="metal-line" />
      <path d={`M ${mx} ${my - 6} q 3 -6 0 -12 q -3 -6 0 -12`} fill="none" stroke="#e2e8f0" strokeWidth={1.6} className="mhq-steam" opacity={0.7} />
      {[1.25, 1.55].map((a) => { const [cx, cy] = iso(x + a, y + 0.38, 34); return <rect key={a} x={cx - 3.5} y={cy - 9} width={7} height={8.5} rx={1.5} style={S(a === 1.25 ? '#e8684a' : '#4a7ad8', 'person-line', 0.7)} />; })}
    </g>
  );
}

/** Tabique bajo de cristal entre la oficina y el parking (como el del archivo del original). */
function Partition({ x0, x1, y0, y1 }: { x0: number; x1: number; y0: number; y1: number }) {
  const metal = { top: '#cbd5e1', left: '#94a3b8', right: '#64748b' };
  const alongX = y1 - y0 < 0.5;
  const glass = alongX
    ? pts(iso(x0, y1, 14), iso(x1, y1, 14), iso(x1, y1, 46), iso(x0, y1, 46))
    : pts(iso(x1, y0, 14), iso(x1, y1, 14), iso(x1, y1, 46), iso(x1, y0, 46));
  return (
    <g opacity={0.95}>
      <IsoBox x={x0} y={y0} w={x1 - x0} d={y1 - y0} h={14} {...metal} />
      <polygon points={glass} fill="#bae6fd" opacity={0.2} stroke="#94a3b8" strokeWidth={1} />
      <IsoBox x={x0} y={y0} w={x1 - x0} d={y1 - y0} z0={46} h={3} {...metal} />
    </g>
  );
}

// =====================================================================================================================
// Escena
// =====================================================================================================================

type Item = { key: string; r: Rect; node?: ReactNode };

export const GarageScene = memo(function GarageScene({ svgRef, ...p }: SceneProps) {
  const { layout, stats } = p;
  const W = layout.width; const D = layout.depth;
  const street = streetSpan(layout);
  const lit = p.daylight.darkness > 0.15;
  const band = (z: ZoneId) => layout.bands.find((b) => b.zone === z)!;
  const pendingItv = p.cars.filter((c) => c.car.stage === 'homologation').length;

  // Pantallas de las mesas: cifras reales, "—" si no se conocen
  const deskInfo = (key: DeskKey): { label: string; screen: MonitorScreen; plate: DeskPlateInfo; target: GarageTarget } => {
    switch (key) {
      case 'dashboard': {
        const v0 = stats.profitMonth;
        return { label: 'Dashboard', target: 'dashboard', plate: { text: 'Dashboard', dot: v0 == null ? 'off' : v0 >= 0 ? 'good' : 'bad' },
          screen: { title: `BENEFICIO · ${MONTH}`, big: fmtEur(v0), tone: v0 == null ? 'neutral' : v0 >= 0 ? 'good' : 'bad', lines: ['coches vendidos este mes', 'clic: abrir Dashboard'] } };
      }
      case 'fiscal': {
        const q = stats.vatQuarter;
        return { label: 'Fiscal', target: 'fiscal', plate: { text: 'Fiscal', dot: q ? 'good' : 'off' },
          screen: { title: q ? `IVA · ${q.label}` : 'IVA DEL TRIMESTRE', big: q ? fmtEur(q.vat) : UNKNOWN, tone: 'neutral', lines: q ? [`REBU ${fmtEur(q.rebu)}`, `General ${fmtEur(q.general)}`] : ['sin datos'] } };
      }
      case 'customers':
        return { label: 'Clientes', target: 'customers', plate: { text: 'Clientes', dot: stats.clients == null ? 'off' : 'good' },
          screen: { title: 'CLIENTES', big: fmtNum(stats.clients), tone: 'neutral', lines: ['en la cartera', 'clic: abrir Clientes'] } };
      case 'expenses':
        return { label: 'Gastos', target: 'expenses', plate: { text: 'Gastos', dot: stats.expensesMonth == null ? 'off' : 'warn' },
          screen: { title: `GASTOS · ${MONTH}`, big: fmtEur(stats.expensesMonth), tone: stats.expensesMonth ? 'warn' : 'neutral', lines: ['gastos generales del mes', 'clic: abrir Gastos'] } };
      case 'reminders': {
        const n = stats.urgentReminders;
        return { label: 'Recordatorios', target: 'reminders', plate: { text: 'Avisos', dot: n == null ? 'off' : n > 0 ? 'bad' : 'good' },
          screen: { title: 'AVISOS URGENTES', big: n == null ? UNKNOWN : String(n), tone: n == null ? 'neutral' : n > 0 ? 'bad' : 'good', lines: [n ? 'plazos vencidos o esta semana' : 'todo al día', 'clic: abrir Recordatorios'] } };
      }
    }
  };

  // ---- lo fijo que pisa el suelo (con su huella para ordenar) ----
  const statics = useMemo<Item[]>(() => {
    const list: Item[] = [];
    const add = (key: string, r: Rect, node: ReactNode) => list.push({ key, r, node });
    const f = OFFICE_FURNITURE;
    for (const [x, y] of OFFICE_LAMPS) add(`lamp${x}_${y}`, f[`lamp${x}_${y}`], <IlloLamp x={x} y={y} lit={lit} />);
    for (const [x, y, s] of OFFICE_PLANTS) add(`plant${x}_${y}`, f[`plant${x}_${y}`], <IlloPlant x={x} y={y} size={s} />);
    add('sofa', f.sofa, <IlloSofa x={SOFA.x} y={SOFA.y} w={SOFA.w} d={SOFA.d} />);
    add('counter', f.counter, <CoffeeBar />);
    add('cooler', f.cooler, <IlloCooler x={COOLER.x} y={COOLER.y} />);
    add('partitionFrontA', f.partitionFrontA, <Partition x0={0} x1={OFFICE_DOOR.x0} y0={OFFICE_D - 0.06} y1={OFFICE_D + 0.06} />);
    add('partitionFrontB', f.partitionFrontB, <Partition x0={OFFICE_DOOR.x1} x1={OFFICE_W} y0={OFFICE_D - 0.06} y1={OFFICE_D + 0.06} />);
    add('partitionRight', f.partitionRight, <Partition x0={OFFICE_W - 0.06} x1={OFFICE_W + 0.06} y0={0} y1={OFFICE_D} />);

    // Parking: murete con setos en los bordes del fondo y la izquierda
    add('wallBack', box(OFFICE_W + 0.1, -0.36, W + SIDE - OFFICE_W - 0.1, 0.32), <LowWall x={OFFICE_W + 0.1} y={-0.36} len={W + SIDE - OFFICE_W - 0.1} axis="x" />);
    add('wallLeft', box(-0.36, OFFICE_D + 0.1, 0.32, D - OFFICE_D - 0.1), <LowWall x={-0.36} y={OFFICE_D + 0.1} len={D - OFFICE_D - 0.1} axis="y" />);

    // Taller, ITV y exposición
    const ws = band('workshop'); const it = band('itv'); const sh = band('showroom');
    add('lift', box(ws.x0 + 0.2, ws.y0 + LABEL_BAND, 2.6, 2.6), <WorkshopLift x={ws.x0 + 0.25} y={ws.y0 + LABEL_BAND + 0.05} />);
    add('itv', box(it.x0 + 0.25, it.y0 + LABEL_BAND + 0.1, 1.6, 1.4), <ItvBooth x={it.x0 + 0.25} y={it.y0 + LABEL_BAND + 0.1} pending={pendingItv} />);
    add('pallet', box(it.x0 + 0.3, it.y0 + LABEL_BAND + 1.9, 1.3, 1.1), <Pallet x={it.x0 + 0.3} y={it.y0 + LABEL_BAND + 1.9} boxes={3} />);
    const metal = { top: '#cbd5e1', left: '#94a3b8', right: '#64748b' };
    add('buntingA', spot(sh.x0 + 0.3, sh.y0 + 0.3, 0.1), <IsoBox x={sh.x0 + 0.22} y={sh.y0 + 0.22} w={0.16} d={0.16} h={58} {...metal} />);
    add('buntingB', spot(sh.x1 - 0.3, sh.y0 + 0.3, 0.1), <IsoBox x={sh.x1 - 0.38} y={sh.y0 + 0.22} w={0.16} d={0.16} h={58} {...metal} />);
    add('bunting', box(sh.x0 + 0.42, sh.y0 + 0.26, sh.x1 - sh.x0 - 0.84, 0.08), <Bunting from={iso(sh.x0 + 0.3, sh.y0 + 0.3, 56)} to={iso(sh.x1 - 0.3, sh.y0 + 0.3, 56)} colors={['#e2483e', '#f2b81e', '#2a78d6', '#1baf7a', '#ec4899']} />);

    // Puerta, farolas, árboles, bancos, conos
    add('gate', box(layout.gate.x - 1.8, D - 0.15, 3.6, 0.3), <ParkGate x={layout.gate.x} y={D} />);
    // en la franja de césped: farolas junto al carril, árboles y un banco (nada en el camino de los coches)
    const lampYs = layout.bands.filter((_, i) => i % 2 === 0).map((b) => b.aisleY);
    lampYs.forEach((ly, i) => add(`slamp${i}`, spot(W + 0.35, ly, 0.15), <StreetLamp x={W + 0.35} y={ly} lit={lit} />));
    const treeYs = [1.3, D * 0.42, D * 0.78].filter((ty) => lampYs.every((ly) => Math.abs(ly - ty) > 1.2));
    treeYs.forEach((ty, i) => add(`tree${i}`, spot(W + SIDE * 0.86, ty, 0.35), <Tree x={W + SIDE * 0.86} y={ty} size={0.78} />));
    const benchY = [0.6, 0.3, 0.85, 0.15].map((k) => D * k).find((by) => lampYs.every((ly) => ly < by - 0.5 || ly > by + 1.9)) ?? D * 0.6;
    add('bench', box(W + 0.62, benchY, 0.5, 1.4), <Bench x={W + 0.62} y={benchY} axis="y" />);
    add('cone1', spot(ws.x0 + 2.9, ws.y1 - 0.3, 0.12), <Cone x={ws.x0 + 2.9} y={ws.y1 - 0.3} />);
    add('cone2', spot(layout.gate.x - 2.4, D - 0.6, 0.12), <Cone x={layout.gate.x - 2.4} y={D - 0.6} />);
    add('cone3', spot(layout.gate.x + 2.4, D - 0.6, 0.12), <Cone x={layout.gate.x + 2.4} y={D - 0.6} />);
    return list;
  }, [layout, lit, pendingItv]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- mesas de la oficina ----
  const desks = useMemo<Item[]>(() => OFFICE_DESKS.map((d) => {
    const info = deskInfo(d.key);
    const look = lookFor(d.seed);
    return {
      key: `desk-${d.key}`, r: deskRect(d.gx, d.gy),
      node: (
        <g {...linkProps(`${info.label}: ${info.screen.big}`, () => p.onNavigate(info.target))}>
          <title>{`${info.label} · ${info.screen.title}: ${info.screen.big}`}</title>
          <IlloChair gx={d.gx} gy={d.gy} empty={false} />
          <IlloSeated gx={d.gx} gy={d.gy} look={look} outfit="shirt" color={d.color} seed={d.seed} />
          <IlloDesk gx={d.gx} gy={d.gy} color={d.color} monitorOn syncing={false} decor={d.seed} screen={info.screen} detail={p.detail} plate={info.plate} papers={d.key === 'fiscal' ? 3 : 0} />
          <IlloSeatedArms gx={d.gx} gy={d.gy} look={look} outfit="shirt" color={d.color} typing={p.reduced ? 'no' : 'sometimes'} seed={d.seed} />
        </g>
      ),
    };
  }), [stats, p.detail, p.reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- camiones, coches y personas ----
  const dynamic: Item[] = [];
  const nightShapes: Pt2[][] = [];
  // muretes con setos, caseta de la ITV y elevador (sobresalen del suelo contra el cielo)
  const staticNight = useMemo(() => {
    const out: Pt2[][] = [];
    const wall = (x: number, y: number, len: number, axis: 'x' | 'y') => {
      out.push(volume(axis === 'x' ? box(x, y, len, 0.32) : box(x, y, 0.32, len), 0, 16));
      for (let i = 0; i < Math.floor(len / 2.4); i++) {
        const a = 0.3 + i * 2.4;
        out.push(volume(axis === 'x' ? box(x + a, y - 0.06, 1.6, 0.44) : box(x - 0.06, y + a, 0.44, 1.6), 16, 30));
      }
    };
    wall(OFFICE_W + 0.1, -0.36, W + SIDE - OFFICE_W - 0.1, 'x');
    wall(-0.36, OFFICE_D + 0.1, D - OFFICE_D - 0.1, 'y');
    const it = layout.bands.find((b) => b.zone === 'itv');
    if (it) out.push(volume(box(it.x0 + 0.1, it.y0 + LABEL_BAND, 1.9, 1.7), 0, 70));
    return out;
  }, [layout, W, D]);
  for (let t = 0; t < p.trucks; t++) {
    const s = layout.truckSlots[t];
    if (!s) continue;
    dynamic.push({ key: `truck${t}`, r: box(s.x - 7.5, s.y - 0.75, 7.5, 1.5), node: <CarCarrier x={s.x} y={s.y} part="base" /> });
    nightShapes.push(volume(box(s.x - 6.6, s.y - 0.75, 6.6, 1.6), 0, 19), volume(box(s.x - 7.5, s.y - 0.6, 0.9, 1.3), 0, 6), volume(box(s.x + 0.05, s.y - 0.75, 1.45, 1.6), 0, 54));
    dynamic.push({ key: `truck${t}cab`, r: box(s.x + 0.05, s.y - 0.75, 1.45, 1.5), node: <CarCarrier x={s.x} y={s.y} part="cab" /> });
  }
  const bubbles: ReactNode[] = [];
  for (const rc of p.cars) {
    const { car } = rc;
    const dx = rc.dir === 'y' ? CAR_W : CAR_L; const dy = rc.dir === 'y' ? CAR_L : CAR_W;
    const z = rc.z + groundZ(layout, rc.y);
    for (const vol of carVolumes({ cx: rc.x, cy: rc.y, z, dir: rc.dir, rev: rc.rev, body: car.body })) nightShapes.push(convexHull(vol.map(([x, y, zz]) => iso(x, y, zz))));
    // los coches subidos al camión se dibujan justo después de su plataforma
    const onTruck = rc.y > D + 0.5 && rc.z > 0;
    const r: Rect = onTruck ? { x0: rc.x - dx / 2, x1: rc.x + dx / 2, y0: rc.y + 0.76, y1: rc.y + 0.78 } : { x0: rc.x - dx / 2, x1: rc.x + dx / 2, y0: rc.y - dy / 2, y1: rc.y + dy / 2 };
    const label = car.plate || `${car.brand} ${car.model}`.trim() || 'DEMO';
    const tooltip = [`${car.brand} ${car.model}${car.year ? ` (${car.year})` : ''}`, `Etapa: ${STAGE_LABEL[car.stage]}`, `Días en stock: ${car.daysInStock ?? UNKNOWN}`, `Coste total: ${fmtEur(car.totalCost)}`, `Precio de venta: ${fmtEur(car.sellPrice)}`, `Margen: ${fmtEur(car.margin)}`].join('\n');
    dynamic.push({
      key: `car-${car.id}`, r,
      node: (
        <g data-car-id={car.id} data-moving={rc.moving ? '1' : undefined}
          onPointerEnter={(e) => p.onHover(car, e)} onPointerMove={(e) => p.onHover(car, e)} onPointerLeave={() => p.onHover(null)}
          onFocus={() => p.onHover(car)} onBlur={() => p.onHover(null)}
          {...linkProps(`${car.brand} ${car.model}: abrir en Comprados`, () => p.onCar(car))}>
          <title>{tooltip}</title>
          <IlloCar cx={rc.x} cy={rc.y} z={z} dir={rc.dir} rev={rc.rev} color={car.color} body={car.body} label={label}
            forSale={car.stage === 'ready' && !rc.moving} sold={car.stage === 'sold' || rc.leaving} night={!p.daylight.isDay} />
        </g>
      ),
    });
    if (car.urgent && !rc.moving) {
      const [bx, by] = iso(rc.x, rc.y, z + 58);
      bubbles.push(
        <g key={`b-${car.id}`} transform={`translate(${bx} ${by})`} {...linkProps(`Aviso urgente en ${car.brand} ${car.model}: abrir Recordatorios`, () => p.onNavigate('reminders'))}>
          <title>Aviso urgente: abrir Recordatorios</title>
          <g className={p.reduced ? undefined : 'mhq-pulse'}>
            <rect x={-17} y={-12} width={34} height={20} rx={10} style={{ fill: '#eb6834', stroke: '#7a2e12', strokeWidth: 1 }} />
            <polygon points="-4,8 4,8 0,14" style={{ fill: '#eb6834' }} />
            <text x={0} y={3} textAnchor="middle" style={{ fill: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 11 }}>!</text>
          </g>
        </g>,
      );
    }
  }
  for (const person of p.people) {
    const look = lookFor(person.seed);
    const color = person.role === 'office' ? ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-6)'][person.seed % 4] : ROLE_COLOR[person.role];
    const [px, py] = iso(person.x, person.y, groundZ(layout, person.y));
    const carry = person.pose === 'cup' ? 'cup' as const : person.pose === 'papers' ? 'doc' as const : person.pose === 'tool' ? 'box' as const : null;
    dynamic.push({
      key: `p-${person.id}`, r: spot(person.x, person.y, PERSON_R),
      node: (
        <g transform={`translate(${px.toFixed(1)} ${py.toFixed(1)})`}>
          <IlloStanding look={look} outfit="shirt" color={color} walking={person.pose === 'walk' && !p.reduced} back={!!person.back} flip={!!person.flip}
            carry={carry} seed={person.seed} talk={person.pose === 'chat' && !p.reduced ? person.seed % 5 : undefined} />
        </g>
      ),
    });
  }

  const ordered = depthOrder<Item>([...statics, ...desks, ...dynamic]);

  // Encuadre del cielo: lo que se ve más un margen
  const vb = p.viewBox.split(' ').map(Number);
  const bounds: SkyBounds = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const horizonAt = (sx: number) => {
    if (sx >= 0) { const t = Math.min(W + SIDE, sx / 32); return 16 * t - (t < OFFICE_W ? WALL : 30); }
    const t = Math.min(D, -sx / 32); return 16 * t - (t < OFFICE_D ? WALL : 30);
  };
  const sh = band('showroom');
  const lamps: [number, number][] = [...OFFICE_LAMPS, ...layout.bands.filter((_, i) => i % 2 === 0).map((b) => [W + 0.35, b.aisleY] as [number, number])];

  return (
    <svg ref={svgRef} viewBox={p.viewBox} className="block h-full w-full touch-none select-none mhq-pixel" role="img" aria-label="Garaje virtual de NorDrive: oficina y parking con los coches comprados" {...p.svgHandlers}>
      <defs>
        <linearGradient id="mhq-glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <radialGradient id="mhq-lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffd98a" stopOpacity="0.75" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
        <radialGradient id="mhq-pool" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffe9b0" stopOpacity="0.55" /><stop offset="1" stopColor="#ffe9b0" stopOpacity="0" /></radialGradient>
      </defs>
      <IlloDefs />
      <Outside isDay={p.daylight.isDay} f={p.daylight.f} altitude={p.daylight.altitude} sky="partly" bounds={bounds} horizonAt={horizonAt} />
      <StreetApron x0={street.x0} x1={street.x1} y0={D} y1={D + STREET_D} gateX={layout.gate.x} />
      <Ground layout={layout} />
      <IlloWalls winBack={WIN_BACK} winSide={WIN_SIDE} W={OFFICE_W} D={OFFICE_D} />
      <WallScreen stats={stats} onOpen={() => p.onNavigate('dashboard')} />
      <WallClock now={p.now} />
      <CorkBoard board={p.board} stats={stats} onOpen={() => p.onNavigate('management')} />
      <ExitDoor onExit={p.onExit} />
      {ordered.map((e) => <g key={e.key}>{e.node}</g>)}
      {/* noche: más oscuro dentro y las lámparas brillan */}
      {p.daylight.darkness > 0.01 && (
        <path fillRule="nonzero" fill="#0a1030" opacity={p.daylight.darkness} className="pointer-events-none transition-opacity duration-1000"
          d={unionPath([
            // suelo, cantos de la losa, oficina y setos
            [iso(0, OFFICE_D, WALL + 8), iso(0, 0, WALL + 8), iso(OFFICE_W, 0, WALL + 8), iso(OFFICE_W, 0, 0), iso(W + SIDE, 0, 0), iso(W + SIDE, 0, -SLAB), iso(W + SIDE, D + STREET_D, -SLAB), iso(street.x0, D + STREET_D, -SLAB), iso(street.x0, D + STREET_D, 0), iso(street.x0, D, 0), iso(0, D, 0), iso(0, OFFICE_D, 0)],
            ...staticNight,
            ...nightShapes,
          ])} />
      )}
      {lit && (
        <g className="pointer-events-none" style={{ mixBlendMode: 'screen' }}>
          {lamps.map(([x, y]) => { const [lx, ly] = iso(x, y); return <g key={`${x}${y}`}><ellipse cx={lx} cy={ly} rx={120} ry={60} fill="url(#mhq-pool)" /><circle cx={lx} cy={ly - 96} r={48} fill="url(#mhq-lamp)" /></g>; })}
          {OFFICE_DESKS.map((d) => { const [mx, my] = iso(d.gx + 0.42, d.gy + 0.62, DESK.h + 24); return <ellipse key={d.key} cx={mx} cy={my} rx={34} ry={22} fill="#93c5fd" opacity={0.18} />; })}
        </g>
      )}
      {bubbles}
    </svg>
  );
});

/** Límites del dibujo (para la cámara): la losa con la oficina, la calle y los árboles de los lados. */
export function sceneBounds(layout: GarageLayout) {
  const st = streetSpan(layout);
  const corners = [iso(0, 0, WALL + 20), iso(0, OFFICE_D, WALL + 20), iso(layout.width + SIDE + 0.5, -1, 80), iso(st.x0, layout.depth + STREET_D, -30), iso(st.x1, layout.depth + STREET_D, -30), iso(st.x1, layout.depth, 40), iso(-1, layout.depth, 40)];
  const xs = corners.map((c) => c[0]); const ys = corners.map((c) => c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function focusPoint(layout: GarageLayout): Point {
  const arrivals = layout.bands.find((b) => b.zone === 'arrivals')!;
  const showroom = layout.bands.find((b) => b.zone === 'showroom')!;
  return { x: arrivals.x0 + 4, y: (arrivals.y0 + showroom.y1) / 2 };
}
