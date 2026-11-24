// Revisión diaria de anuncios de coches_claude (cron del Worker cada 5 min de 06:00 a 06:55, hora de Madrid).
//  · Cada ejecución coge la siguiente tanda (RUN_BATCH) de coches sin revisar hoy, por prioridad: 'contactado' primero,
//    luego más beneficio, luego la comprobación más antigua (lib/listing-check.ts → nextWorkerBatch). Lo revisado hoy hace de cursor.
//  · mobile.de NO se revisa aquí (bloquea a Cloudflare): lo hace el script del PC de casa (tools/revision-mobile) con
//    /api/anuncios/mobile y /api/anuncios/marcar. El Worker no los toca ni los marca "no_comprobado".
//  · retirado dos veces seguidas → estado "retirado" (Vendido / retirado) con nota y retirado_en.
//    Cambio de precio (baja o sube) → se recalculan coste y beneficio; el precio inicial queda en precio_original.
//  · Plan gratuito: 50 peticiones por ejecución. Por eso las escrituras van juntas (aplicar_revisiones_anuncios).
import type { SupabaseClient } from "@supabase/supabase-js"
import {
    classifyListing, listingPortal, madridDate, nextWorkerBatch, planReview, REVIEWED_CAR_STATES, type AppliedReview, type CarRow, type RevisionOrigin, reviewChangeLines, type ListingCheck, type ListingFetch,
} from "../../../lib/listing-check"
import type { ImportCostSettings } from "../../../lib/import-costs"
import { CARS_TABLE } from "./db"

export const REVIEWS_TABLE = "revisiones_anuncios"
/** Coches por ejecución: 1 petición al portal cada uno (+1 si redirige). Con 15 caben de sobra en las 50 peticiones del plan gratuito, incluso guardando coche a coche si falta el SQL de aplicar_revisiones_anuncios */
export const RUN_BATCH = 15
export const SUMMARY_TABLE = "revisiones"
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
            // Redirige al buscador de AutoScout24 (/lst/) = retirado: no hace falta pedirlo (ahorra una petición)
            if (/autoscout24\./.test(current) && /\/lst(\/|\?|$)/.test(new URL(current).pathname)) return { status: res.status, finalUrl: current, redirects }
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

/**
 * Guarda los cambios de varias revisiones: una sola llamada (aplicar_revisiones_anuncios) + el historial.
 * Sin la migración 2026-11_revision_v2.sql, coche a coche como antes.
 */
export async function saveReviews(client: SupabaseClient, reviews: AppliedReview[]) {
    if (!reviews.length) return
    const rpc = await client.rpc("aplicar_revisiones_anuncios", { cambios: reviews.map(r => ({ id: r.id, patch: r.patch })) })
    if (rpc.error) {
        if (!/aplicar_revisiones_anuncios|function|schema cache/i.test(rpc.error.message)) throw new Error(`Guardando revisiones: ${rpc.error.message}`)
        for (const r of reviews) {
            let { error } = await client.from(CARS_TABLE).update(r.patch).eq("id", r.id)
            // Columnas nuevas aún sin crear (precio_original, retirado_en…): se guardan sin ellas
            if (error && /precio_original|retirado_en|estado_check/.test(error.message)) {
                const { precio_original: _p, retirado_en: _r, ...rest } = r.patch
                const fallback = /estado_check/.test(error.message) && rest.estado === "retirado" ? { ...rest, estado: "descartado" } : rest
                ;({ error } = await client.from(CARS_TABLE).update(fallback).eq("id", r.id))
            }
            if (error) throw new Error(`Guardando ${r.nombre}: ${error.message}`)
        }
    }
    const { error } = await client.from(REVIEWS_TABLE).insert(reviews.map(r => r.historial))
    if (error) throw new Error(`Historial: ${error.message}`)
}

/** Cuenta lo que ha pasado en una tanda (para la tabla revisiones y los registros) */
export function summarizeReviews(results: Pick<AppliedReview, "resultado" | "patch">[]) {
    return {
        revisados: results.length,
        activos: results.filter(r => r.resultado === "activo").length,
        retirados: results.filter(r => r.resultado === "retirado").length,
        cambios_precio: results.filter(r => "precio_alemania" in r.patch).length,
        errores: results.filter(r => r.resultado === "no_comprobado").length,
        pasan_a_retirado: results.filter(r => r.patch.estado === "retirado").length,
    }
}

export interface SummaryRow {
    origen: RevisionOrigin
    inicio: Date
    completa: boolean
    revisados: number
    activos: number
    retirados: number
    cambios_precio: number
    errores: number
    detalle?: Record<string, unknown>
}

/** Apunta la ejecución en la tabla revisiones (si aún no existe la tabla, solo lo deja en el log) */
export async function saveSummary(client: SupabaseClient, row: SummaryRow, now = new Date()) {
    const { error } = await client.from(SUMMARY_TABLE).insert({
        fecha: madridDate(row.inicio), origen: row.origen, inicio: row.inicio.toISOString(), fin: now.toISOString(),
        revisados: row.revisados, activos: row.activos, retirados: row.retirados, cambios_precio: row.cambios_precio, errores: row.errores,
        completa: row.completa, detalle: row.detalle ?? {},
    })
    if (error) console.error("revisiones:", error.message)
}

/** Coches en estados revisables (todos: el orden y la tanda los decide nextWorkerBatch) */
export async function reviewableCars(client: SupabaseClient): Promise<CarRow[]> {
    const { data, error } = await client.from(CARS_TABLE).select("*").in("estado", [...REVIEWED_CAR_STATES])
    if (error) throw new Error(error.message)
    return (data ?? []) as CarRow[]
}

export type ReviewResult = AppliedReview & { diagnostico: Record<string, unknown> }

/**
 * Revisa coches de uno en uno con 3–5 s de pausa; en simulación no guarda nada.
 * Los de mobile.de se saltan sin marcar nada (los revisa el script del PC de casa).
 */
export async function reviewCars(
    client: SupabaseClient, cars: CarRow[], settings: ImportCostSettings,
    opts: { simular: boolean; origen?: string; maxFetches?: number },
): Promise<ReviewResult[]> {
    const results: ReviewResult[] = []
    let fetches = 0
    for (const car of cars) {
        if (listingPortal(car.url) === "mobile.de") continue
        if (opts.maxFetches != null && fetches >= opts.maxFetches) break
        if (fetches > 0) await politePause()
        fetches++
        const { check, fetched } = await checkListing(car.url)
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

/** Una ejecución del cron: la siguiente tanda de hoy (sin mobile.de), por prioridad */
export async function runDailyBatch(client: SupabaseClient, settings: ImportCostSettings, now = new Date()) {
    const all = await reviewableCars(client)
    const pending = nextWorkerBatch(all, Infinity, now)
    if (!pending.length) return { revisados: 0, quedan: 0, results: [] as ReviewResult[] }
    // Las pausas de 3–5 s no gastan CPU; 15 coches son ~1 min de reloj
    const results = await reviewCars(client, pending.slice(0, RUN_BATCH), settings, { simular: false, origen: "cron", maxFetches: RUN_BATCH })
    const quedan = pending.length - results.length
    const resumen = summarizeReviews(results)
    await saveSummary(client, {
        origen: "worker", inicio: now, completa: quedan <= 0,
        revisados: resumen.revisados, activos: resumen.activos, retirados: resumen.retirados, cambios_precio: resumen.cambios_precio, errores: resumen.errores,
        detalle: { quedan, pasan_a_retirado: resumen.pasan_a_retirado, cambios: reviewChangeLines(results).slice(0, 40) },
    })
    return { revisados: results.length, quedan, results }
}
