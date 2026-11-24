/**
 * Revisión diaria de anuncios (coches_claude): ¿sigue el anuncio publicado? ¿ha bajado de precio?
 * Clasifica lo que devuelve el portal; no hace peticiones (las hace el Worker: workers/nordrive-mcp/src/revision.ts).
 *
 *  · retirado      → el portal dice que ya no está (404/410, redirige al buscador, "nicht mehr verfügbar"…)
 *  · activo        → la ficha del coche está ahí (se intenta leer el precio)
 *  · no_comprobado → no se ha podido saber (403/429/captcha, 5xx, timeout, página rara). Nunca descarta un coche.
 */
import { computeClaudeCar, type ClaudeCar, type ClaudeCarFields } from "./claude-cars"
import type { ImportCostSettings } from "./import-costs"

export type ListingState = "activo" | "retirado" | "no_comprobado"
export const LISTING_STATES: ListingState[] = ["activo", "retirado", "no_comprobado"]

export interface ListingFetch {
    /** null = no hubo respuesta (timeout, error de red) */
    status: number | null
    /** URL final tras las redirecciones seguidas */
    finalUrl: string
    /** Redirecciones por las que ha pasado (para detectar "manda al buscador") */
    redirects: string[]
    html?: string | null
    error?: string | null
}

export interface ListingCheck {
    resultado: ListingState
    http_status: number | null
    precio: number | null
    motivo: string
}

export type Portal = "autoscout24" | "mobile.de"

export function listingPortal(url: string): Portal | null {
    try {
        const host = new URL(url).hostname
        if (/(^|\.)autoscout24\.[a-z.]+$/.test(host)) return "autoscout24"
        if (/(^|\.)mobile\.de$/.test(host)) return "mobile.de"
    } catch { /* URL no válida */ }
    return null
}

/**
 * Aviso de "ya no está" VISIBLE en la página (texto entre etiquetas, no dentro de un JSON): AutoScout24 trae en todas sus
 * páginas las traducciones de la página de retirado ("detailpage.gonePage.title": "…nicht mehr verfügbar"), así que buscar
 * el texto suelto da falsos positivos.
 */
const GONE_VISIBLE = />\s*[^<"]{0,80}(nicht mehr verf(ü|ue|&uuml;)gbar|nicht gefunden|nicht mehr online|bereits verkauft|no longer available)/i
const BLOCK_TEXT = /captcha|access denied|zugriff verweigert|ungew(ö|oe)hnliche aktivit|unusual traffic|are you a robot|bot protection|px-captcha|_Incapsula_|cf-chl/i

/** Número de un precio: "27.900", "27900", 27900.0 → 27900 */
function toPrice(raw: string | undefined | null): number | null {
    if (!raw) return null
    const n = Number(String(raw).replace(/[^\d.,]/g, "").replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."))
    return Number.isFinite(n) && n >= 500 && n < 5_000_000 ? Math.round(n) : null
}

const firstMatch = (text: string, patterns: RegExp[]) => {
    for (const re of patterns) { const m = re.exec(text); if (m) { const p = toPrice(m[1]); if (p) return p } }
    return null
}

/** Precio de una ficha de AutoScout24: está en __NEXT_DATA__ → listingDetails → price */
export function autoscoutPrice(html: string): number | null {
    const at = html.indexOf('"listingDetails"')
    const scope = at >= 0 ? html.slice(at, at + 60_000) : html
    return firstMatch(scope, [
        // listingDetails.prices.public.priceRaw (el precio publicado)
        /"prices"\s*:\s*\{\s*"public"\s*:\s*\{[^{}]*?"priceRaw"\s*:\s*(\d+)/,
        /"priceRaw"\s*:\s*(\d+)/,
        /"price"\s*:\s*\{\s*"value"\s*:\s*\{\s*"raw"\s*:\s*(\d+)/,
        /"price"\s*:\s*\{[^{}]*?"(?:value|amount|raw)"\s*:\s*"?(\d+)/,
        /"priceFormatted"\s*:\s*"[^"\d]*([\d.,]+)/,
        /"price"\s*:\s*"?(\d{3,7})"?\s*[,}]/,
    ]) ?? firstMatch(html, [/"price"\s*:\s*"?(\d{3,7}(?:\.\d+)?)"?\s*,\s*"priceCurrency"\s*:\s*"EUR"/, /"priceCurrency"\s*:\s*"EUR"\s*,\s*"price"\s*:\s*"?(\d{3,7})/])
}

/** Precio de una ficha de mobile.de (JSON de la página o JSON-LD) */
export function mobilePrice(html: string): number | null {
    return firstMatch(html, [
        /"price"\s*:\s*\{[^{}]*?"grossAmount"\s*:\s*(\d+)/,
        /"grossAmount"\s*:\s*(\d+)/,
        /"price"\s*:\s*\{[^{}]*?"gross"\s*:\s*"([\d.,]+)/,
        /"amount"\s*:\s*(\d+)\s*,\s*"currency"\s*:\s*"EUR"/,
        /"price"\s*:\s*"?(\d{3,7}(?:\.\d+)?)"?\s*,\s*"priceCurrency"\s*:\s*"EUR"/,
        /"priceCurrency"\s*:\s*"EUR"\s*,\s*"price"\s*:\s*"?(\d{3,7})/,
        /data-testid="prime-price"[^>]*>[^<\d]*([\d.]+)/,
    ])
}

/** Clasifica la respuesta del portal */
export function classifyListing(url: string, f: ListingFetch): ListingCheck {
    const portal = listingPortal(url)
    const status = f.status
    const html = f.html ?? ""
    const res = (resultado: ListingState, motivo: string, precio: number | null = null): ListingCheck => ({ resultado, http_status: status, precio, motivo })

    if (status == null) return res("no_comprobado", `sin respuesta (${f.error ?? "error de red"})`)
    if (status >= 500) return res("no_comprobado", `error del portal (HTTP ${status})`)
    if (status === 403 || status === 429) return res("no_comprobado", `el portal bloquea la consulta (HTTP ${status})`)
    if (status === 404 || status === 410) return res("retirado", `HTTP ${status}: el anuncio no existe`)

    const hops = [...f.redirects, f.finalUrl]
    if (portal === "autoscout24" && hops.some(u => /\/lst(\/|\?|$)/.test(safePath(u)))) return res("retirado", "redirige al buscador (/lst/)")
    if (portal === "mobile.de" && hops.some(u => /search\.html|\/fahrzeuge\/search/.test(u))) return res("retirado", "redirige al buscador (search.html)")
    if (status >= 300 && status < 400) return res("no_comprobado", `redirección sin seguir (HTTP ${status})`)
    if (status !== 200) return res("no_comprobado", `respuesta inesperada (HTTP ${status})`)

    if (BLOCK_TEXT.test(html.slice(0, 200_000)) && !/__NEXT_DATA__/.test(html)) return res("no_comprobado", "página de captcha o bloqueo")
    if (portal === "autoscout24") {
        // El estado del anuncio viene en los datos de la página: "status":"Active" (o "ACTIVE" en Smyle)
        const st = /"status"\s*:\s*"([A-Za-z_]+)"/.exec(html)?.[1]?.toLowerCase()
        if (st && /^(inactive|expired|deleted|sold|gone|archived|removed|deactivated)$/.test(st)) return res("retirado", `la ficha está "${st}"`)
        if (GONE_VISIBLE.test(html)) return res("retirado", "la página dice que el anuncio ya no está disponible")
        // Ficha normal (/angebote/): si __NEXT_DATA__ no trae listingDetails, el anuncio ya no existe (Smyle tiene otro formato)
        if (html.includes("__NEXT_DATA__") && !/\/smyle\//.test(url) && !html.includes('"listingDetails"')) return res("retirado", "la ficha no trae listingDetails")
        if (!html.includes("__NEXT_DATA__") || st !== "active") return res("no_comprobado", st ? `estado desconocido ("${st}")` : "200 sin la ficha (__NEXT_DATA__)")
        const precio = autoscoutPrice(html)
        return res("activo", precio ? "ficha publicada" : "ficha publicada (precio no encontrado)", precio)
    }
    if (GONE_VISIBLE.test(html)) return res("retirado", "la página dice que el anuncio ya no está disponible")
    if (portal === "mobile.de") {
        const isAd = /"adId"|details\.html\?id=|data-testid="vip-|"@type"\s*:\s*"(Car|Vehicle|Product)"|og:title/.test(html)
        if (!isAd) return res("no_comprobado", "200 sin la ficha del coche")
        const precio = mobilePrice(html)
        return res("activo", precio ? "ficha publicada" : "ficha publicada (precio no encontrado)", precio)
    }
    return res("no_comprobado", "portal no soportado")
}

function safePath(u: string) {
    try { return new URL(u).pathname } catch { return u }
}

/** Precio que se tiene en cuenta como bajada (por debajo del guardado, con 1 € de margen) */
export const isPriceDrop = (actual: number | null | undefined, guardado: number | null | undefined) =>
    !!actual && !!guardado && actual < guardado - 1

/** Fallos seguidos (retirado) a partir de los que el coche pasa a "retirado" (Vendido / retirado) */
export const RETIRED_STRIKES = 2

/**
 * Coches que la migración 2026-11_estado_retirado.sql pasa de "descartado" a "retirado" (misma regla que el SQL):
 * descartados con anuncio_estado = retirado, notas que empiezan por "❌ Anuncio retirado" o "retirado",
 * o con la nota que añadía la revisión diaria.
 */
export function isRetiredDiscard(car: { estado?: string | null; notas?: string | null; anuncio_estado?: string | null }): boolean {
    if (car.estado !== "descartado") return false
    if (car.anuncio_estado === "retirado") return true
    const notas = (car.notas ?? "").trim().toLowerCase()
    return notas.startsWith("❌ anuncio retirado") || notas.startsWith("retirado") || notas.includes("anuncio retirado o vendido (detectado el ")
}

/** Estados del coche que se revisan cada día */
export const REVIEWED_CAR_STATES = ["nuevo", "interesante", "contactado"] as const

/** Fecha de hoy en Madrid (YYYY-MM-DD) */
export function madridDate(d = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

/** Hora de Madrid (0–23) */
export function madridHour(d = new Date()): number {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(d))
}

/** DD/MM/AAAA en Madrid */
export function madridDateEs(d = new Date()): string {
    return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
}

// --- Tandas: qué coches revisa cada ejecución -------------------------------------------------------------------------

/** ¿Se comprobó el anuncio hoy (día de Madrid)? */
export function reviewedToday(lastCheck: string | null | undefined, now = new Date()): boolean {
    if (!lastCheck) return false
    const d = new Date(lastCheck)
    return !Number.isNaN(d.getTime()) && madridDate(d) === madridDate(now)
}

type PriorityCar = { estado?: string | null; beneficio?: number | null; anuncio_ultima_comprobacion?: string | null }

/** Orden de revisión: 'contactado' primero, luego más beneficio, luego la comprobación más antigua (nunca comprobado = la más antigua) */
export function compareReviewPriority(a: PriorityCar, b: PriorityCar): number {
    const c = Number(b.estado === "contactado") - Number(a.estado === "contactado")
    if (c) return c
    const ba = a.beneficio ?? -Infinity, bb = b.beneficio ?? -Infinity
    if (ba !== bb) return bb > ba ? 1 : -1
    const ta = a.anuncio_ultima_comprobacion ? Date.parse(a.anuncio_ultima_comprobacion) : 0
    const tb = b.anuncio_ultima_comprobacion ? Date.parse(b.anuncio_ultima_comprobacion) : 0
    return ta - tb
}

/**
 * Siguiente tanda del Worker: coches en estados revisables, NO de mobile.de (los revisa el script del PC),
 * sin comprobar hoy, por prioridad, como mucho n. Lo ya revisado hoy hace de cursor: cada ejecución coge los siguientes.
 */
export function nextWorkerBatch<T extends PriorityCar & { url: string }>(cars: T[], n: number, now = new Date()): T[] {
    return cars
        .filter(c => (REVIEWED_CAR_STATES as readonly string[]).includes(c.estado ?? "") && listingPortal(c.url) !== "mobile.de" && !reviewedToday(c.anuncio_ultima_comprobacion, now))
        .sort(compareReviewPriority)
        .slice(0, n)
}

// --- Resumen por día (tabla revisiones, herramienta resumen_revision) ----------------------------------------------------

/** worker = servidor (cron) · local = script del PC de casa · manual = revisión hecha por Claude con el navegador (marcar_anuncios) */
export type RevisionOrigin = "worker" | "local" | "manual"

export interface RevisionRow {
    fecha: string
    origen: RevisionOrigin
    inicio?: string | null
    revisados: number
    activos: number
    retirados: number
    cambios_precio: number
    errores: number
    completa: boolean
    detalle?: Record<string, unknown> | null
}

export interface RevisionDay {
    fecha: string
    origenes: Partial<Record<RevisionOrigin, { ejecuciones: number; revisados: number; activos: number; retirados: number; cambios_precio: number; errores: number; completa: boolean; motivo: string | null }>>
}

/** Suma las filas de revisiones por día y origen (el Worker apunta una fila por tanda; el PC, una por pasada) */
export function summarizeRevisionDays(rows: RevisionRow[]): RevisionDay[] {
    const days = new Map<string, RevisionDay>()
    for (const r of rows) {
        const day = days.get(r.fecha) ?? { fecha: r.fecha, origenes: {} }
        days.set(r.fecha, day)
        const o = day.origenes[r.origen] ?? { ejecuciones: 0, revisados: 0, activos: 0, retirados: 0, cambios_precio: 0, errores: 0, completa: false, motivo: null }
        o.ejecuciones++
        o.revisados += r.revisados; o.activos += r.activos; o.retirados += r.retirados; o.cambios_precio += r.cambios_precio; o.errores += r.errores
        o.completa = o.completa || r.completa
        if (!r.completa && typeof r.detalle?.motivo === "string") o.motivo = r.detalle.motivo
        day.origenes[r.origen] = o
    }
    return [...days.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export function revisionDayText(d: RevisionDay): string {
    const part = (name: string, o: RevisionDay["origenes"]["worker"]) => !o ? `${name}: sin revisión` :
        `${name}: ${o.revisados} revisados · ${o.activos} activos · ${o.retirados} retirados · ${o.cambios_precio} cambios de precio · ${o.errores} errores` +
        (o.completa ? " · completa" : ` · INCOMPLETA${o.motivo ? ` (${o.motivo})` : ""}`)
    return `${d.fecha} — ${part("Servidor", d.origenes.worker)} | ${part("PC de casa (mobile.de)", d.origenes.local)}` +
        (d.origenes.manual ? ` | ${part("Manual (Claude con el navegador)", d.origenes.manual)}` : "")
}

// --- mobile.de desde el PC de casa (tools/revision-mobile) -------------------------------------------------------------

/** id del anuncio de mobile.de (?id=123 o /123.html) */
export function mobileAdId(url: string): string | null {
    try {
        const u = new URL(url)
        const q = u.searchParams.get("id")
        if (q && /^\d+$/.test(q)) return q
        return /\/(\d{6,})(?:\.html)?(?:$|[/?#])/.exec(u.pathname)?.[1] ?? null
    } catch { return null }
}

/** "BMW X3 M40i für 28.790 € kaufen" → 28790 */
export function mobileTitlePrice(title: string | null | undefined): number | null {
    const m = /f(?:ü|ue|&uuml;)r\s*([\d.,\s  ]+?)\s*(?:€|&euro;|EUR)/i.exec(title ?? "")
    return m ? toPrice(m[1].replace(/[\s  ]/g, "")) : null
}

/** Lo que devuelve el fetch hecho dentro de la página de mobile.de */
export interface MobileQuickFetch {
    status: number
    /** URL final (fetch sigue las redirecciones) */
    url?: string | null
    title?: string | null
    /** La página dice "nicht mehr verfügbar" (o parecido) */
    gone?: boolean
    /** Captcha o página de bloqueo */
    blocked?: boolean
}

export type MobileQuickResult = (ListingCheck & { bloqueado: false }) | { bloqueado: true; http_status: number; motivo: string }

/**
 * Clasifica una ficha de mobile.de pedida desde el navegador de casa.
 *  · 403/429 o captcha → bloqueado: NO se marca nada (el script espera y reintenta más despacio)
 *  · 404/410, "nicht mehr verfügbar" o redirige al buscador → retirado
 *  · <title> con "für X €" → activo con precio X
 */
export function classifyMobileQuick(f: MobileQuickFetch): MobileQuickResult {
    const blocked = (motivo: string) => ({ bloqueado: true as const, http_status: f.status, motivo })
    const res = (resultado: ListingState, motivo: string, precio: number | null = null) => ({ bloqueado: false as const, resultado, http_status: f.status, precio, motivo })
    if (f.status === 403 || f.status === 429) return blocked(`HTTP ${f.status}`)
    if (f.status === 404 || f.status === 410) return res("retirado", `HTTP ${f.status}: el anuncio no existe`)
    if (f.url && /search\.html|\/fahrzeuge\/search/.test(f.url)) return res("retirado", "redirige al buscador")
    if (f.status >= 500) return res("no_comprobado", `error del portal (HTTP ${f.status})`)
    if (f.status !== 200) return res("no_comprobado", `respuesta inesperada (HTTP ${f.status})`)
    // El título con precio manda: los textos sueltos de la página (scripts, traducciones) pueden dar falsos avisos
    const precio = mobileTitlePrice(f.title)
    if (precio) return res("activo", "ficha publicada", precio)
    if (f.blocked) return blocked("captcha o página de bloqueo")
    if (f.gone) return res("retirado", "la página dice que el anuncio ya no está disponible")
    return res("no_comprobado", `título sin precio ("${(f.title ?? "").slice(0, 80)}")`)
}

/**
 * Qué hacer tras un bloqueo (403/captcha) de mobile.de: esperar 5 min y seguir más despacio; al 3.er bloqueo seguido, abortar.
 * `bloqueos` = bloqueos seguidos contando el de ahora.
 */
export const MOBILE_BLOCK_WAIT_MS = 5 * 60_000
export const MOBILE_MAX_BLOCKS = 3
export function mobileBlockAction(bloqueos: number): { accion: "esperar"; esperaMs: number; ritmo: number } | { accion: "abortar" } {
    if (bloqueos >= MOBILE_MAX_BLOCKS) return { accion: "abortar" }
    return { accion: "esperar", esperaMs: MOBILE_BLOCK_WAIT_MS * bloqueos, ritmo: 2 ** bloqueos }
}

/** Pausa entre anuncios: 0,9–1,6 s (× ritmo tras un bloqueo) */
export const mobilePauseMs = (ritmo = 1, rnd = Math.random()) => Math.round((900 + rnd * 700) * ritmo)

// --- Qué cambia en el coche con una revisión (cron y marcar_anuncio) ----------------------------------------------------

export type CarRow = ClaudeCar & {
    anuncio_estado?: ListingState | null
    anuncio_fallos_seguidos?: number | null
    precio_actual?: number | null
    precio_bajado?: boolean | null
    /** Precio con el que se guardó el coche, antes del primer cambio de precio detectado */
    precio_original?: number | null
}

export interface AppliedReview {
    id: string
    nombre: string
    url: string
    resultado: ListingState
    motivo: string
    http_status: number | null
    precio_detectado: number | null
    precio_anterior: number | null
    /** Lo que se ha hecho o se haría (en simulación) */
    cambios: string[]
    /** Columnas a guardar en coches_claude */
    patch: Record<string, unknown>
    /** Fila para revisiones_anuncios */
    historial: Record<string, unknown>
}

const carName = (c: Partial<ClaudeCar>) => [c.marca, c.modelo, c.anio ? `(${c.anio})` : null].filter(Boolean).join(" ") || "coche"
const eur = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("es-ES")} €`)

/**
 * Qué cambia en el coche con el resultado de una revisión (lo usan el cron y marcar_anuncio).
 * No escribe nada: devuelve el patch y la fila de historial.
 */
export function planReview(car: CarRow, check: Pick<ListingCheck, "resultado" | "motivo" | "http_status" | "precio">, settings: ImportCostSettings, now = new Date(), origen = "cron"): AppliedReview {
    const cambios: string[] = []
    const patch: Record<string, unknown> = { anuncio_ultima_comprobacion: now.toISOString() }
    const fallos = car.anuncio_fallos_seguidos ?? 0
    const precioGuardado = car.precio_alemania ?? null

    if (check.resultado === "retirado") {
        const n = fallos + 1
        patch.anuncio_estado = "retirado"
        patch.anuncio_fallos_seguidos = n
        if (n >= RETIRED_STRIKES && car.estado !== "retirado" && car.estado !== "comprado") {
            const nota = `Anuncio retirado o vendido (detectado el ${madridDateEs(now)})`
            patch.estado = "retirado"
            patch.retirado_en = now.toISOString()
            patch.notas = car.notas ? `${car.notas}\n\n${nota}` : nota
            cambios.push(`retirado ${n}/${RETIRED_STRIKES} → VENDIDO / RETIRADO`)
        } else cambios.push(`retirado ${n}/${RETIRED_STRIKES} (pasa a "Vendido / retirado" a la ${RETIRED_STRIKES}.ª)`)
    } else if (check.resultado === "activo") {
        patch.anuncio_estado = "activo"
        if (fallos) { patch.anuncio_fallos_seguidos = 0; cambios.push("vuelve a estar activo: fallos a 0") }
        if (check.precio) {
            patch.precio_actual = check.precio
            if (precioGuardado && Math.abs(check.precio - precioGuardado) > 1) {
                // Cambio de precio (baja o sube): coste y beneficio pasan a calcularse con el precio nuevo.
                // El precio con el que se guardó el coche queda en precio_original (solo la primera vez) y el anterior en el historial.
                const original = car.precio_original ?? precioGuardado
                const ratio = check.precio / precioGuardado
                const nuevos: Partial<ClaudeCarFields> = { precio_alemania: check.precio }
                if (car.iva_deducible && car.precio_neto) nuevos.precio_neto = Math.round(car.precio_neto * ratio)
                Object.assign(patch, nuevos, computeClaudeCar({ ...car, ...nuevos } as ClaudeCarFields, settings), {
                    precio_bajado: check.precio < original - 1,
                })
                if (car.precio_original == null) patch.precio_original = precioGuardado
                const baja = isPriceDrop(check.precio, precioGuardado)
                cambios.push(`${baja ? "BAJA" : "SUBE"} de precio: ${eur(precioGuardado)} → ${eur(check.precio)} (beneficio ${eur(car.beneficio)} → ${eur(patch.beneficio as number | null)})`)
            } else cambios.push(`precio sin cambios (${eur(check.precio)})`)
        } else cambios.push("activo (precio no leído)")
    } else {
        patch.anuncio_estado = "no_comprobado"
        cambios.push("no comprobado: queda pendiente para Claude con Chrome")
    }

    return {
        id: car.id, nombre: carName(car), url: car.url,
        resultado: check.resultado, motivo: check.motivo, http_status: check.http_status,
        precio_detectado: check.precio, precio_anterior: check.precio && check.precio !== precioGuardado ? precioGuardado : null,
        cambios, patch,
        historial: {
            coche_id: car.id, fecha: now.toISOString(), resultado: check.resultado, http_status: check.http_status,
            precio_detectado: check.precio, precio_anterior: precioGuardado, motivo: check.motivo, origen,
        },
    }
}


// --- Revisión manual en bloque (herramienta marcar_anuncios) -------------------------------------------------------------

export const MANUAL_REVIEW_MAX = 200

export interface ManualReviewItem {
    id: string
    estado: "activo" | "retirado"
    precio?: number | null
    nota?: string | null
}

export interface ManualReviewPlan {
    reviews: AppliedReview[]
    /** ids que no existen o no se han podido procesar (se sigue con los demás) */
    errores: { id: string; motivo: string }[]
    resumen: { revisados: number; activos: number; retirados: number; cambios_precio: number; errores: number; pasan_a_retirado: number }
    /** Solo lo que ha cambiado: pasan a "retirado", siguen retirados (1.er aviso) y cambios de precio con el beneficio antes → después */
    cambios: string[]
}

/**
 * Lo que hace marcar_anuncios con una lista de anuncios revisados a mano: para cada uno, lo mismo que marcar_anuncio
 * (planReview con origen "manual"). No escribe nada; los ids que no estén en `cars` van a errores.
 */
export function planManualReviews(cars: CarRow[], items: ManualReviewItem[], settings: ImportCostSettings, now = new Date()): ManualReviewPlan {
    if (items.length > MANUAL_REVIEW_MAX) throw new Error(`Como mucho ${MANUAL_REVIEW_MAX} anuncios por llamada (has pasado ${items.length})`)
    const byId = new Map(cars.map(c => [c.id, c]))
    const reviews: AppliedReview[] = []
    const errores: { id: string; motivo: string }[] = []
    const cambios: string[] = []
    const seen = new Set<string>()
    for (const it of items) {
        if (seen.has(it.id)) { errores.push({ id: it.id, motivo: "repetido en la lista (se usa el primero)" }); continue }
        seen.add(it.id)
        const car = byId.get(it.id)
        if (!car) { errores.push({ id: it.id, motivo: "no existe ningún coche de Claude con ese id" }); continue }
        try {
            const r = planReview(car, {
                resultado: it.estado,
                precio: it.estado === "activo" && it.precio && it.precio > 0 ? Math.round(it.precio) : null,
                http_status: null,
                motivo: `revisión manual con el navegador${it.nota ? `: ${it.nota}` : ""}`,
            }, settings, now, "manual")
            reviews.push(r)
            if (r.patch.estado === "retirado") cambios.push(`🏷️ ${r.nombre}: retirado 2.ª vez → Vendido / retirado`)
            else if (it.estado === "retirado") cambios.push(`⚠️ ${r.nombre}: retirado (${r.patch.anuncio_fallos_seguidos}/${RETIRED_STRIKES})`)
            if ("precio_alemania" in r.patch) {
                const baja = (r.patch.precio_alemania as number) < (car.precio_alemania ?? 0)
                cambios.push(`${baja ? "📉" : "📈"} ${r.nombre}: ${eur(car.precio_alemania)} → ${eur(r.patch.precio_alemania as number)} · beneficio ${eur(car.beneficio)} → ${eur(r.patch.beneficio as number | null)}`)
            }
        } catch (e) {
            errores.push({ id: it.id, motivo: e instanceof Error ? e.message : String(e) })
        }
    }
    return {
        reviews, errores, cambios,
        resumen: {
            revisados: reviews.length,
            activos: reviews.filter(r => r.resultado === "activo").length,
            retirados: reviews.filter(r => r.resultado === "retirado").length,
            cambios_precio: reviews.filter(r => "precio_alemania" in r.patch).length,
            errores: errores.length,
            pasan_a_retirado: reviews.filter(r => r.patch.estado === "retirado").length,
        },
    }
}

/** Respuesta corta de marcar_anuncios */
export function manualReviewText(p: ManualReviewPlan, guardado = true): string {
    const r = p.resumen
    return [
        `${guardado ? "Guardados" : "NO guardados"} ${r.revisados} anuncio(s): ${r.activos} activos · ${r.retirados} retirados${r.pasan_a_retirado ? ` (${r.pasan_a_retirado} pasan a Vendido / retirado)` : ""} · ${r.cambios_precio} cambios de precio${r.errores ? ` · ${r.errores} error(es)` : ""}.`,
        ...(p.cambios.length ? ["Cambios:", ...p.cambios.map(c => `• ${c}`)] : ["Sin cambios."]),
        ...(p.errores.length ? ["Errores:", ...p.errores.map(e => `• ${e.id}: ${e.motivo}`)] : []),
    ].join("\n")
}
