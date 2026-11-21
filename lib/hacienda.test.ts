import { describe, expect, it } from "vitest"
import { HACIENDA_MIN_SCORE, brandKey, cleanModelText, modelVariants, needsVersionCheck, rankHaciendaRows, type HaciendaRow } from "./hacienda"
import { calculateImportCost, DEFAULT_IMPORT_COSTS } from "./import-costs"
// Filas reales del anexo I de la Orden HAC/1501/2025 (Golf, Lancer y Mercedes Clase C), leídas con scripts/import-hacienda.ts
import muestra from "./__fixtures__/hacienda-muestra.json"

const rows = muestra as HaciendaRow[]
const TODAY = new Date(2026, 10, 21)
const brand = (b: string) => rows.filter(r => r.marca === b)

const iedmtCataluna = (valor: number, fecha: Date, co2: number) => calculateImportCost({
    purchasePrice: 30000, fiscalValueNew: valor, firstRegistration: fecha, co2, region: "cataluna", payVat: false,
    ...DEFAULT_IMPORT_COSTS, other: 0, today: TODAY,
}).registrationTax

describe("valores de Hacienda · búsqueda por parecido", () => {
    it("Golf R 02/2022 (320 → 300 CV en 2020–2022) → 39.000 € → IEDMT 1.366,85 €", () => {
        const [best] = rankHaciendaRows(brand("VOLKSWAGEN"), { marca: "Volkswagen", modelo: "Golf R 2.0 TSI 4Motion DSG", anio: 2022, cc: 1984, cv: 300 })
        expect(best.valor).toBe(39000)
        expect(best.modelo).toMatch(/GOLF 5 ptas\. R 2\.0 TSI 4Motion DSG/)
        expect(iedmtCataluna(best.valor, new Date(2022, 1, 1), 178)).toBe(1366.85)
    })

    it("Lancer Evo X MR 06/2009 → 49.100 € → IEDMT 573,44 €", () => {
        const matches = rankHaciendaRows(brand("MITSUBISHI"), { marca: "Mitsubishi", modelo: "Lancer Evolution X MR", anio: 2009, cv: 295 })
        expect(matches[0].valor).toBe(49100)
        expect(needsVersionCheck(matches)).toBe(false)
        expect(iedmtCataluna(matches[0].valor, new Date(2009, 5, 1), 256)).toBe(573.44)
    })

    it("C 63 AMG W204 09/2009 → 62.700 € → IEDMT 732,32 €", () => {
        const [best] = rankHaciendaRows(brand("MERCEDES"), { marca: "Mercedes-Benz", modelo: "C 63 AMG W204", anio: 2009, cc: 6208, cv: 457 })
        expect(best.valor).toBe(62700)
        expect(iedmtCataluna(best.valor, new Date(2009, 8, 1), 280)).toBe(732.32)
    })

    it("modelo 'Clase E' + versión 'Mercedes-AMG E 43 4MATIC' 2017, 401 CV → E 43 AMG 4Matic (W213) 77.700 €", () => {
        const matches = rankHaciendaRows(brand("MERCEDES"), {
            marca: "Mercedes-Benz", modelo: "Clase E", version: "Mercedes-AMG E 43 4MATIC", anio: 2017, cv: 401,
        })
        expect(matches[0].valor).toBe(77700)
        expect(matches[0].modelo).toBe("E 43 AMG 4Matic(W213)")
        expect(matches[0].parecido).toBeGreaterThanOrEqual(HACIENDA_MIN_SCORE)
    })

    it("limpia el nombre antes de buscar", () => {
        expect(cleanModelText("Clase E Mercedes-AMG E 43 4MATIC", "Mercedes-Benz")).toBe("E 43 4MATIC")
        expect(cleanModelText("E-Klasse E 220 d")).toBe("E 220 D")
        expect(cleanModelText("BMW M3 Competition", "BMW")).toBe("M3 COMPETITION")
        expect(modelVariants({ marca: "Mercedes-Benz", modelo: "Clase E", version: "Mercedes-AMG E 43 4MATIC" })).toEqual(["E 43 4MATIC", "E"])
    })

    it("sin potencia hay varias versiones posibles: avisa de verificar", () => {
        const matches = rankHaciendaRows(brand("VOLKSWAGEN"), { marca: "VW", modelo: "Golf R", anio: 2022 })
        expect(needsVersionCheck(matches)).toBe(true)
    })

    it("marcas: alias habituales", () => {
        expect(brandKey("VW")).toBe("VOLKSWAGEN")
        expect(brandKey("Mercedes-Benz")).toBe("MERCEDES")
        expect(brandKey("Alfa Romeo")).toBe("ALFAROMEO")
    })
})
