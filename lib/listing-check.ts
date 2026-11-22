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

// --- Qué cambia en el coche con una revisión (cron y marcar_anuncio) ----------------------------------------------------

export type CarRow = ClaudeCar & {
    anuncio_estado?: ListingState | null
    anuncio_fallos_seguidos?: number | null
    precio_actual?: number | null
    precio_bajado?: boolean | null
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
            if (isPriceDrop(check.precio, precioGuardado)) {
                // Bajada: el coste y el beneficio pasan a calcularse con el precio nuevo (el anterior queda en el historial)
                const ratio = check.precio / precioGuardado!
                const nuevos: Partial<ClaudeCarFields> = { precio_alemania: check.precio }
                if (car.iva_deducible && car.precio_neto) nuevos.precio_neto = Math.round(car.precio_neto * ratio)
                Object.assign(patch, nuevos, computeClaudeCar({ ...car, ...nuevos } as ClaudeCarFields, settings), { precio_bajado: true })
                cambios.push(`BAJA de precio: ${eur(precioGuardado)} → ${eur(check.precio)} (beneficio ${eur(car.beneficio)} → ${eur(patch.beneficio as number | null)})`)
            } else if (precioGuardado && check.precio > precioGuardado + 1) {
                patch.precio_bajado = false
                cambios.push(`sube de precio: ${eur(precioGuardado)} → ${eur(check.precio)} (no se recalcula)`)
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

