import { describe, expect, it } from "vitest"
import { computeClaudeCar, formatTravelHours, travelTransport } from "./claude-cars"
import { DEFAULT_IMPORT_COST_SETTINGS } from "./import-costs"

const TODAY = new Date(2026, 10, 22)
const base = { url: "u", anio: 2020, mes_matriculacion: 3, km: 50000, co2: 170, precio_alemania: 30000, precio_venta_estimado_espana: 40000 }
const transportLine = (c: ReturnType<typeof computeClaudeCar>) => c.desglose.lines.find(l => /transporte/i.test(l.label))?.amount

describe("viaje para traer el coche", () => {
    it("con coste de ruta, transporte = ruta + extras (y manda sobre transporte y los ajustes)", () => {
        expect(travelTransport({ viaje_coste_ruta: 412, viaje_extras: 310 })).toBe(722)
        const c = computeClaudeCar({ ...base, transporte: 900, viaje_coste_ruta: 412, viaje_extras: 310 }, DEFAULT_IMPORT_COST_SETTINGS, TODAY)
        expect(transportLine(c)).toBe(722)
    })
    it("sin coste de ruta se usa transporte o el de los ajustes", () => {
        expect(travelTransport({ viaje_extras: 300 })).toBeNull()
        expect(transportLine(computeClaudeCar({ ...base, viaje_extras: 300 }, DEFAULT_IMPORT_COST_SETTINGS, TODAY))).toBe(DEFAULT_IMPORT_COST_SETTINGS.transport)
        expect(transportLine(computeClaudeCar({ ...base, transporte: 650 }, DEFAULT_IMPORT_COST_SETTINGS, TODAY))).toBe(650)
    })
    it("horas en texto", () => {
        expect(formatTravelHours(13 + 10 / 60)).toBe("13 h 10 min")
        expect(formatTravelHours(9)).toBe("9 h")
        expect(formatTravelHours(0.5)).toBe("30 min")
    })
})
