import { describe, expect, it } from "vitest"
import { MANUAL_REVIEW_MAX, manualReviewText, planManualReviews, revisionDayText, summarizeRevisionDays, type CarRow } from "./listing-check"
import { DEFAULT_IMPORT_COST_SETTINGS } from "./import-costs"
import { computeClaudeCar, type ClaudeCar } from "./claude-cars"

const settings = { ...DEFAULT_IMPORT_COST_SETTINGS }
const NOW = new Date("2026-11-24T10:00:00Z")
const car = (id: string, extra: Partial<CarRow> = {}): CarRow => {
    const base = {
        id, user_id: "u", url: `https://suchen.mobile.de/fahrzeuge/details.html?id=${id.length}`, estado: "nuevo", movido_a: null, created_at: "", updated_at: "",
        marca: "BMW", modelo: `M${id}`, anio: 2019, mes_matriculacion: 6, km: 60000, co2: 190, precio_alemania: 30000,
        precio_venta_estimado_espana: 42000, notas: null, anuncio_fallos_seguidos: 0,
        coste_total_espana: 0, beneficio: null, margen_pct: null, impuesto_calculado: 0, aviso_impuesto: null, desglose: null as unknown as ClaudeCar["desglose"],
        ...extra,
    } as CarRow
    return { ...base, ...computeClaudeCar(base, settings) }
}
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

describe("marcar_anuncios · revisión manual en bloque", () => {
    it("lista mixta: activos sin cambios, retirado 1.ª vez, sube y baja de precio", () => {
        const cars = [car(ID(1)), car(ID(2)), car(ID(3)), car(ID(4))]
        const p = planManualReviews(cars, [
            { id: ID(1), estado: "activo", precio: 30000 },
            { id: ID(2), estado: "retirado", nota: "404" },
            { id: ID(3), estado: "activo", precio: 32000 },
            { id: ID(4), estado: "activo", precio: 27500 },
        ], settings, NOW)
        expect(p.resumen).toMatchObject({ revisados: 4, activos: 3, retirados: 1, cambios_precio: 2, errores: 0, pasan_a_retirado: 0 })
        expect(p.reviews.every(r => r.historial.origen === "manual")).toBe(true)
        // retirado 1.ª vez: aviso, sin cambiar de estado
        expect(p.reviews[1].patch).toMatchObject({ anuncio_estado: "retirado", anuncio_fallos_seguidos: 1 })
        expect(p.reviews[1].patch.estado).toBeUndefined()
        // subida: precio nuevo, precio_original y beneficio recalculado a la baja
        const sube = p.reviews[2].patch
        expect(sube).toMatchObject({ precio_alemania: 32000, precio_original: 30000, precio_bajado: false })
        expect(sube.beneficio as number).toBeLessThan(cars[2].beneficio!)
        // bajada: beneficio al alza
        const baja = p.reviews[3].patch
        expect(baja).toMatchObject({ precio_alemania: 27500, precio_original: 30000, precio_bajado: true })
        expect(baja.beneficio as number).toBeGreaterThan(cars[3].beneficio!)
        // la respuesta solo lista lo que cambia, con el beneficio antes → después
        const txt = manualReviewText(p)
        expect(txt).toMatch(/^Guardados 4 anuncio\(s\): 3 activos · 1 retirados · 2 cambios de precio\./)
        expect(txt).toMatch(/📈 BMW M.*30\.000 € → 32\.000 € · beneficio .* → /)
        expect(txt).toMatch(/📉 BMW M.*27\.500 €/)
        expect(txt).toMatch(/⚠️ .*retirado \(1\/2\)/)
        expect(txt).not.toContain(ID(1).slice(-4) + " ") // el que no cambia no aparece
        expect(txt.split("\n").length).toBe(5)
    })

    it("id inexistente o repetido → errores, y sigue con los demás", () => {
        const p = planManualReviews([car(ID(1))], [
            { id: ID(9), estado: "activo", precio: 1000 },
            { id: ID(1), estado: "activo", precio: 30000 },
            { id: ID(1), estado: "retirado" },
            { id: "no-es-un-uuid", estado: "retirado" },
        ], settings, NOW)
        expect(p.resumen).toMatchObject({ revisados: 1, activos: 1, errores: 3 })
        expect(p.errores.map(e => e.id)).toEqual([ID(9), ID(1), "no-es-un-uuid"])
        expect(manualReviewText(p)).toMatch(/Errores:\n• 0+-0000-4000-8000-0+9: no existe/)
    })

    it("retirado por 2.ª vez seguida → estado 'retirado' con retirado_en", () => {
        const p = planManualReviews([car(ID(1), { anuncio_fallos_seguidos: 1, estado: "contactado" })], [{ id: ID(1), estado: "retirado" }], settings, NOW)
        expect(p.reviews[0].patch).toMatchObject({ estado: "retirado", retirado_en: NOW.toISOString(), anuncio_fallos_seguidos: 2 })
        expect(p.resumen.pasan_a_retirado).toBe(1)
        expect(manualReviewText(p)).toMatch(/🏷️ .*Vendido \/ retirado/)
    })

    it(`límite de ${MANUAL_REVIEW_MAX} anuncios`, () => {
        const many = Array.from({ length: MANUAL_REVIEW_MAX }, (_, i) => ({ id: ID(i + 1), estado: "activo" as const }))
        const cars = many.map(m => car(m.id))
        expect(planManualReviews(cars, many, settings, NOW).resumen.revisados).toBe(MANUAL_REVIEW_MAX)
        expect(() => planManualReviews(cars, [...many, { id: ID(999), estado: "activo" }], settings, NOW)).toThrow(/200/)
    })

    it("sale en resumen_revision como 'Manual'", () => {
        const [day] = summarizeRevisionDays([{ fecha: "2026-11-24", origen: "manual", revisados: 90, activos: 88, retirados: 2, cambios_precio: 3, errores: 0, completa: true }])
        expect(revisionDayText(day)).toMatch(/Manual \(Claude con el navegador\): 90 revisados · 88 activos · 2 retirados · 3 cambios de precio/)
    })
})
