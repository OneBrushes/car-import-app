// Revisión diaria de anuncios de coches_claude (cron del Worker, 06:00–07:00 hora de Madrid, cada 10 min).
//  · Cada ejecución revisa los RUN_BATCH coches pendientes de hoy (nuevo/interesante/contactado), de uno en uno, con
//    3–5 s de pausa y cabeceras de navegador. El plan gratuito permite 50 subpeticiones por ejecución.
//  · retirado dos veces seguidas → estado "retirado" (Vendido / retirado) con nota y retirado_en. Bajada de precio → se recalcula coste y beneficio.
//  · Lo que no se puede comprobar (mobile.de bloquea a Cloudflare) queda "no_comprobado" para que Claude lo mire con
//    Chrome (herramientas revisar_anuncios_pendientes y marcar_anuncio).
import type { SupabaseClient } from "@supabase/supabase-js"
import {
    classifyListing, listingPortal, madridDate, planReview, type AppliedReview, type CarRow, type ListingCheck, type ListingFetch,
} from "../../../lib/listing-check"
import type { ImportCostSettings } from "../../../lib/import-costs"
import { CARS_TABLE } from "./db"

export const REVIEWS_TABLE = "revisiones_anuncios"
/** Coches por ejecución: cada uno gasta 1–3 peticiones al portal + 1 escritura; el resto (lectura, historial) unas 4 */
export const RUN_BATCH = 8
const MAX_REDIRECTS = 3

const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8,es;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Sec-Ch-Ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const politePause = () => sleep(3000 + Math.random() * 2000)

/** Pide la ficha siguiendo las redirecciones a mano (para ver si manda al buscador) */
export async function fetchListing(url: string): Promise<ListingFetch> {
    const redirects: string[] = []
    let current = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let res: Response
        try {
            res = await fetch(current, { headers: BROWSER_HEADERS, redirect: "manual", signal: AbortSignal.timeout(15_000) })
        } catch (e) {
            const msg = e instanceof Error ? (e.name === "TimeoutError" ? "timeout" : e.message) : String(e)
            return { status: null, finalUrl: current, redirects, error: msg }
        }
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location")
            await res.body?.cancel()
            if (!loc) return { status: res.status, finalUrl: current, redirects }
            redirects.push(current)
            current = new URL(loc, current).toString()
            continue
        }
        // Las fichas pesan ~1 MB; con 1,5 MB sobra para __NEXT_DATA__ y el precio
        const html = res.status === 200 ? (await res.text()).slice(0, 1_500_000) : (await res.text().catch(() => "")).slice(0, 20_000)
        return { status: res.status, finalUrl: current, redirects, html }
    }
    return { status: 310, finalUrl: current, redirects, error: "demasiadas redirecciones" }
}

export async function checkListing(url: string): Promise<{ check: ListingCheck; fetched: ListingFetch }> {
    const fetched = await fetchListing(url)
    return { check: classifyListing(url, fetched), fetched }
}

export async function saveReviews(client: SupabaseClient, reviews: AppliedReview[]) {
    for (const r of reviews) {
        let { error } = await client.from(CARS_TABLE).update(r.patch).eq("id", r.id)
        // Sin la migración 2026-11_estado_retirado.sql (no existe retirado_en o el CHECK no admite "retirado"): se descarta como antes
        if (error && r.patch.estado === "retirado" && /retirado_en|estado_check/.test(error.message)) {
            const { retirado_en: _, ...rest } = r.patch
            ;({ error } = await client.from(CARS_TABLE).update({ ...rest, estado: "descartado" }).eq("id", r.id))
        }
        if (error) throw new Error(`Guardando ${r.nombre}: ${error.message}`)
    }
    if (reviews.length) {
        const { error } = await client.from(REVIEWS_TABLE).insert(reviews.map(r => r.historial))
        if (error) throw new Error(`Historial: ${error.message}`)
    }
}

/** Coches que tocan hoy: estados revisables y sin comprobar hoy (los más antiguos primero) */
export async function pendingCars(client: SupabaseClient, limit: number, now = new Date()): Promise<CarRow[]> {
    const startOfDay = new Date(`${madridDate(now)}T00:00:00+01:00`) // margen: en verano empieza 1 h antes, da igual
    const { data, error } = await client.from(CARS_TABLE).select("*")
        .in("estado", ["nuevo", "interesante", "contactado"])
        .or(`anuncio_ultima_comprobacion.is.null,anuncio_ultima_comprobacion.lt.${startOfDay.toISOString()}`)
        .order("anuncio_ultima_comprobacion", { ascending: true, nullsFirst: true })
        .limit(limit)
    if (error) throw new Error(error.message)
    return (data ?? []) as CarRow[]
}

/** Revisa coches de uno en uno con pausa; en simulación no guarda nada */
export type ReviewResult = AppliedReview & { diagnostico: Record<string, unknown> }

/**
 * Revisa coches de uno en uno con 3–5 s de pausa; en simulación no guarda nada.
 *  · maxFetches: peticiones a portales como mucho (las redirecciones cuentan aparte, 1–2 más).
 *  · mobile.de bloquea a Cloudflare (403): si la primera petición a mobile.de de la tanda da 403/429, el resto de coches
 *    de mobile.de se marcan "no comprobado" sin volver a pedir (no insistir; Claude los revisa con Chrome).
 */
export async function reviewCars(
    client: SupabaseClient, cars: CarRow[], settings: ImportCostSettings,
    opts: { simular: boolean; origen?: string; maxFetches?: number },
): Promise<ReviewResult[]> {
    const results: ReviewResult[] = []
    let fetches = 0
    let mobileBlocked: number | null = null
    for (const car of cars) {
        const portal = listingPortal(car.url)
        if (portal === "mobile.de" && mobileBlocked != null) {
            const check: ListingCheck = { resultado: "no_comprobado", http_status: null, precio: null, motivo: `mobile.de bloquea al servidor (HTTP ${mobileBlocked} en la primera consulta de esta tanda); no se insiste` }
            results.push({ ...planReview(car, check, settings, new Date(), opts.origen ?? "cron"), diagnostico: { sin_peticion: true } })
            continue
        }
        if (opts.maxFetches != null && fetches >= opts.maxFetches) break
        if (fetches > 0) await politePause()
        fetches++
        const { check, fetched } = await checkListing(car.url)
        if (portal === "mobile.de" && (check.http_status === 403 || check.http_status === 429)) mobileBlocked = check.http_status
        results.push({
            ...planReview(car, check, settings, new Date(), opts.origen ?? "cron"),
            diagnostico: {
                url_final: fetched.finalUrl, redirecciones: fetched.redirects, error: fetched.error ?? null,
                tamano_html: fetched.html?.length ?? 0,
                titulo: /<title[^>]*>([^<]{0,140})/i.exec(fetched.html ?? "")?.[1]?.trim() ?? null,
            },
        })
    }
    if (!opts.simular) await saveReviews(client, results)
    return results
}

/** Una ejecución del cron: los coches pendientes de hoy, hasta RUN_BATCH peticiones a portales */
export async function runDailyBatch(client: SupabaseClient, settings: ImportCostSettings, now = new Date()) {
    // Se leen más de RUN_BATCH: los de mobile.de bloqueado se marcan sin petición y no gastan cupo
    const cars = await pendingCars(client, RUN_BATCH * 3, now)
    if (!cars.length) return { revisados: 0, results: [] as ReviewResult[] }
    const results = await reviewCars(client, cars, settings, { simular: false, origen: "cron", maxFetches: RUN_BATCH })
    return { revisados: results.length, results }
}
