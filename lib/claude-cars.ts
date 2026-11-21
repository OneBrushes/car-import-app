/**
 * Coches guardados por Claude (tabla coches_claude) a través del servidor MCP (workers/nordrive-mcp).
 *
 * Este archivo NO importa el cliente de Supabase: lo comparten la app y el Worker de Cloudflare.
 * El coste y el beneficio salen siempre de calculateImportCost() (lib/import-costs.ts), la misma fórmula que la Calculadora.
 */
import {
    calculateImportCost,
    type ImportCostLine,
    type ImportCostSettings,
    type TaxRegion,
} from "./import-costs"

export const CLAUDE_CAR_STATES = ["nuevo", "interesante", "contactado", "descartado", "comprado"] as const
export type ClaudeCarState = (typeof CLAUDE_CAR_STATES)[number]

export const CLAUDE_CAR_STATE_LABELS: Record<ClaudeCarState, string> = {
    nuevo: "Nuevo",
    interesante: "Interesante",
    contactado: "Contactado",
    descartado: "Descartado",
    comprado: "Comprado",
}

/** Diferencia a partir de la cual se avisa de que el impuesto de Claude no cuadra con el de la app */
export const TAX_WARNING_THRESHOLD = 100

/** Campos que puede rellenar Claude (los mismos nombres que las columnas de coches_claude) */
export interface ClaudeCarFields {
    url: string
    marca?: string | null
    modelo?: string | null
    version?: string | null
    anio?: number | null
    mes_matriculacion?: number | null
    km?: number | null
    potencia_cv?: number | null
    combustible?: string | null
    precio_alemania?: number | null
    precio_neto?: number | null
    iva_deducible?: boolean | null
    tipo_vendedor?: "particular" | "concesionario" | null
    nombre_vendedor?: string | null
    valoracion_vendedor?: number | null
    unfallfrei?: boolean | null
    duenos?: number | null
    co2?: number | null
    valor_hacienda?: number | null
    impuesto_matriculacion?: number | null
    precio_venta_estimado_espana?: number | null
    transporte?: number | null
    itv?: number | null
    homologacion?: number | null
    placas?: number | null
    gestoria?: number | null
    foto_url?: string | null
    notas?: string | null
}

/** Columnas calculadas que se guardan junto al coche */
export interface ClaudeCarCalc {
    coste_total_espana: number
    beneficio: number | null
    margen_pct: number | null
    impuesto_calculado: number
    aviso_impuesto: string | null
    desglose: {
        lines: ImportCostLine[]
        region: TaxRegion
        paga_iva_espana: boolean
        base_imponible: number
        tipo_iedmt: number
        depreciacion: number
        antiguedad_anios: number
        impuesto_aplicado: "claude" | "app"
    }
}

export interface ClaudeCar extends ClaudeCarFields, ClaudeCarCalc {
    id: string
    user_id: string
    estado: ClaudeCarState
    movido_a: string | null
    created_at: string
    updated_at: string
}

/**
 * IVA en España al importar desde la UE: solo si el coche es "nuevo" a efectos de IVA
 * (menos de 6 meses desde la primera matriculación o menos de 6.000 km). Art. 13 Ley 37/1992.
 */
export function isNewForVat(firstRegistration: Date, km: number | null | undefined, today = new Date()): boolean {
    const sixMonthsLater = new Date(firstRegistration)
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)
    return today < sixMonthsLater || (km != null && km < 6000)
}

/** Calcula coste en España, beneficio y desglose con la fórmula única de la app */
export function computeClaudeCar(car: ClaudeCarFields, settings: ImportCostSettings, today = new Date()): ClaudeCarCalc {
    const year = car.anio || today.getFullYear()
    const month = Math.min(12, Math.max(1, car.mes_matriculacion || 1))
    const firstRegistration = new Date(year, month - 1, 1)
    const payVat = isNewForVat(firstRegistration, car.km, today)
    const pick = (value: number | null | undefined, fallback: number) => (value != null && Number.isFinite(value) && value >= 0 ? value : fallback)

    const result = calculateImportCost({
        purchasePrice: car.precio_alemania || 0,
        netPrice: car.precio_neto ?? null,
        vatDeductible: !!car.iva_deducible,
        fiscalValueNew: car.valor_hacienda ?? null,
        firstRegistration,
        co2: car.co2 ?? null,
        region: settings.region,
        foreignUsed: true,
        payVat,
        registrationTaxOverride: car.impuesto_matriculacion ?? null,
        transport: pick(car.transporte, settings.transport),
        itv: pick(car.itv, settings.itv),
        homologation: pick(car.homologacion, settings.homologation),
        plates: pick(car.placas, settings.plates),
        agency: pick(car.gestoria, settings.agency),
        other: 0,
        expectedSalePrice: car.precio_venta_estimado_espana ?? null,
        today,
    })

    let aviso: string | null = null
    if (result.registrationTaxOverridden) {
        const diff = Math.abs(result.registrationTax - result.computedRegistrationTax)
        if (diff > TAX_WARNING_THRESHOLD) {
            aviso = `El impuesto de Claude (${eur(result.registrationTax)}) difiere ${eur(diff)} del calculado por la app (${eur(result.computedRegistrationTax)})`
                + (car.valor_hacienda ? "" : ". La app no tiene el valor de Hacienda y usa el precio de compra como base")
        }
    }

    return {
        coste_total_espana: result.totalCost,
        beneficio: result.margin,
        margen_pct: result.marginPercent != null ? Math.round(result.marginPercent * 10) / 10 : null,
        impuesto_calculado: result.computedRegistrationTax,
        aviso_impuesto: aviso,
        desglose: {
            lines: result.lines,
            region: settings.region,
            paga_iva_espana: payVat && !car.iva_deducible,
            base_imponible: result.taxBase,
            tipo_iedmt: result.taxRate,
            depreciacion: result.depreciation,
            antiguedad_anios: result.ageYears,
            impuesto_aplicado: result.registrationTaxOverridden ? "claude" : "app",
        },
    }
}

/** Normaliza la URL del anuncio para detectar duplicados (sin fragmento ni barra final, host en minúsculas) */
export function normalizeListingUrl(raw: string): string {
    const trimmed = raw.trim()
    try {
        const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
        u.hash = ""
        u.hostname = u.hostname.toLowerCase()
        return u.toString().replace(/\/$/, "")
    } catch {
        return trimmed
    }
}

const FUEL_MAP: Record<string, string> = {
    gasolina: "Gasolina", benzin: "Gasolina", petrol: "Gasolina",
    diesel: "Diésel", "diésel": "Diésel",
    hibrido: "Híbrido", "híbrido": "Híbrido", hybrid: "Híbrido",
    electrico: "Eléctrico", "eléctrico": "Eléctrico", elektro: "Eléctrico", electric: "Eléctrico",
    gas: "Gas", glp: "Gas", gnc: "Gas",
}

/** Fila para imported_cars ("Mover a mis coches"), con el desglose como gastos para que el precio final cuadre */
export function claudeCarToImportedCar(car: ClaudeCar) {
    const purchase = car.desglose?.lines?.[0]?.amount ?? car.precio_alemania ?? 0
    const expenses = (car.desglose?.lines ?? []).slice(1)
        .filter(line => line.amount > 0)
        .map(line => ({ id: randomId(), type: expenseType(line.label), amount: line.amount, description: line.label }))
    const seller = [
        car.tipo_vendedor ? (car.tipo_vendedor === "concesionario" ? "Concesionario" : "Particular") : null,
        car.nombre_vendedor,
        car.valoracion_vendedor != null ? `valoración ${car.valoracion_vendedor}` : null,
    ].filter(Boolean).join(" · ")
    const notes = [
        car.version ? `Versión: ${car.version}` : null,
        seller ? `Vendedor: ${seller}` : null,
        car.unfallfrei != null ? (car.unfallfrei ? "Sin accidentes (unfallfrei)" : "Con accidente declarado") : null,
        car.duenos != null ? `Dueños: ${car.duenos}` : null,
        car.precio_venta_estimado_espana ? `Venta estimada en España: ${eur(car.precio_venta_estimado_espana)}` : null,
        car.notas ? `Notas de Claude: ${car.notas}` : null,
    ].filter(Boolean).join("\n")
    const fuel = car.combustible ? FUEL_MAP[car.combustible.trim().toLowerCase()] ?? car.combustible : null

    return {
        brand: car.marca || "",
        model: [car.modelo, car.version].filter(Boolean).join(" ") || "",
        year: car.anio ?? null,
        month: car.mes_matriculacion ?? null,
        url: car.url,
        origin: "Alemania",
        platform: platformFromUrl(car.url),
        price: purchase,
        mileage: car.km ?? null,
        cv: car.potencia_cv ?? null,
        co2: car.co2 ?? null,
        fuel_type: fuel,
        total_cost: car.coste_total_espana,
        expenses,
        registration_tax: car.desglose?.lines?.find(l => l.label === "Impuesto de matriculación")?.amount ?? 0,
        shipping_cost: car.desglose?.lines?.find(l => l.label === "Transporte")?.amount ?? 0,
        image_url: car.foto_url || null,
        images: car.foto_url ? [car.foto_url] : [],
        notes: notes || null,
        tags: ["Claude"],
        contacted: car.estado === "contactado",
    }
}

function expenseType(label: string): string {
    if (label.startsWith("Impuesto de matriculación")) return "Matriculación"
    if (label.startsWith("IVA")) return "Importación"
    if (label === "Tasa DGT") return "DGT"
    if (label.startsWith("ITV")) return "ITV"
    if (label === "Placas") return "Matrículas"
    return "Otro"
}

function platformFromUrl(url: string): string | null {
    const host = (() => { try { return new URL(url).hostname } catch { return "" } })()
    if (host.includes("mobile.de")) return "mobile.de"
    if (host.includes("autoscout24")) return "AutoScout24"
    return host || null
}

function randomId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

function eur(value: number) {
    return value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
}
