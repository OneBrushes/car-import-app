/**
 * Cálculo del coste real de importar un coche usado a España (península y Baleares).
 *
 * Impuesto Especial sobre Determinados Medios de Transporte (IEDMT, "impuesto de matriculación"):
 *   base imponible = valor de tablas de Hacienda (o valor de mercado) × % de depreciación por antigüedad
 *   tipo según emisiones de CO2 WLTP.
 * Los valores son orientativos: Hacienda publica cada año la orden con los precios medios y
 * algunas comunidades autónomas aplican tipos incrementados. Canarias, Ceuta y Melilla tienen tipos propios.
 */

/** Porcentaje de valor que conserva el vehículo según años completos de uso (tabla de Hacienda). */
const DEPRECIATION_TABLE: { maxYears: number; percent: number }[] = [
    { maxYears: 1, percent: 100 },
    { maxYears: 2, percent: 84 },
    { maxYears: 3, percent: 67 },
    { maxYears: 4, percent: 56 },
    { maxYears: 5, percent: 47 },
    { maxYears: 6, percent: 39 },
    { maxYears: 7, percent: 34 },
    { maxYears: 8, percent: 28 },
    { maxYears: 9, percent: 24 },
    { maxYears: 10, percent: 19 },
    { maxYears: 11, percent: 17 },
    { maxYears: 12, percent: 13 },
]
const MIN_DEPRECIATION_PERCENT = 10

export function depreciationPercent(ageYears: number): number {
    const row = DEPRECIATION_TABLE.find(r => ageYears < r.maxYears)
    return row ? row.percent : MIN_DEPRECIATION_PERCENT
}

/** Tipo del IEDMT en función de las emisiones de CO2 (g/km, WLTP). */
export function registrationTaxRate(co2: number | null | undefined): number {
    if (co2 == null || Number.isNaN(co2)) return 0
    if (co2 <= 120) return 0
    if (co2 < 160) return 4.75
    if (co2 < 200) return 9.75
    return 14.75
}

/** Tasa DGT de matriculación (tasa 4.1). */
export const DGT_REGISTRATION_FEE = 99.77

export const DEFAULT_IMPORT_COSTS = {
    transport: 900,
    itv: 180,
    homologation: 250,
    plates: 25,
    agency: 200,
}

export interface ImportCostInput {
    /** Precio de compra del coche en EUR */
    purchasePrice: number
    /** Valor de tablas de Hacienda para ese modelo nuevo; si falta se usa el precio de compra como base */
    fiscalValueNew?: number | null
    /** Fecha de primera matriculación (o año) */
    firstRegistration: Date
    co2?: number | null
    /** Pagar IVA en España (compra a profesional de un vehículo "nuevo" a efectos fiscales: <6 meses o <6.000 km) */
    payVat: boolean
    transport: number
    itv: number
    homologation: number
    plates: number
    agency: number
    other: number
    /** Precio de venta esperado en España, para calcular el margen */
    expectedSalePrice?: number | null
}

export interface ImportCostLine {
    label: string
    amount: number
    hint?: string
}

export interface ImportCostResult {
    ageYears: number
    depreciation: number
    taxBase: number
    taxRate: number
    registrationTax: number
    vat: number
    lines: ImportCostLine[]
    totalCost: number
    margin: number | null
    marginPercent: number | null
}

export function ageInYears(firstRegistration: Date, today = new Date()): number {
    let years = today.getFullYear() - firstRegistration.getFullYear()
    const anniversary = new Date(firstRegistration)
    anniversary.setFullYear(firstRegistration.getFullYear() + years)
    if (anniversary > today) years--
    return Math.max(0, years)
}

export function calculateImportCost(input: ImportCostInput): ImportCostResult {
    const ageYears = ageInYears(input.firstRegistration)
    const depreciation = depreciationPercent(ageYears)
    const baseValue = input.fiscalValueNew && input.fiscalValueNew > 0
        ? input.fiscalValueNew * (depreciation / 100)
        : input.purchasePrice
    const taxRate = registrationTaxRate(input.co2)
    const registrationTax = round2(baseValue * (taxRate / 100))
    const vat = input.payVat ? round2(input.purchasePrice * 0.21) : 0

    const lines: ImportCostLine[] = [
        { label: "Precio de compra", amount: input.purchasePrice },
        ...(vat > 0 ? [{ label: "IVA en España (21%)", amount: vat }] : []),
        {
            label: "Impuesto de matriculación",
            amount: registrationTax,
            hint: taxRate === 0 ? "Exento por emisiones ≤ 120 g/km" : `${taxRate}% sobre ${formatEUR(baseValue)}`,
        },
        { label: "Transporte", amount: input.transport },
        { label: "ITV de importación", amount: input.itv },
        { label: "Homologación / ficha técnica", amount: input.homologation },
        { label: "Tasa DGT", amount: DGT_REGISTRATION_FEE },
        { label: "Placas", amount: input.plates },
        { label: "Gestoría", amount: input.agency },
        ...(input.other > 0 ? [{ label: "Otros", amount: input.other }] : []),
    ]

    const totalCost = round2(lines.reduce((sum, line) => sum + line.amount, 0))
    const margin = input.expectedSalePrice ? round2(input.expectedSalePrice - totalCost) : null
    const marginPercent = margin != null && totalCost > 0 ? (margin / totalCost) * 100 : null

    return { ageYears, depreciation, taxBase: round2(baseValue), taxRate, registrationTax, vat, lines, totalCost, margin, marginPercent }
}

function round2(value: number) {
    return Math.round(value * 100) / 100
}

export function formatEUR(value: number, maximumFractionDigits = 0) {
    return value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits })
}
