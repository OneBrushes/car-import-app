// Proyección y medidas del garaje virtual, portadas de LOOSES & WINS (world.ts).
// Unidades de rejilla: x crece hacia abajo-derecha, y hacia abajo-izquierda. Una unidad = 64 × 32 px.
// Diferencia con el original: el suelo crece con el número de coches, así que el origen de pantalla es (0, 0)
// y la cámara (viewBox) encuadra lo que haya; las fórmulas son las mismas.

export type P = { x: number; y: number }
export type Pt = [number, number]

export const WALL = 150                // alto de las paredes de la oficina (px)
export const SLAB = 14                 // grosor del canto de la losa (px)
export const DESK = { w: 1.6, d: 1.0, h: 22 }

export const iso = (x: number, y: number, z = 0): Pt => [(x - y) * 32, (x + y) * 16 - z]
export const pts = (...p: Pt[]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")

export type Rect = { x0: number; x1: number; y0: number; y1: number }
export const box = (x: number, y: number, w: number, d: number): Rect => ({ x0: x, x1: x + w, y0: y, y1: y + d })
export const spot = (x: number, y: number, r: number): Rect => ({ x0: x - r, x1: x + r, y0: y - r, y1: y + r })

/** Una mesa con su silla (y la persona sentada) detrás. */
export const deskRect = (gx: number, gy: number): Rect => ({ x0: gx, x1: gx + DESK.w, y0: gy - 0.8, y1: gy + DESK.d })
export const PERSON_R = 0.2

// ---------------------------------------------------------------------------------------------------------------------
// Oficina pequeña (esquina del fondo): mesas, muebles y paredes
// ---------------------------------------------------------------------------------------------------------------------

export const OFFICE_W = 8.4
export const OFFICE_D = 7.2

export type DeskKey = "dashboard" | "fiscal" | "customers" | "expenses" | "reminders"
export interface OfficeDesk { key: DeskKey; gx: number; gy: number; seed: number; color: string }

/** 5 mesas de 1,6 × 1,0 (como las del original): dos filas y una más junto a la cafetera */
export const OFFICE_DESKS: OfficeDesk[] = [
    { key: "dashboard", gx: 0.7, gy: 1.9, seed: 3, color: "var(--chart-1)" },
    { key: "fiscal", gx: 3.4, gy: 1.9, seed: 12, color: "var(--chart-4)" },
    { key: "reminders", gx: 6.3, gy: 2.5, seed: 21, color: "var(--chart-6)" },
    { key: "customers", gx: 0.7, gy: 4.8, seed: 30, color: "var(--chart-2)" },
    { key: "expenses", gx: 3.4, gy: 4.8, seed: 41, color: "var(--chart-3)" },
]

/** Ventanas (inicio, fin) en la pared del fondo (y = 0) y en la izquierda (x = 0) */
export const WIN_BACK: [number, number][] = [[0.6, 2.6]]
export const WIN_SIDE: [number, number][] = [[3.7, 5.3]]

/** Elementos de la pared: pantalla del mes (fondo), corcho y puerta de salida (izquierda) */
export const WALL_SCREEN = { from: 3.1, to: 6.0, z0: 56, z1: 128 }
export const CLOCK = { from: 6.5, to: 7.7, z: 128 }
export const CORK = { from: 0.5, to: 3.2, z0: 46, z1: 118 }
export const EXIT_DOOR = { from: 5.6, to: 6.95 }

export const OFFICE_LAMPS: [number, number][] = [[2.9, 0.6]]
export const OFFICE_PLANTS: [number, number, number][] = [[0.45, 0.55, 0.9], [5.85, 0.55, 0.8], [1.9, 6.75, 0.8]]
export const SOFA = { x: 6.3, y: 4.5, w: 1.0, d: 2.3 }
export const COUNTER = { x: 6.35, y: 0.2, w: 1.9, d: 0.75 }   // barra con la cafetera en la pared del fondo
export const COOLER = { x: 7.75, y: 5.6 }

/** Puerta de la oficina hacia el parking: hueco libre entre las mesas de Clientes y Gastos */
export const OFFICE_DOOR = { x0: 2.4, x1: 3.3 }

/** Muebles que pisan el suelo de la oficina (para ordenar el dibujo y que nadie los atraviese) */
export const OFFICE_FURNITURE: Record<string, Rect> = {
    ...Object.fromEntries(OFFICE_LAMPS.map(([x, y]) => [`lamp${x}_${y}`, spot(x, y, 0.15)])),
    ...Object.fromEntries(OFFICE_PLANTS.map(([x, y, s]) => [`plant${x}_${y}`, spot(x, y, 0.3 * s)])),
    sofa: box(SOFA.x, SOFA.y, SOFA.w, SOFA.d),
    counter: box(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.d),
    cooler: box(COOLER.x, COOLER.y, 0.5, 0.5),
    partitionFrontA: box(0, OFFICE_D - 0.06, OFFICE_DOOR.x0, 0.12),
    partitionFrontB: box(OFFICE_DOOR.x1, OFFICE_D - 0.06, OFFICE_W - OFFICE_DOOR.x1, 0.12),
    partitionRight: box(OFFICE_W - 0.06, 0, 0.12, OFFICE_D),
}

/** Puntos de la oficina para la gente que sale a ver un coche */
export const OFFICE_AISLE_Y = 3.75
export const OFFICE_EXIT_PATH: P[] = [{ x: 2.85, y: OFFICE_AISLE_Y }, { x: 2.85, y: OFFICE_D + 0.6 }]
