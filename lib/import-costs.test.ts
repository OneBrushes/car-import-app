import { describe, expect, it } from "vitest"
import {
    calculateImportCost,
    DEFAULT_IMPORT_COSTS,
    DEFAULT_IMPORT_COST_SETTINGS,
    depreciationPercent,
    normalizeImportCostSettings,
    registrationTaxRate,
} from "./import-costs"
import { awaitingReplySince, claudeCarToImportedCar, computeClaudeCar, daysSince, isNewForVat, needsFollowUp, normalizeListingUrl, withContacts, type ClaudeCar } from "./claude-cars"

const TODAY = new Date(2026, 10, 21) // 21/11/2026

describe("calculateImportCost · IEDMT", () => {
    it("caso de control: VW Golf R 02/2022, valor Hacienda 39.000 €, CO2 160–199, Cataluña", () => {
        const r = calculateImportCost({
            purchasePrice: 32000,
            fiscalValueNew: 39000,
            firstRegistration: new Date(2022, 1, 1),
            co2: 178,
            region: "cataluna",
            payVat: false,
            ...DEFAULT_IMPORT_COSTS,
            other: 0,
            today: TODAY,
        })
        expect(r.ageYears).toBe(4)
        expect(r.depreciation).toBe(47) // Más de 4 años, hasta 5 (anexo IV Orden HAC/1501/2025)
        expect(r.marketValue).toBe(18330)
        expect(r.taxBase).toBe(14019) // 18.330 / (1 + 0,21 + 0,0975)
        expect(r.taxRate).toBe(9.75)
        expect(r.registrationTax).toBe(1366.85)
    })

    const control = (fiscalValueNew: number, firstRegistration: Date, co2: number) => calculateImportCost({
        purchasePrice: 30000, fiscalValueNew, firstRegistration, co2, region: "cataluna", payVat: false,
        ...DEFAULT_IMPORT_COSTS, other: 0, today: TODAY,
    })

    it("caso de control: Mitsubishi Lancer Evo X MR 06/2009, 49.100 €, 256 g/km, Cataluña → 573,44 €", () => {
        const r = control(49100, new Date(2009, 5, 1), 256)
        expect(r.depreciation).toBe(10) // Más de 12 años
        expect(r.taxRate).toBe(16)
        expect(r.taxBase).toBe(3584) // 4.910 / 1,37
        expect(r.registrationTax).toBe(573.44)
    })

    it("caso de control: Mercedes C 63 AMG W204 09/2009, 62.700 €, 280 g/km, Cataluña → 732,32 €", () => {
        const r = control(62700, new Date(2009, 8, 1), 280)
        expect(r.depreciation).toBe(10)
        expect(r.taxBase).toBe(4577) // 6.270 / 1,37
        expect(r.registrationTax).toBe(732.32)
    })

    it("tipos por CO2: estatales y Cataluña (16 % desde 200 g/km)", () => {
        expect(registrationTaxRate(120)).toBe(0)
        expect(registrationTaxRate(121)).toBe(4.75)
        expect(registrationTaxRate(159)).toBe(4.75)
        expect(registrationTaxRate(160)).toBe(9.75)
        expect(registrationTaxRate(199)).toBe(9.75)
        expect(registrationTaxRate(200)).toBe(14.75)
        expect(registrationTaxRate(200, "cataluna")).toBe(16)
        expect(registrationTaxRate(178, "cataluna")).toBe(9.75)
        expect(registrationTaxRate(null)).toBe(0)
    })

    it("tabla de años de uso 2026", () => {
        expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20].map(depreciationPercent))
            .toEqual([100, 84, 67, 56, 47, 39, 34, 28, 24, 19, 17, 13, 10, 10])
    })

    it("sin valor de Hacienda usa el precio de compra sin minorar", () => {
        const r = calculateImportCost({
            purchasePrice: 20000, firstRegistration: new Date(2020, 0, 1), co2: 210, payVat: false,
            ...DEFAULT_IMPORT_COSTS, other: 0, today: TODAY,
        })
        expect(r.taxBase).toBe(20000)
        expect(r.registrationTax).toBe(2950)
    })

    it("el impuesto indicado sustituye al calculado, pero se conserva el calculado", () => {
        const r = calculateImportCost({
            purchasePrice: 20000, firstRegistration: new Date(2020, 0, 1), co2: 210, payVat: false,
            registrationTaxOverride: 1200, ...DEFAULT_IMPORT_COSTS, other: 0, today: TODAY,
        })
        expect(r.registrationTax).toBe(1200)
        expect(r.computedRegistrationTax).toBe(2950)
        expect(r.registrationTaxOverridden).toBe(true)
    })

    it("compra como empresa con IVA deducible: cuenta el precio neto y no suma IVA", () => {
        const base = { purchasePrice: 23800, firstRegistration: new Date(2026, 8, 1), co2: 100, payVat: true, ...DEFAULT_IMPORT_COSTS, other: 0, today: TODAY }
        const particular = calculateImportCost(base)
        const empresa = calculateImportCost({ ...base, vatDeductible: true, netPrice: 20000 })
        expect(particular.vat).toBe(4998)
        expect(empresa.vat).toBe(0)
        expect(empresa.effectivePurchasePrice).toBe(20000)
        expect(particular.totalCost - empresa.totalCost).toBe(3800 + 4998)
    })
})

describe("ajustes de gastos fijos", () => {
    it("rellena lo que falte con los valores por defecto", () => {
        expect(normalizeImportCostSettings(null)).toEqual(DEFAULT_IMPORT_COST_SETTINGS)
        expect(normalizeImportCostSettings({ transport: 1100, itv: "x", region: "cataluna" }))
            .toEqual({ ...DEFAULT_IMPORT_COST_SETTINGS, transport: 1100, region: "cataluna" })
        expect(normalizeImportCostSettings({ region: "marte" }).region).toBe("cataluna")
        expect(DEFAULT_IMPORT_COST_SETTINGS.region).toBe("cataluna")
    })
})

describe("coches de Claude", () => {
    const settings = { ...DEFAULT_IMPORT_COST_SETTINGS, region: "cataluna" as const }

    it("usa la misma fórmula que la Calculadora", () => {
        const calc = computeClaudeCar({
            url: "https://suchen.mobile.de/x", anio: 2022, mes_matriculacion: 2, km: 40000, co2: 178,
            precio_alemania: 32000, valor_hacienda: 39000, precio_venta_estimado_espana: 40000,
        }, settings, TODAY)
        const direct = calculateImportCost({
            purchasePrice: 32000, fiscalValueNew: 39000, firstRegistration: new Date(2022, 1, 1), co2: 178,
            region: "cataluna", payVat: false, ...DEFAULT_IMPORT_COSTS, other: 0, expectedSalePrice: 40000, today: TODAY,
        })
        expect(calc.coste_total_espana).toBe(direct.totalCost)
        expect(calc.beneficio).toBe(direct.margin)
        expect(calc.impuesto_calculado).toBe(1366.85)
        expect(calc.aviso_impuesto).toBeNull()
        expect(calc.desglose.impuesto_aplicado).toBe("app")
    })

    it("aplica el impuesto de Claude y avisa si difiere más de 100 €", () => {
        const calc = computeClaudeCar({
            url: "u", anio: 2022, mes_matriculacion: 2, km: 40000, co2: 178, precio_alemania: 32000,
            valor_hacienda: 39000, impuesto_matriculacion: 1600,
        }, settings, TODAY)
        expect(calc.desglose.impuesto_aplicado).toBe("claude")
        expect(calc.desglose.lines.find(l => l.label === "Impuesto de matriculación")?.amount).toBe(1600)
        expect(calc.aviso_impuesto).toMatch(/difiere/)

        const close = computeClaudeCar({
            url: "u", anio: 2022, mes_matriculacion: 2, km: 40000, co2: 178, precio_alemania: 32000,
            valor_hacienda: 39000, impuesto_matriculacion: 1400,
        }, settings, TODAY)
        expect(close.aviso_impuesto).toBeNull()
    })

    it("los gastos que manda Claude sustituyen a los de los ajustes", () => {
        const a = computeClaudeCar({ url: "u", anio: 2020, precio_alemania: 10000 }, settings, TODAY)
        const b = computeClaudeCar({ url: "u", anio: 2020, precio_alemania: 10000, transporte: 600 }, settings, TODAY)
        expect(a.coste_total_espana - b.coste_total_espana).toBe(DEFAULT_IMPORT_COSTS.transport - 600)
    })

    it("IVA español solo para coches nuevos a efectos de IVA (<6 meses o <6.000 km)", () => {
        expect(isNewForVat(new Date(2026, 7, 1), 9000, TODAY)).toBe(true)
        expect(isNewForVat(new Date(2024, 0, 1), 5000, TODAY)).toBe(true)
        expect(isNewForVat(new Date(2024, 0, 1), 50000, TODAY)).toBe(false)
    })

    it("normaliza la URL para no duplicar", () => {
        expect(normalizeListingUrl("suchen.mobile.de/fahrzeuge/details.html?id=1#top"))
            .toBe("https://suchen.mobile.de/fahrzeuge/details.html?id=1")
        expect(normalizeListingUrl("https://WWW.AutoScout24.de/angebote/x/")).toBe("https://www.autoscout24.de/angebote/x")
    })

    it("al mover a mis coches, el precio final cuadra con el coste calculado", () => {
        const fields = { url: "https://suchen.mobile.de/x", marca: "VW", modelo: "Golf", version: "R", anio: 2022, mes_matriculacion: 2, km: 40000, co2: 178, precio_alemania: 32000, valor_hacienda: 39000 }
        const car = { ...fields, ...computeClaudeCar(fields, settings, TODAY), id: "1", user_id: "u", estado: "interesante", movido_a: null, created_at: "", updated_at: "" } as ClaudeCar
        const row = claudeCarToImportedCar(car)
        const sum = row.price + row.expenses.reduce((s, e) => s + e.amount, 0)
        expect(Math.round(sum * 100) / 100).toBe(car.coste_total_espana)
        expect(row.model).toBe("Golf R")
        expect(row.platform).toBe("mobile.de")
    })
})

describe("historial de contactos", () => {
    const base = { coche_id: "c1", canal: "mobile.de" as const, asunto: null, enviado_por: "claude" as const, notas: null }
    const sent = (id: string, fecha: string) => ({ ...base, id, fecha, direccion: "enviado" as const, mensaje: "Hallo" })
    const got = (id: string, fecha: string) => ({ ...base, id, fecha, direccion: "recibido" as const, mensaje: "Danke" })
    const NOW = new Date("2026-11-25T12:00:00Z")

    it("ordena los mensajes y calcula el último", () => {
        const car = withContacts({ id: "c1" }, [got("2", "2026-11-22T10:00:00Z"), sent("1", "2026-11-21T19:45:00Z"), { ...sent("x", "2026-11-23T00:00:00Z"), coche_id: "otro" }])
        expect(car.contactos.map(c => c.id)).toEqual(["1", "2"])
        expect(car.ultimo_contacto).toBe("2026-11-22T10:00:00Z")
    })

    it("sin respuesta: solo si el último mensaje es nuestro y tiene más de 3 días", () => {
        expect(needsFollowUp([sent("1", "2026-11-21T19:45:00Z")], NOW)).toBe(true)
        expect(needsFollowUp([sent("1", "2026-11-23T19:45:00Z")], NOW)).toBe(false)
        expect(needsFollowUp([sent("1", "2026-11-20T10:00:00Z"), got("2", "2026-11-21T10:00:00Z")], NOW)).toBe(false)
        expect(needsFollowUp([], NOW)).toBe(false)
        expect(awaitingReplySince([got("2", "2026-11-21T10:00:00Z"), sent("1", "2026-11-22T10:00:00Z")])).toBe("2026-11-22T10:00:00Z")
        expect(daysSince("2026-11-21T19:45:00Z", NOW)).toBe(3)
    })
})
