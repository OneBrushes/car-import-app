// Fotos de los coches de Claude.
//  · Se sacan del anuncio con el scraper de la app (functions/api/scrape.ts + lib/listing-parser.ts) o las indica Claude.
//  · Se copian al bucket público "coches-claude/<coche_id>/" de Supabase Storage para que sigan ahí aunque el vendedor
//    borre el anuncio. El nombre de cada archivo es el hash de su URL de origen: la misma foto no se sube dos veces.
//  · Se copian por tandas (PHOTO_BATCH): el plan gratuito de Cloudflare permite 50 conexiones salientes por petición y
//    cada foto gasta dos (descargar y subir). Las que no caben se guardan con su URL original y se copian en la
//    siguiente llamada (o con el botón "Actualizar fotos" de la app, que repite hasta terminar).
//  · No se recortan los archivos (decodificar y recodificar imágenes supera la CPU del plan gratuito): se guarda el
//    encuadre (foto_posicion_y) y la tarjeta lo aplica con object-fit: cover. La galería enseña la foto entera.
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchListingHtml, listingPlatform } from "../../../functions/api/scrape"
import { extractListingPhotos } from "../../../lib/listing-parser"
import {
    MOBILE_PHOTO_RULES, autoFramingY, imageSize, isMobilePhoto, normalizePhotoUrl, photoKey, storedPhotoSize, withMobileRule, type ImageSize,
} from "../../../lib/image-size"
import { MAX_CLAUDE_PHOTOS } from "../../../lib/claude-cars"

export const PHOTOS_BUCKET = "coches-claude"
/** Fotos que se copian como mucho en una petición (2 conexiones cada una; el resto de la petición gasta unas 10) */
export const PHOTO_BATCH = 16
const MAX_BYTES = 10 * 1024 * 1024
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }
/** Una copia más pequeña que esto (lado mayor) se vuelve a bajar en grande al actualizar: las de mo-1024 tienen 768 */
const MIN_GOOD_SIDE = 1100
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

export interface StoredPhotos {
    fotos: string[]
    /** Encuadre de la principal: número o null si se ha podido medir; undefined si no se sabe (no tocar el guardado) */
    posicionY: number | null | undefined
    avisos: string[]
    /** Fotos que se han quedado con la URL original por falta de sitio en esta tanda */
    pendientes: number
}

export const publicPrefix = (supabaseUrl: string) => `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PHOTOS_BUCKET}/`

async function sha256Hex(text: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("")
}

/** Ruta (sin extensión) donde se guarda una foto de origen para un coche */
async function storageStem(carId: string, source: string) {
    return `${carId}/${(await sha256Hex(photoKey(source))).slice(0, 32)}`
}

/** Tamaño de mobile.de que funciona en esta tanda (se averigua con la primera foto y se usa en las demás) */
interface RuleState { rules: string[] }

async function download(url: string) {
    return fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
    })
}

async function copyOne(client: SupabaseClient, prefix: string, carId: string, source: string, ruleState: RuleState): Promise<{ url: string; size: ImageSize | null; aviso?: string }> {
    try {
        // mobile.de: el mayor tamaño disponible (mo-1600 → mo-1280 → mo-1024)
        let res: Response | null = null
        if (isMobilePhoto(source)) {
            for (const rule of ruleState.rules) {
                res = await download(withMobileRule(source, rule))
                if (res.ok) { ruleState.rules = ruleState.rules.slice(ruleState.rules.indexOf(rule)); break }
                if (res.status < 400 || res.status >= 500) break
            }
        } else {
            res = await download(source)
        }
        if (!res) throw new Error("sin respuesta")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
        const ext = TYPES[type]
        if (!ext) throw new Error(`no es una imagen (${type || "sin tipo"})`)
        if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("más de 10 MB")
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength > MAX_BYTES) throw new Error("más de 10 MB")

        // Las medidas van en el nombre: si luego se baja en más resolución, la URL cambia y no se ve la copia vieja en caché
        const size = imageSize(bytes)
        const path = `${await storageStem(carId, source)}${size ? `-${size.width}x${size.height}` : ""}.${ext}`
        const { error } = await client.storage.from(PHOTOS_BUCKET).upload(path, bytes, { contentType: type, upsert: true, cacheControl: "31536000" })
        if (error) throw new Error(`Storage: ${error.message}`)
        return { url: prefix + path, size }
    } catch (e) {
        return { url: source, size: null, aviso: `No se pudo copiar ${source}: ${e instanceof Error ? e.message : String(e)}` }
    }
}

/**
 * Guarda las fotos de un coche en este orden (la primera es la principal), sin repetir y hasta MAX_CLAUDE_PHOTOS.
 * Las que ya están en nuestro Storage no se vuelven a descargar.
 */
export async function storePhotos(client: SupabaseClient, supabaseUrl: string, carId: string, sources: string[]): Promise<StoredPhotos> {
    const prefix = publicPrefix(supabaseUrl)
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const raw of sources) {
        if (!raw?.trim()) continue
        const src = raw.startsWith(prefix) ? raw : normalizePhotoUrl(raw)
        const key = src.startsWith(prefix) ? src : photoKey(src)
        if (seen.has(key)) continue
        seen.add(key)
        ordered.push(src)
        if (ordered.length >= MAX_CLAUDE_PHOTOS) break
    }

    type Result = { url: string; size: ImageSize | null; aviso?: string; known: boolean }
    const ruleState: RuleState = { rules: [...MOBILE_PHOTO_RULES] }
    let budget = PHOTO_BATCH
    let pendientes = 0
    const toCopy: number[] = []
    const results: Result[] = ordered.map((src, i) => {
        // Ya copiada: no se recalcula su encuadre (respeta el guardado)
        if (src.startsWith(prefix)) return { url: src, size: storedPhotoSize(src), known: false }
        if (budget <= 0) { pendientes++; return { url: src, size: null, known: false } }
        budget--
        toCopy.push(i)
        return { url: src, size: null, known: false }
    })
    // La primera sola (averigua el tamaño de mobile.de que existe); el resto en paralelo con ese tamaño
    const copy = async (i: number) => { const r = await copyOne(client, prefix, carId, ordered[i], ruleState); results[i] = { ...r, known: !r.aviso } }
    if (toCopy.length) await copy(toCopy[0])
    await Promise.all(toCopy.slice(1).map(copy))
    const first = results[0]
    return {
        fotos: results.map(r => r.url),
        posicionY: first?.known ? autoFramingY(first.size) : undefined,
        avisos: results.flatMap(r => (r.aviso ? [r.aviso] : [])),
        pendientes,
    }
}

/** Todas las fotos del anuncio (mobile.de, AutoScout24…) con el scraper de la app */
export async function listingPhotos(listingUrl: string): Promise<{ fotos: string[] } | { error: string }> {
    let listing: URL
    try { listing = new URL(listingUrl) } catch { return { error: "URL del anuncio no válida" } }
    if (!listingPlatform(listing)) return { error: "Portal no soportado para sacar fotos" }
    const page = await fetchListingHtml(listing)
    if ("error" in page) return { error: page.error }
    const fotos = extractListingPhotos(page.html.slice(0, 1_500_000), listing.toString(), MAX_CLAUDE_PHOTOS)
    return fotos.length ? { fotos } : { error: "No se han encontrado fotos en el anuncio" }
}

/**
 * Vuelve a sacar las fotos del anuncio (o usa `given`, p. ej. lo copiado con el marcador "Copiar para NorDrive") y las guarda. Si la principal actual sale en el anuncio, sigue siendo la principal
 * (así se respeta "Fijar como principal"). Si el anuncio no se puede leer, se reintentan las fotos pendientes.
 */
export async function refreshFromListing(
    client: SupabaseClient, supabaseUrl: string,
    car: { id: string; url: string; foto_url?: string | null; fotos?: string[] | null },
    given?: string[],
): Promise<StoredPhotos & { leidas: number | null }> {
    const current = car.fotos?.length ? car.fotos : car.foto_url ? [car.foto_url] : []
    const scraped = given?.length ? { fotos: given.map(normalizePhotoUrl).slice(0, MAX_CLAUDE_PHOTOS) } : await listingPhotos(car.url)
    if ("error" in scraped) {
        const retry = current.length ? await storePhotos(client, supabaseUrl, car.id, current) : { fotos: [], posicionY: undefined, avisos: [], pendientes: 0 }
        return { ...retry, avisos: [`No se han podido leer las fotos del anuncio: ${scraped.error} Pasa las URLs de todas las fotos de la galería con actualizar_coche (campo fotos).`, ...retry.avisos], leidas: null }
    }
    const prefix = publicPrefix(supabaseUrl)
    const stems = await Promise.all(scraped.fotos.map(s => storageStem(car.id, s)))
    // Las ya copiadas se reutilizan sin volver a descargarlas
    // (menos las de mobile.de que se copiaron pequeñas: esas se vuelven a bajar en grande)
    const stemOf = (u: string) => u.slice(prefix.length).replace(/(-\d+x\d+)?\.[a-z0-9]+$/i, "")
    const goodEnough = (u: string) => { const sz = storedPhotoSize(u); return !!sz && Math.max(sz.width, sz.height) >= MIN_GOOD_SIDE }
    const byStem = new Map(current.filter(u => u.startsWith(prefix)).map(u => [stemOf(u), u]))
    let sources = scraped.fotos.map((s, i) => {
        const copied = byStem.get(stems[i])
        return copied && (!isMobilePhoto(s) || goodEnough(copied)) ? copied : s
    })
    // La principal elegida sigue delante
    const idx = car.foto_url?.startsWith(prefix) ? stems.findIndex(stem => stemOf(car.foto_url!) === stem) : -1
    if (idx > 0) sources = [sources[idx], ...sources.slice(0, idx), ...sources.slice(idx + 1)]
    const stored = await storePhotos(client, supabaseUrl, car.id, sources)
    return { ...stored, leidas: scraped.fotos.length }
}

/** ¿Son la misma foto (misma copia, aunque cambie la resolución)? */
export function samePhoto(supabaseUrl: string, a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false
    const prefix = publicPrefix(supabaseUrl)
    const stem = (u: string) => (u.startsWith(prefix) ? u.slice(prefix.length).replace(/(-\d+x\d+)?\.[a-z0-9]+$/i, "") : u)
    return stem(a) === stem(b)
}

/** Borra de la carpeta del coche las fotos que ya no están en su lista */
export async function pruneCarFolder(client: SupabaseClient, supabaseUrl: string, carId: string, keep: string[]) {
    const prefix = publicPrefix(supabaseUrl)
    const keepPaths = new Set(keep.filter(u => u.startsWith(prefix)).map(u => u.slice(prefix.length)))
    const { data } = await client.storage.from(PHOTOS_BUCKET).list(carId, { limit: 1000 })
    const remove = (data ?? []).map(f => `${carId}/${f.name}`).filter(p => !keepPaths.has(p))
    if (remove.length) await client.storage.from(PHOTOS_BUCKET).remove(remove)
}
