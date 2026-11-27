import { describe, expect, it } from "vitest"
import { PURCHASE_STAGE_BY_NAME, purchaseStageLabel, purchaseText, purchaseTotals, stageName, stagePatch, type PurchaseCar } from "./purchases"

const reserved: PurchaseCar = {
    id: "inv-1", brand: "BMW", model: "X3", year: 2021, initial_price: 30000, initial_expenses: 0, date_purchased: "2026-11-27",
    status: "inventory", logistic_status: "reserved", senal: 3000,
    expenses: [
        { id: "g2", concept: "Hotel Múnich", amount: 120, date: "2026-12-03", category: "Viaje" },
        { id: "g1", concept: "Vuelo Madrid-Múnich", amount: "189.5", date: "2026-12-02", category: "Viaje" },
    ],
}

describe("Comprados: reservado y gastos", () => {
    it("totales de un coche reservado: falta por pagar y gastos aparte", () => {
        expect(purchaseTotals(reserved)).toEqual({ precio: 30000, gastos: 309.5, invertido: 30309.5, reservado: true, senal: 3000, pendiente: 27000, pagado: 3309.5 })
    })

    it("totales de un coche ya comprado: no hay nada pendiente", () => {
        const t = purchaseTotals({ ...reserved, logistic_status: "purchased" })
        expect(t.pendiente).toBe(0)
        expect(t.pagado).toBe(30309.5)
    })

    it("texto para el MCP con los gastos ordenados por fecha y sus ids", () => {
        const text = purchaseText(reserved)
        expect(text).toContain("BMW X3 (2021) · Reservado · id inv-1")
        expect(text).toContain("Precio acordado 30.000 € · señal pagada 3000 € · falta por pagar 27.000 €")
        expect(text.indexOf("Vuelo")).toBeLessThan(text.indexOf("Hotel"))
        expect(text).toContain("• Hotel Múnich: 120 € (Viaje) · 3/12/2026 · id g2")
    })

    it("nombres de fase en español ↔ guardados", () => {
        expect(PURCHASE_STAGE_BY_NAME.reservado).toBe("reserved")
        expect(stageName("homologation")).toBe("tramites")
        expect(stageName("xx")).toBeNull()
        expect(purchaseStageLabel({ status: "sold", logistic_status: "ready" })).toBe("Vendido")
        expect(purchaseStageLabel({ status: "inventory", logistic_status: null })).toBe("Comprado")
    })

    it("al pagar el resto la fecha de compra pasa a ser la del pago", () => {
        expect(stagePatch({ logistic_status: "reserved" }, "purchased", null, "2026-12-05")).toEqual({ logistic_status: "purchased", date_purchased: "2026-12-05" })
        expect(stagePatch({ logistic_status: "reserved" }, "purchased", "2026-12-04", "2026-12-05")).toEqual({ logistic_status: "purchased", date_purchased: "2026-12-04" })
        expect(stagePatch({ logistic_status: "purchased" }, "in_transit", null)).toEqual({ logistic_status: "in_transit" })
    })
})
