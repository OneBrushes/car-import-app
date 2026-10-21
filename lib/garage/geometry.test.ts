import { describe, expect, it } from "vitest"
import {
    carFootprint, computeLayout, overlaps, pointAlong, routeIn, routeOut, spotsOfZone, truckCarPosition,
    zoneForStage, ZONES, OFFICE, TRUCK_CAPACITY, type ParkStage,
} from "./geometry"
import { bodyType, carColor, fmtEur, fmtNum, fmtPct, toParkStage, UNKNOWN } from "./data"

const ALL_STAGES: ParkStage[] = ["purchased", "in_transit", "homologation", "detailing", "ready", "sold"]

describe("etapas → zonas", () => {
    it("cada etapa real tiene una zona (o el camión)", () => {
        for (const stage of ALL_STAGES) {
            const zone = zoneForStage(stage)
            expect(zone === "truck" || ZONES.some(z => z.id === zone)).toBe(true)
        }
        expect(zoneForStage("in_transit")).toBe("truck")
        expect(zoneForStage("ready")).toBe("showroom")
        expect(zoneForStage("detailing")).toBe("workshop")
    })

    it("lee las etapas de inventory_cars", () => {
        expect(toParkStage({ status: "sold", logistic_status: "ready" })).toBe("sold")
        expect(toParkStage({ status: "inventory", logistic_status: "detailing" })).toBe("detailing")
        expect(toParkStage({ status: "inventory", logistic_status: null })).toBe("purchased")
        expect(toParkStage({ status: "inventory", logistic_status: "algo-raro" })).toBe("purchased")
    })
})

describe("distribución del parking", () => {
    const sizes = [0, 1, 7, 30, 120, 200]

    for (const n of sizes) {
        it(`nunca solapa coches ni plazas (${n} coches por zona)`, () => {
            const layout = computeLayout({ counts: { arrivals: n, itv: Math.floor(n / 2), workshop: 3, showroom: n, exit: 1 }, trucks: 2 })
            const all = [...layout.spots, ...layout.emptySpots]
            const feet = layout.spots.map(carFootprint)
            for (let i = 0; i < feet.length; i++) {
                for (let j = i + 1; j < feet.length; j++) expect(overlaps(feet[i], feet[j])).toBe(false)
            }
            // Ninguna plaza invade la oficina
            for (const s of all) {
                const insideOffice = s.x < OFFICE.w && s.y < OFFICE.d
                expect(insideOffice).toBe(false)
            }
        })
    }

    it("da exactamente una plaza ocupada por coche en cada zona", () => {
        const layout = computeLayout({ counts: { arrivals: 5, itv: 2, workshop: 0, showroom: 9, exit: 0 }, trucks: 0 })
        expect(spotsOfZone(layout, "arrivals")).toHaveLength(5)
        expect(spotsOfZone(layout, "showroom")).toHaveLength(9)
        expect(spotsOfZone(layout, "workshop")).toHaveLength(0)
    })

    it("desborda en filas nuevas cuando una zona se llena", () => {
        const small = computeLayout({ counts: { arrivals: 2 }, trucks: 0 })
        const big = computeLayout({ counts: { arrivals: 90 }, trucks: 0 })
        const bandSmall = small.bands.find(b => b.zone === "arrivals")!
        const bandBig = big.bands.find(b => b.zone === "arrivals")!
        expect(bandBig.rows).toBeGreaterThan(bandSmall.rows)
        const ys = new Set(spotsOfZone(big, "arrivals").map(s => s.y))
        expect(ys.size).toBe(bandBig.rows)
    })

    it("las plazas están numeradas desde 1 sin repetir", () => {
        const layout = computeLayout({ counts: { showroom: 12 }, trucks: 0 })
        const numbers = spotsOfZone(layout, "showroom").map(s => s.index)
        expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    })

    it("reparte los coches en camiones de 3", () => {
        const layout = computeLayout({ counts: {}, trucks: 2 })
        expect(truckCarPosition(layout, 0).truck).toBe(0)
        expect(truckCarPosition(layout, TRUCK_CAPACITY).truck).toBe(1)
    })
})

describe("rutas", () => {
    it("ningún coche atraviesa a otro aparcado para llegar a su plaza o salir", () => {
        const layout = computeLayout({ counts: { arrivals: 26, itv: 8, workshop: 4, showroom: 26, exit: 2 }, trucks: 1 })
        const parked = layout.spots.map(s => ({ spot: s, foot: carFootprint(s) }))
        const inside = (p: { x: number; y: number }, f: ReturnType<typeof carFootprint>) =>
            p.x > f.x + 0.05 && p.x < f.x + f.w - 0.05 && p.y > f.y + 0.05 && p.y < f.y + f.d - 0.05
        for (const { spot } of parked) {
            for (const route of [routeIn(layout, spot), routeOut(layout, { x: spot.cx, y: spot.cy }, spot.zone)]) {
                const total = route.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - route[i - 1].x, p.y - route[i - 1].y) : 0, 0)
                for (let d = 0; d <= total; d += 0.35) {
                    const p = pointAlong(route, d)
                    // Solo hace falta mirar los coches cercanos al punto
                    for (const other of parked) {
                        if (other.spot === spot || Math.abs(other.spot.cy - p.y) > 2 || Math.abs(other.spot.cx - p.x) > 2) continue
                        expect(inside(p, other.foot), `${spot.zone}#${spot.index} cruza ${other.spot.zone}#${other.spot.index}`).toBe(false)
                    }
                }
            }
        }
    })

    it("un coche entra por la puerta y termina en su plaza", () => {
        const layout = computeLayout({ counts: { arrivals: 3 }, trucks: 0 })
        const spot = spotsOfZone(layout, "arrivals")[2]
        const route = routeIn(layout, spot)
        expect(route.some(p => p.x === layout.gate.x && p.y >= layout.depth)).toBe(true)
        const end = pointAlong(route, 1e9)
        expect(end.done).toBe(true)
        expect(end.x).toBeCloseTo(spot.cx)
        expect(end.y).toBeCloseTo(spot.cy)
    })

    it("un coche vendido sale fuera del parking", () => {
        const layout = computeLayout({ counts: { showroom: 1 }, trucks: 0 })
        const spot = spotsOfZone(layout, "showroom")[0]
        const route = routeOut(layout, { x: spot.cx, y: spot.cy }, "showroom")
        const end = route[route.length - 1]
        expect(end.y).toBeGreaterThan(layout.depth)
        expect(end.x).toBeGreaterThan(layout.width)
    })
})

describe("datos desconocidos", () => {
    it("se muestran como —", () => {
        expect(fmtEur(null)).toBe(UNKNOWN)
        expect(fmtEur(undefined)).toBe(UNKNOWN)
        expect(fmtNum(null)).toBe(UNKNOWN)
        expect(fmtPct(Number.NaN)).toBe(UNKNOWN)
        expect(fmtEur(12500)).toMatch(/12.500 €/)
    })

    it("sin color, el mismo coche tiene siempre el mismo color", () => {
        const a = carColor(null, "car-123")
        const b = carColor(undefined, "car-123")
        expect(a.known).toBe(false)
        expect(a.color).toBe(b.color)
        expect(carColor("Rojo metalizado", "x").color).toBe("#d8433a")
    })

    it("tipo de carrocería a partir de vehicle_type", () => {
        expect(bodyType("SUV")).toBe("suv")
        expect(bodyType("Familiar")).toBe("estate")
        expect(bodyType("Monovolumen")).toBe("van")
        expect(bodyType("Coupé")).toBe("coupe")
        expect(bodyType("")).toBe("hatchback")
        expect(bodyType(null, "Golf Variant")).toBe("estate")
    })
})

describe("coches de cliente en el garaje", () => {
    it("«En preparación» va al taller y «Entregado» sale como vendido", () => {
        expect(toParkStage({ status: "inventory", logistic_status: "preparing" })).toBe("detailing")
        expect(toParkStage({ status: "inventory", logistic_status: "delivered" })).toBe("sold")
    })
})
