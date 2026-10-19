import { OFFICE_D, OFFICE_W } from "./world"

/**
 * Geometría del garaje virtual: proyección isométrica 2:1, zonas del parking,
 * plazas numeradas y rutas de los coches. Funciones puras (sin React) para poder testearlas.
 *
 * Coordenadas del mundo en baldosas: x crece hacia abajo-derecha, y hacia abajo-izquierda,
 * z es altura en píxeles. La esquina del fondo (0,0) es el vértice superior del dibujo.
 * La oficina ocupa una esquina pequeña del fondo; la calle con la puerta está en el borde y = depth.
 */

export const TILE_W = 64
export const TILE_H = 32

export interface Point { x: number; y: number }
export type ScreenPoint = [number, number]

/** iso(x, y, z) = [OX + (x − y)·32, OY + (x + y)·16 − z] */
export function iso(x: number, y: number, z = 0, origin: ScreenPoint = [0, 0]): ScreenPoint {
    return [origin[0] + (x - y) * (TILE_W / 2), origin[1] + (x + y) * (TILE_H / 2) - z]
}

/** Clave de profundidad: lo que está más cerca del espectador (x+y mayor) se dibuja después */
export function depthKey(x: number, y: number, z = 0) {
    return (x + y) * 1000 + z
}

// -----------------------------------------------------------------------------
// Etapas reales de la app → zonas del dibujo
// -----------------------------------------------------------------------------

/** inventory_cars.logistic_status (+ status = 'sold') */
export type ParkStage = "purchased" | "in_transit" | "homologation" | "detailing" | "ready" | "sold"
/** imported_cars: contacted / pipeline_stage */
export type BoardStage = "found" | "contacted" | "negotiating"

export type ZoneId = "arrivals" | "itv" | "workshop" | "showroom" | "exit"

export interface ZoneDef {
    id: ZoneId
    label: string
    accent: string
    stages: ParkStage[]
}

/** Orden de las bandas desde el fondo (cerca de la oficina) hacia la calle */
export const ZONES: ZoneDef[] = [
    { id: "workshop", label: "TALLER", accent: "#eb6834", stages: ["detailing"] },
    { id: "itv", label: "ITV · PAPELES", accent: "#8b5cf6", stages: ["homologation"] },
    { id: "arrivals", label: "LLEGADAS", accent: "#2a78d6", stages: ["purchased"] },
    { id: "showroom", label: "EXPOSICIÓN", accent: "#1baf7a", stages: ["ready"] },
    { id: "exit", label: "SALIDA", accent: "#ec4899", stages: ["sold"] },
]

/** "Transporte" no es una zona del parking: esos coches van subidos al camión en la calle */
export function zoneForStage(stage: ParkStage): ZoneId | "truck" {
    if (stage === "in_transit") return "truck"
    const zone = ZONES.find(z => z.stages.includes(stage))
    if (!zone) throw new Error(`Etapa sin zona: ${stage}`)
    return zone.id
}

// -----------------------------------------------------------------------------
// Distribución
// -----------------------------------------------------------------------------

export const SPOT_W = 1.7     // ancho de plaza (eje x)
export const SPOT_D = 2.6     // fondo de plaza (eje y)
export const CAR_W = 1.05     // ancho del coche
export const CAR_L = 2.0      // largo del coche
export const AISLE = 2.2      // carril de circulación delante de cada banda
export const LABEL_BAND = 1.1 // franja con el nombre de la zona pintado en el suelo

export const OFFICE = { w: OFFICE_W, d: OFFICE_D }   // oficina pequeña en la esquina del fondo
export const STREET_D = 4               // ancho de la calle
export const MIN_WIDTH = 16             // ancho mínimo de la losa (baldosas)
export const FREE_SPOTS = 2             // plazas libres por zona además de los coches reales
export const TRUCK_CAPACITY = 3

/** Huecos reservados al principio de algunas zonas para sus elementos (cabina ITV, elevador…) */
export const ZONE_RESERVED: Record<ZoneId, number> = {
    workshop: 2.6,
    itv: 2.4,
    arrivals: 0,
    showroom: 0,
    exit: 0,
}

export interface Spot {
    zone: ZoneId
    index: number      // número pintado en el suelo (1, 2, 3…) dentro de la zona
    x: number          // esquina trasera-izquierda de la plaza
    y: number
    cx: number         // centro del coche aparcado
    cy: number
    aisleY: number     // carril por el que se entra a esta plaza (delante de su fila)
}

/** Carril vertical libre junto a la puerta: por aquí circulan los coches entre zonas */
export const LANE_W = 3

export interface Band {
    zone: ZoneId
    x0: number
    x1: number
    y0: number         // inicio de la banda (fondo)
    y1: number         // fin de la última fila de plazas
    aisleY: number     // carril delante de la última fila
    rowAisles: number[] // un carril delante de cada fila (las filas nunca se cruzan)
    rows: number
}

export interface GarageLayout {
    width: number
    depth: number      // borde del parking; la calle va de depth a depth + STREET_D
    office: { x0: number; y0: number; x1: number; y1: number }
    bands: Band[]
    spots: Spot[]      // solo las plazas ocupadas (en el orden de los coches)
    emptySpots: Spot[] // plazas libres dibujadas para que el parking se vea completo
    gate: { x: number; y: number }
    street: { y0: number; y1: number }
    truckSlots: Point[]
}

export interface LayoutInput {
    /** Número de coches por zona */
    counts: Partial<Record<ZoneId, number>>
    trucks: number
    /** Plazas libres por zona además de los coches (por defecto FREE_SPOTS) */
    freeSpots?: number
}

function bandXRange(y0: number, width: number) {
    // Las bandas que quedan al lado de la oficina empiezan después de ella;
    // todas terminan antes del carril libre de la puerta
    const start = y0 < OFFICE.d + 0.5 ? OFFICE.w + 1.2 : 1
    return { x0: start, x1: width - 1 - LANE_W }
}

export function computeLayout(input: LayoutInput): GarageLayout {

    // Ancho que hace falta para que ninguna zona tenga más de ~3 filas
    const largest = Math.max(0, ...ZONES.map(z => input.counts[z.id] ?? 0))
    // Ancho según los coches: las zonas que quedan junto a la oficina (taller, ITV) en 2 filas,
    // el resto en 1–2 filas; más el carril libre de la puerta. Nunca un parking gigante vacío.
    const free = input.freeSpots ?? FREE_SPOTS
    const besideOffice: ZoneId[] = ["workshop", "itv"]
    const needFor = (z: ZoneDef) => {
        const total = (input.counts[z.id] ?? 0) + free
        const rows = 2
        const start = besideOffice.includes(z.id) ? OFFICE.w + 1.2 : 1
        return start + ZONE_RESERVED[z.id] + Math.ceil(total / rows) * SPOT_W + LANE_W + 1.2
    }
    const width = Math.max(MIN_WIDTH, Math.ceil(Math.max(...ZONES.map(needFor), 0)))
    void largest

    const bands: Band[] = []
    const spots: Spot[] = []
    const emptySpots: Spot[] = []
    let y = 0.6

    for (const zone of ZONES) {
        const needed = input.counts[zone.id] ?? 0
        const total = needed + free
        const { x0, x1 } = bandXRange(y, width)
        const usable = x1 - x0 - ZONE_RESERVED[zone.id]
        const perRow = Math.max(1, Math.floor(usable / SPOT_W))
        const rows = Math.max(1, Math.ceil(total / perRow))

        // Cada fila tiene su carril delante: fila, carril, fila, carril…
        const y0 = y + LABEL_BAND
        const rowY = (row: number) => y0 + row * (SPOT_D + AISLE)
        const rowAisles = Array.from({ length: rows }, (_, row) => rowY(row) + SPOT_D + AISLE / 2)
        for (let i = 0; i < total; i++) {
            const row = Math.floor(i / perRow)
            const col = i % perRow
            const sx = x0 + ZONE_RESERVED[zone.id] + col * SPOT_W
            const sy = rowY(row)
            const spot: Spot = {
                zone: zone.id,
                index: i + 1,
                x: sx,
                y: sy,
                cx: sx + SPOT_W / 2,
                cy: sy + SPOT_D / 2,
                aisleY: rowAisles[row],
            }
            if (i < needed) spots.push(spot)
            else emptySpots.push(spot)
        }
        const y1 = rowY(rows - 1) + SPOT_D
        bands.push({ zone: zone.id, x0, x1, y0: y, y1, aisleY: y1 + AISLE / 2, rowAisles, rows })
        y = y1 + AISLE
    }

    const depth = Math.max(y, OFFICE.d + 3)
    // La puerta está en el centro del carril libre
    const gate = { x: width - 1 - LANE_W / 2, y: depth }
    const street = { y0: depth, y1: depth + STREET_D }

    const truckSlots: Point[] = []
    for (let t = 0; t < input.trucks; t++) {
        // Camiones en fila por la calle, a la izquierda de la puerta
        truckSlots.push({ x: gate.x - 9 - t * 9, y: depth + STREET_D / 2 })
    }

    return {
        width,
        depth,
        office: { x0: 0, y0: 0, x1: OFFICE.w, y1: OFFICE.d },
        bands,
        spots,
        emptySpots,
        gate,
        street,
        truckSlots,
    }
}

/** Plazas ocupadas de una zona, en orden */
export function spotsOfZone(layout: GarageLayout, zone: ZoneId) {
    return layout.spots.filter(s => s.zone === zone)
}

/** Posición de un coche sobre un camión (3 por camión, en fila sobre la plataforma) */
export function truckCarPosition(layout: GarageLayout, index: number): Point & { truck: number } {
    const truck = Math.floor(index / TRUCK_CAPACITY)
    const slot = index % TRUCK_CAPACITY
    const base = layout.truckSlots[truck] ?? layout.truckSlots[layout.truckSlots.length - 1] ?? { x: layout.gate.x - 9, y: layout.depth + 2 }
    return { truck, x: base.x - 1.2 - slot * 2.2, y: base.y }
}

// -----------------------------------------------------------------------------
// Rutas
// -----------------------------------------------------------------------------

/** Punto de la calle por donde aparecen y desaparecen los coches */
export function streetEntry(layout: GarageLayout): Point {
    return { x: layout.width + 1.2, y: layout.depth + STREET_D / 2 }
}

function bandOf(layout: GarageLayout, zone: ZoneId) {
    return layout.bands.find(b => b.zone === zone)!
}

/** Carril más cercano delante de un punto aparcado (para salir de una plaza) */
export function aisleFor(layout: GarageLayout, from: Point, zone: ZoneId | null): number {
    const band = zone ? bandOf(layout, zone) : null
    if (!band) return layout.depth - 0.4
    const ahead = band.rowAisles.filter(a => a >= from.y)
    return ahead.length ? Math.min(...ahead) : band.aisleY
}

/** Desde la calle, cruzando la puerta, por el carril libre y el carril de su fila hasta la plaza */
export function routeIn(layout: GarageLayout, spot: Spot, from: Point = streetEntry(layout)): Point[] {
    const gx = layout.gate.x
    return [
        from,
        { x: gx, y: from.y },
        { x: gx, y: layout.depth - 0.4 },
        { x: gx, y: spot.aisleY },
        { x: spot.cx, y: spot.aisleY },
        { x: spot.cx, y: spot.cy },
    ]
}

/** Desde la plaza hasta la calle y fuera del dibujo */
export function routeOut(layout: GarageLayout, from: Point, zone: ZoneId): Point[] {
    const aisle = aisleFor(layout, from, zone)
    const gx = layout.gate.x
    const exit = streetEntry(layout)
    return [
        from,
        { x: from.x, y: aisle },
        { x: gx, y: aisle },
        { x: gx, y: layout.depth - 0.4 },
        { x: gx, y: exit.y },
        exit,
    ]
}

/** De una plaza a otra (cambio de etapa) */
export function routeBetween(layout: GarageLayout, from: Point, fromZone: ZoneId | null, to: Spot): Point[] {
    const exitAisle = aisleFor(layout, from, fromZone)
    const gx = layout.gate.x
    return [
        from,
        { x: from.x, y: exitAisle },
        { x: gx, y: exitAisle },
        { x: gx, y: to.aisleY },
        { x: to.cx, y: to.aisleY },
        { x: to.cx, y: to.cy },
    ]
}

/** Longitud de una ruta en baldosas */
export function routeLength(points: Point[]) {
    let total = 0
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    return total
}

/** Posición y dirección a una distancia d de la ruta. `rev`: avanza hacia x o y decreciente (el morro va delante) */
export function pointAlong(points: Point[], distance: number): Point & { dir: "x" | "y"; rev: boolean; done: boolean } {
    let remaining = Math.max(0, distance)
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]
        const b = points[i]
        const seg = Math.hypot(b.x - a.x, b.y - a.y)
        if (remaining <= seg || i === points.length - 1) {
            const t = seg === 0 ? 1 : Math.min(1, remaining / seg)
            const dir = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? "x" : "y"
            const rev = dir === "x" ? b.x < a.x : b.y < a.y
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dir, rev, done: i === points.length - 1 && t >= 1 }
        }
        remaining -= seg
    }
    const last = points[points.length - 1]
    return { ...last, dir: "y", rev: false, done: true }
}

/** Dos rectángulos se solapan (para los tests) */
export function overlaps(a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d
}

/** Huella del coche aparcado en una plaza */
export function carFootprint(spot: Spot) {
    return { x: spot.cx - CAR_W / 2, y: spot.cy - CAR_L / 2, w: CAR_W, d: CAR_L }
}
