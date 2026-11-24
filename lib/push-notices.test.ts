import { describe, expect, it } from "vitest"
import { dailyReviewNotice, reviewChangeLines } from "./listing-check"

describe("avisos push de la revisión", () => {
    it("reviewChangeLines: vendidos y cambios de precio, nada más", () => {
        const lines = reviewChangeLines([
            { nombre: "BMW X3 (2021)", precio_anterior: 30000, patch: { estado: "retirado", retirado_en: "x" } },
            { nombre: "Audi A4 (2020)", precio_anterior: 20000, patch: { precio_alemania: 18500, beneficio: 3000 } },
            { nombre: "VW Golf (2019)", precio_anterior: 15000, patch: { precio_alemania: 15900 } },
            { nombre: "Seat León", precio_anterior: 12000, patch: { anuncio_fallos_seguidos: 0 } },
        ])
        expect(lines).toEqual([
            "🏷️ BMW X3 (2021): vendido / retirado",
            "📉 Audi A4 (2020): 20.000 € → 18.500 €",
            "📈 VW Golf (2019): 15.000 € → 15.900 €",
        ])
    })

    it("dailyReviewNotice: suma todas las tandas del día", () => {
        const rows = [
            { fecha: "2026-11-24", revisados: 15, cambios_precio: 1, detalle: { pasan_a_retirado: 0, cambios: ["📉 Audi A4: 20.000 € → 18.500 €"] } },
            { fecha: "2026-11-24", revisados: 15, cambios_precio: 0, detalle: { pasan_a_retirado: 1, cambios: ["🏷️ BMW X3: vendido / retirado"] } },
            { fecha: "2026-11-24", revisados: 7, cambios_precio: 0, detalle: { pasan_a_retirado: 0 } },
            { fecha: "2026-11-23", revisados: 30, cambios_precio: 5, detalle: { pasan_a_retirado: 3, cambios: ["ayer"] } },
        ]
        const n = dailyReviewNotice(rows, "2026-11-24")!
        expect(n.title).toBe("Revisión de anuncios · 37 revisados")
        expect(n.body).toBe("1 vendido(s) / retirado(s) · 1 cambio(s) de precio\n📉 Audi A4: 20.000 € → 18.500 €\n🏷️ BMW X3: vendido / retirado")
        expect(n.tag).toBe("revision-2026-11-24")
        expect(n.url).toBe("/?tab=claude")
    })

    it("dailyReviewNotice: sin cambios no avisa; con muchos los recorta", () => {
        expect(dailyReviewNotice([{ fecha: "2026-11-24", revisados: 40, cambios_precio: 0, detalle: { pasan_a_retirado: 0 } }], "2026-11-24")).toBeNull()
        const cambios = Array.from({ length: 7 }, (_, i) => `📉 Coche ${i}`)
        const n = dailyReviewNotice([{ fecha: "2026-11-24", revisados: 15, cambios_precio: 7, detalle: { cambios } }], "2026-11-24")!
        expect(n.body.split("\n")).toEqual(["7 cambio(s) de precio", "📉 Coche 0", "📉 Coche 1", "📉 Coche 2", "📉 Coche 3", "… y 3 más"])
    })
})
