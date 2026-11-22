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

import { activeFilterCount, matchesCarFilters } from "./claude-cars"

describe("filtros por rangos de Guardados por Claude", () => {
    const golf = { marca: "Volkswagen", precio_alemania: 28000, km: 60000, anio: 2021, coste_total_espana: 32000, beneficio: 3500 }
    const m2 = { marca: "BMW", precio_alemania: 39000, km: 30000, anio: 2019, coste_total_espana: 45000, beneficio: null }
    it("varios filtros a la vez", () => {
        const f = { precioMax: 30000, kmMax: 80000, anioMin: 2020 }
        expect(activeFilterCount(f)).toBe(3)
        expect(matchesCarFilters(golf, f)).toBe(true)
        expect(matchesCarFilters(m2, f)).toBe(false)
    })
    it("si falta el dato y el filtro está puesto, no pasa; marcas", () => {
        expect(matchesCarFilters(m2, { beneficioMin: 1000 })).toBe(false)
        expect(matchesCarFilters(m2, { marcas: ["bmw"] })).toBe(true)
        expect(matchesCarFilters(golf, { marcas: ["BMW", "Audi"] })).toBe(false)
        expect(matchesCarFilters(golf, {})).toBe(true)
    })
})
