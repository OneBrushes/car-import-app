/**
 * Resumen fiscal trimestral de ventas de coches (orientativo, para la gestoría).
 *
 * - Régimen general: el precio de venta incluye IVA 21% → base = precio / 1,21.
 * - REBU (bienes usados): el IVA se calcula sobre el margen (venta − precio de compra),
 *   operación por operación; un margen negativo no se compensa → base 0.
 * Ambos van al tipo del 21% en el modelo 303 (casillas 07 base y 09 cuota).
 */

export type Regime = "general" | "rebu"

export interface SaleInput {
    id: string
    brand: string
    model: string
    plate?: string | null
    date_sold: string
    sell_price: number
    initial_price: number
    vat_regime?: string | null
    invoice_number?: string | null
    customer?: { name?: string; nif?: string | null } | null
    buyer?: string | null
}

export interface SaleLine extends SaleInput {
    regime: Regime
    regimeMissing: boolean
    margin: number | null
    base: number
    vat: number
}

export const VAT_RATE = 0.21

const round2 = (n: number) => Math.round(n * 100) / 100

export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4) {
    const start = new Date(year, (quarter - 1) * 3, 1)
    const end = new Date(year, quarter * 3, 0) // último día del trimestre
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    return { start, end, from: iso(start), to: iso(end) }
}

export function currentQuarter(date = new Date()): { year: number; quarter: 1 | 2 | 3 | 4 } {
    return { year: date.getFullYear(), quarter: (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 }
}

export function computeSale(sale: SaleInput): SaleLine {
    const regimeMissing = sale.vat_regime !== "general" && sale.vat_regime !== "rebu"
    const regime: Regime = sale.vat_regime === "general" ? "general" : "rebu"
    const price = Number(sale.sell_price) || 0

    if (regime === "general") {
        const base = round2(price / (1 + VAT_RATE))
        return { ...sale, regime, regimeMissing, margin: null, base, vat: round2(price - base) }
    }

    const margin = round2(price - (Number(sale.initial_price) || 0))
    const taxableMargin = Math.max(margin, 0)
    const base = round2(taxableMargin / (1 + VAT_RATE))
    return { ...sale, regime, regimeMissing, margin, base, vat: round2(taxableMargin - base) }
}

export interface FiscalTotals {
    salesCount: number
    salesTotal: number
    base: number
    vat: number
    general: { count: number; total: number; base: number; vat: number }
    rebu: { count: number; total: number; margin: number; base: number; vat: number; negativeMargins: number }
    missingRegime: number
}

export function computeTotals(lines: SaleLine[]): FiscalTotals {
    const general = lines.filter(l => l.regime === "general")
    const rebu = lines.filter(l => l.regime === "rebu")
    const sum = (arr: SaleLine[], f: (l: SaleLine) => number) => round2(arr.reduce((s, l) => s + f(l), 0))
    return {
        salesCount: lines.length,
        salesTotal: sum(lines, l => l.sell_price),
        base: sum(lines, l => l.base),
        vat: sum(lines, l => l.vat),
        general: { count: general.length, total: sum(general, l => l.sell_price), base: sum(general, l => l.base), vat: sum(general, l => l.vat) },
        rebu: {
            count: rebu.length,
            total: sum(rebu, l => l.sell_price),
            margin: sum(rebu, l => l.margin || 0),
            base: sum(rebu, l => l.base),
            vat: sum(rebu, l => l.vat),
            negativeMargins: rebu.filter(l => (l.margin || 0) < 0).length,
        },
        missingRegime: lines.filter(l => l.regimeMissing).length,
    }
}
