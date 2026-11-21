/**
 * Cálculo del coste real de importar un coche usado a España (península y Baleares).
 *
 * Impuesto Especial sobre Determinados Medios de Transporte (IEDMT, "impuesto de matriculación"):
 *   valor de mercado = valor de tablas de Hacienda × % por años de uso (Orden HAC/1501/2025, anexo IV, vigente en 2026)
 *   base imponible   = valor de mercado minorado en las cuotas de impuestos indirectos que lleva dentro, cuando el coche
 *                      ya estuvo matriculado en el extranjero (art. 5, regla segunda de esa orden):
 *                      BI = VM / (1 + tipoIVA + tipoIEDMT)
 *   tipo según emisiones de CO2 WLTP y comunidad autónoma.
 * Si no hay valor de tablas se usa el precio de compra como valor de mercado (sin depreciación ni minoración).
 * Los valores son orientativos. Canarias, Ceuta y Melilla tienen tipos propios y no están contemplados.
 *
 * Esta es la única fórmula de costes de la app: la usan la Calculadora, el Informe y el servidor MCP
 * (workers/nordrive-mcp), que la importa directamente. No dupliques la lógica en otro sitio.
 */

/** Porcentaje de valor que conserva el vehículo según años completos de uso (Orden HAC/1501/2025, anexo IV). */
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

/** IVA español aplicable desde septiembre de 2012 (para la minoración de la base) */
export const SPAIN_VAT_RATE = 0.21

export function depreciationPercent(ageYears: number): number {
    const row = DEPRECIATION_TABLE.find(r => ageYears < r.maxYears)
    return row ? row.percent : MIN_DEPRECIATION_PERCENT
}

/** Comunidades con tipos propios del IEDMT. "general" = tipos estatales (art. 70 Ley 38/1992). */
export type TaxRegion = "general" | "cataluna"

export const TAX_REGIONS: { id: TaxRegion; label: string }[] = [
    { id: "general", label: "General (tipos estatales)" },
    { id: "cataluna", label: "Cataluña" },
]

/**
 * Tipos por tramo de CO2: [≤120, 121–159, 160–199, ≥200] g/km.
 * Cataluña aplica el 16 % en el último tramo (dato facilitado por el usuario; revisar si cambia la ley autonómica).
 */
const REGION_RATES: Record<TaxRegion, [number, number, number, number]> = {
    general: [0, 4.75, 9.75, 14.75],
    cataluna: [0, 4.75, 9.75, 16],
}

/** Tipo del IEDMT en función de las emisiones de CO2 (g/km, WLTP) y la comunidad autónoma. */
export function registrationTaxRate(co2: number | null | undefined, region: TaxRegion = "general"): number {
    if (co2 == null || Number.isNaN(co2)) return 0
    const rates = REGION_RATES[region] ?? REGION_RATES.general
    if (co2 <= 120) return rates[0]
    if (co2 < 160) return rates[1]
    if (co2 < 200) return rates[2]
    return rates[3]
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

export type FixedImportCosts = typeof DEFAULT_IMPORT_COSTS

/** Ajustes guardados en company_settings (clave IMPORT_COSTS_SETTING_KEY): gastos fijos y comunidad por defecto */
export interface ImportCostSettings extends FixedImportCosts {
    region: TaxRegion
}

export const IMPORT_COSTS_SETTING_KEY = "import_costs"

export const DEFAULT_IMPORT_COST_SETTINGS: ImportCostSettings = { ...DEFAULT_IMPORT_COSTS, region: "general" }

/** Mezcla lo guardado en Supabase con los valores por defecto (tolera claves que falten o valores raros) */
export function normalizeImportCostSettings(value: unknown): ImportCostSettings {
    const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
    const pick = (key: keyof FixedImportCosts) => {
        const n = Number(raw[key])
        return Number.isFinite(n) && n >= 0 ? n : DEFAULT_IMPORT_COSTS[key]
    }
    const region = TAX_REGIONS.some(r => r.id === raw.region) ? (raw.region as TaxRegion) : "general"
    return {
        transport: pick("transport"),
        itv: pick("itv"),
        homologation: pick("homologation"),
        plates: pick("plates"),
        agency: pick("agency"),
        region,
    }
}

export interface ImportCostInput {
    /** Precio de compra del coche en EUR (IVA incluido si lo hay) */
    purchasePrice: number
    /** Valor de tablas de Hacienda para ese modelo nuevo; si falta se usa el precio de compra como base */
    fiscalValueNew?: number | null
    /** Fecha de primera matriculación (o año) */
    firstRegistration: Date
    co2?: number | null
    /** Comunidad autónoma donde se matricula (tipos del IEDMT). Por defecto, tipos estatales */
    region?: TaxRegion
    /**
     * Coche usado matriculado antes en el extranjero (lo normal en una importación): se minora la base
     * en las cuotas de impuestos indirectos (art. 5 regla 2ª Orden HAC/1501/2025). Por defecto, true.
     */
    foreignUsed?: boolean
    /** Pagar IVA en España (compra a profesional de un vehículo "nuevo" a efectos fiscales: <6 meses o <6.000 km) */
    payVat: boolean
    /**
     * Compra como empresa con IVA deducible: el coste es el precio neto (sin IVA) y el IVA español,
     * si lo hay, se autoliquida y se deduce, así que no suma al coste.
     */
    vatDeductible?: boolean
    /** Precio neto sin IVA (el "Netto" del anuncio). Solo se usa con vatDeductible */
    netPrice?: number | null
    /** Impuesto de matriculación ya conocido (p. ej. lo ha calculado Claude). Si se da, sustituye al calculado */
    registrationTaxOverride?: number | null
    transport: number
    itv: number
    homologation: number
    plates: number
    agency: number
    other: number
    /** Precio de venta esperado en España, para calcular el margen */
    expectedSalePrice?: number | null
    /** Fecha de referencia para la antigüedad (por defecto, hoy). Útil en tests */
    today?: Date
}

export interface ImportCostLine {
    label: string
    amount: number
    hint?: string
}

export interface ImportCostResult {
    ageYears: number
    depreciation: number
    /** Valor de mercado antes de la minoración */
    marketValue: number
    taxBase: number
    taxRate: number
    /** Impuesto que sale de la fórmula de la app */
    computedRegistrationTax: number
    /** Impuesto que se suma al coste (el sustituto si se dio, si no el calculado) */
    registrationTax: number
    registrationTaxOverridden: boolean
    vat: number
    /** Precio de compra que se usa como coste (neto si el IVA es deducible) */
    effectivePurchasePrice: number
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
    const region = input.region ?? "general"
    const ageYears = ageInYears(input.firstRegistration, input.today)
    const depreciation = depreciationPercent(ageYears)
    const taxRate = registrationTaxRate(input.co2, region)
    const fromTables = !!(input.fiscalValueNew && input.fiscalValueNew > 0)
    const marketValue = fromTables ? input.fiscalValueNew! * (depreciation / 100) : input.purchasePrice
    const reduce = fromTables && (input.foreignUsed ?? true)
    // La base se declara en euros enteros (como en el modelo 576)
    const taxBase = Math.round(reduce ? marketValue / (1 + SPAIN_VAT_RATE + taxRate / 100) : marketValue)
    const computedRegistrationTax = round2(taxBase * (taxRate / 100))
    const overridden = input.registrationTaxOverride != null && Number.isFinite(input.registrationTaxOverride) && input.registrationTaxOverride >= 0
    const registrationTax = overridden ? round2(input.registrationTaxOverride!) : computedRegistrationTax

    const deductible = !!input.vatDeductible && !!input.netPrice && input.netPrice > 0
    const effectivePurchasePrice = deductible ? input.netPrice! : input.purchasePrice
    const vat = input.payVat && !deductible ? round2(input.purchasePrice * SPAIN_VAT_RATE) : 0

    const taxHint = overridden
        ? `Importe indicado (la fórmula da ${formatEUR(computedRegistrationTax, 2)})`
        : taxRate === 0
            ? "Exento por emisiones ≤ 120 g/km"
            : `${taxRate}% sobre ${formatEUR(taxBase)}${reduce ? " (base minorada, art. 5.2 Orden HAC/1501/2025)" : ""}`

    const lines: ImportCostLine[] = [
        deductible
            ? { label: "Precio de compra (neto, IVA deducible)", amount: effectivePurchasePrice, hint: `PVP con IVA: ${formatEUR(input.purchasePrice)}` }
            : { label: "Precio de compra", amount: effectivePurchasePrice },
        ...(vat > 0 ? [{ label: "IVA en España (21%)", amount: vat }] : []),
        { label: "Impuesto de matriculación", amount: registrationTax, hint: taxHint },
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

    return {
        ageYears, depreciation, marketValue: round2(marketValue), taxBase, taxRate,
        computedRegistrationTax, registrationTax, registrationTaxOverridden: overridden,
        vat, effectivePurchasePrice, lines, totalCost, margin, marginPercent,
    }
}

function round2(value: number) {
    return Math.round(value * 100) / 100
}

export function formatEUR(value: number, maximumFractionDigits = 0) {
    return value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits })
}
