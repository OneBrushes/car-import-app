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

export const CLAUDE_CAR_STATES = ["candidato", "nuevo", "interesante", "contactado", "descartado", "comprado", "retirado"] as const
export type ClaudeCarState = (typeof CLAUDE_CAR_STATES)[number]

export const CLAUDE_CAR_STATE_LABELS: Record<ClaudeCarState, string> = {
    candidato: "Candidato",
    nuevo: "Nuevo",
    interesante: "Interesante",
    contactado: "Contactado",
    descartado: "Descartado",
    comprado: "Comprado",
    retirado: "Vendido / retirado",
}

/** Estados que ya no son coches "vivos" (no cuentan como activos ni se siguen) */
export const isClosedClaudeCar = (estado: string | null | undefined) => estado === "descartado" || estado === "retirado"

/** Facilidad de venta en España: 1 = fácil … 5 = difícil (2 y 4 son los términos medios) */
export const SALE_EASE_LEVELS = [1, 2, 3, 4, 5] as const
export type SaleEase = (typeof SALE_EASE_LEVELS)[number]
export const SALE_EASE_LABELS: Record<SaleEase, string> = {
    1: "Fácil de vender",
    2: "Bastante fácil",
    3: "Venta media",
    4: "Bastante difícil",
    5: "Difícil de vender",
}
export const saleEaseLabel = (n: number | null | undefined) =>
    n != null && n >= 1 && n <= 5 ? SALE_EASE_LABELS[Math.round(n) as SaleEase] : null

/** Filtros por rangos de la pestaña "Guardados por Claude" (todos a la vez; vacío = sin filtro) */
export interface CarRangeFilters {
    precioMin?: number | null
    precioMax?: number | null
    costeMax?: number | null
    kmMin?: number | null
    kmMax?: number | null
    anioMin?: number | null
    anioMax?: number | null
    beneficioMin?: number | null
    marcas?: string[]
}

const isSet = (n: number | null | undefined): n is number => n != null && Number.isFinite(n)

/** Cuántos filtros hay puestos */
export function activeFilterCount(f: CarRangeFilters): number {
    return [f.precioMin, f.precioMax, f.costeMax, f.kmMin, f.kmMax, f.anioMin, f.anioMax, f.beneficioMin].filter(isSet).length + (f.marcas?.length ? 1 : 0)
}

/** ¿Cumple el coche todos los filtros? Si un filtro está puesto y al coche le falta ese dato, no lo cumple */
export function matchesCarFilters(car: Partial<ClaudeCar>, f: CarRangeFilters): boolean {
    const inRange = (v: number | null | undefined, min?: number | null, max?: number | null) => {
        if (!isSet(min) && !isSet(max)) return true
        if (v == null || !Number.isFinite(v)) return false
        return (!isSet(min) || v >= min) && (!isSet(max) || v <= max)
    }
    if (!inRange(car.precio_alemania, f.precioMin, f.precioMax)) return false
    if (!inRange(car.coste_total_espana, null, f.costeMax)) return false
    if (!inRange(car.km, f.kmMin, f.kmMax)) return false
    if (!inRange(car.anio, f.anioMin, f.anioMax)) return false
    if (!inRange(car.beneficio, f.beneficioMin, null)) return false
    if (f.marcas?.length && !f.marcas.some(m => m.toLowerCase() === (car.marca ?? "").toLowerCase())) return false
    return true
}

/** A dónde se trae el coche (base de NorDrive) */
export const TRAVEL_DESTINATION = "Sant Cugat"

/** Transporte cuando se va a buscar el coche conduciendo: ruta (gasolina + peajes) + extras. null si no hay coste de ruta */
export function travelTransport(car: Pick<ClaudeCarFields, "viaje_coste_ruta" | "viaje_extras">): number | null {
    if (car.viaje_coste_ruta == null || !Number.isFinite(car.viaje_coste_ruta)) return null
    return Math.round((car.viaje_coste_ruta + (car.viaje_extras ?? 0)) * 100) / 100
}

/** 13.1667 → "13 h 10 min" */
export function formatTravelHours(h: number | null | undefined): string | null {
    if (h == null || !Number.isFinite(h) || h <= 0) return null
    const total = Math.round(h * 60)
    const hh = Math.floor(total / 60), mm = total % 60
    return hh ? (mm ? `${hh} h ${mm} min` : `${hh} h`) : `${mm} min`
}

/** Máximo de fotos por coche */
export const MAX_CLAUDE_PHOTOS = 30

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
    /** Foto principal (la primera de fotos) */
    foto_url?: string | null
    /** Todas las fotos (máx. MAX_CLAUDE_PHOTOS), ya copiadas a Supabase Storage */
    fotos?: string[] | null
    /** Encuadre vertical de la foto principal en la tarjeta (0 = arriba, 100 = abajo) */
    foto_posicion_y?: number | null
    /** De dónde sale valor_hacienda: lo dio Claude o la app lo buscó en valores_hacienda (lib/hacienda.ts) */
    valor_hacienda_origen?: "claude" | "tabla" | null
    /** Versión del BOE de la que sale valor_hacienda cuando lo busca la app */
    valor_hacienda_version?: string | null
    /** Había varias versiones posibles en las tablas de Hacienda: comprobar que es la buena */
    verificar_version?: boolean | null
    /** Revisión diaria del anuncio (lib/listing-check.ts) */
    anuncio_estado?: "activo" | "retirado" | "no_comprobado" | null
    anuncio_ultima_comprobacion?: string | null
    anuncio_fallos_seguidos?: number | null
    precio_actual?: number | null
    precio_bajado?: boolean | null
    /** Cuándo pasó a "Vendido / retirado" (2.ª revisión seguida con el anuncio retirado) */
    retirado_en?: string | null
    /** Viaje para traer el coche conduciendo (si hay coste de ruta, el transporte = ruta + extras) */
    viaje_ciudad_origen?: string | null
    viaje_km?: number | null
    viaje_horas?: number | null
    /** Gasolina + peajes (ViaMichelin) */
    viaje_coste_ruta?: number | null
    /** Vuelo + hotel + comidas + placas de exportación */
    viaje_extras?: number | null
    viaje_detalle?: string | null
    /** Facilidad de venta en España (1 = fácil … 5 = difícil) */
    facilidad_venta?: number | null
    /** Por qué se vende fácil o difícil (demanda, color, cambio manual, precio de mercado…) */
    facilidad_venta_motivo?: string | null
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
    /** Mensajes con el vendedor (contactos_claude), del más antiguo al más reciente */
    contactos?: ClaudeContact[]
    /** Fecha del último mensaje, enviado o recibido */
    ultimo_contacto?: string | null
}

// --- Historial de contactos con el vendedor (tabla contactos_claude) -----------------------------------------------------

export const CONTACT_CHANNELS = ["mobile.de", "autoscout24", "email", "whatsapp", "telefono", "otro"] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]
export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
    "mobile.de": "mobile.de", autoscout24: "AutoScout24", email: "Email", whatsapp: "WhatsApp", telefono: "Teléfono", otro: "Otro",
}
export const CONTACT_DIRECTIONS = ["enviado", "recibido"] as const
export type ContactDirection = (typeof CONTACT_DIRECTIONS)[number]
export const CONTACT_SENDERS = ["claude", "usuario"] as const
export type ContactSender = (typeof CONTACT_SENDERS)[number]

export interface ClaudeContact {
    id: string
    coche_id: string
    fecha: string
    canal: ContactChannel
    direccion: ContactDirection
    asunto: string | null
    mensaje: string
    enviado_por: ContactSender
    notas: string | null
    created_at?: string
}

/** Días sin respuesta a partir de los que conviene insistir */
export const NO_REPLY_DAYS = 3

const DAY_MS = 86_400_000

export function sortContacts(contacts: ClaudeContact[] | null | undefined): ClaudeContact[] {
    return [...(contacts ?? [])].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
}

/** Añade al coche sus contactos ordenados y la fecha del último */
export function withContacts<T extends { id: string }>(car: T, contacts: ClaudeContact[]): T & { contactos: ClaudeContact[]; ultimo_contacto: string | null } {
    const contactos = sortContacts(contacts.filter(c => c.coche_id === car.id))
    return { ...car, contactos, ultimo_contacto: contactos.at(-1)?.fecha ?? null }
}

/** Días completos desde una fecha */
export function daysSince(date: string, now = new Date()): number {
    return Math.max(0, Math.floor((now.getTime() - Date.parse(date)) / DAY_MS))
}

/**
 * Si el último mensaje es nuestro y el vendedor no ha contestado después, desde cuándo se espera respuesta.
 * null si no hay mensajes o el último es del vendedor.
 */
export function awaitingReplySince(contacts: ClaudeContact[] | null | undefined): string | null {
    const last = sortContacts(contacts).at(-1)
    return last && last.direccion === "enviado" ? last.fecha : null
}

/** Sin respuesta desde hace más de NO_REPLY_DAYS días: a quién insistir */
export function needsFollowUp(contacts: ClaudeContact[] | null | undefined, now = new Date()): boolean {
    const since = awaitingReplySince(contacts)
    return since != null && now.getTime() - Date.parse(since) > NO_REPLY_DAYS * DAY_MS
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
        transport: pick(travelTransport(car) ?? car.transporte, settings.transport),
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
        saleEaseLabel(car.facilidad_venta) ? `Facilidad de venta: ${saleEaseLabel(car.facilidad_venta)} (${car.facilidad_venta}/5)${car.facilidad_venta_motivo ? ` — ${car.facilidad_venta_motivo}` : ""}` : null,
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
        image_url: car.foto_url || car.fotos?.[0] || null,
        images: car.fotos?.length ? car.fotos : car.foto_url ? [car.foto_url] : [],
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

// --- Fotos de la tarjeta y del visor ---------------------------------------------------------------------------------

/**
 * Fotos que enseñan la tarjeta y el visor: siempre el array `fotos` (todas, en orden); si está vacío, foto_url.
 * `main` es la que sale en la tarjeta y `startIndex` dónde se abre el visor.
 */
export function carPhotoList(car: Pick<ClaudeCarFields, "foto_url" | "fotos">): { photos: string[]; main: string | null; startIndex: number } {
    const photos = (car.fotos ?? []).filter(u => typeof u === "string" && u.trim().length > 0)
    if (!photos.length && car.foto_url) photos.push(car.foto_url)
    const main = car.foto_url && photos.includes(car.foto_url) ? car.foto_url : photos[0] ?? null
    return { photos, main, startIndex: main ? Math.max(0, photos.indexOf(main)) : 0 }
}
