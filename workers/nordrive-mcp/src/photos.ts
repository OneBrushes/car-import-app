// Fotos de los coches de Claude: se descargan del anuncio y se copian al bucket público "coches-claude" de Supabase
// Storage, para que sigan ahí aunque el vendedor borre el anuncio. Se lee el tamaño de la principal para encuadrarla.
//
// No se recortan los archivos: decodificar y volver a codificar imágenes en el Worker gasta más CPU de la que permite
// el plan gratuito de Cloudflare. En su lugar se guarda el encuadre (foto_posicion_y) y la tarjeta la muestra con
// object-fit: cover, que da el mismo resultado sin perder el resto de la foto (la galería la enseña entera).
import type { SupabaseClient } from "@supabase/supabase-js"
import { autoFramingY, imageSize, normalizePhotoUrl, type ImageSize } from "../../../lib/image-size"
import { MAX_CLAUDE_PHOTOS } from "../../../lib/claude-cars"

export const PHOTOS_BUCKET = "coches-claude"
const MAX_BYTES = 10 * 1024 * 1024
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

export interface RehostResult {
    fotos: string[]
    /** Encuadre calculado para la principal (null si no es vertical o no se pudo leer) */
    posicionY: number | null
    /** Fotos que no se pudieron copiar (se guarda la URL original) */
    avisos: string[]
}

const publicPrefix = (supabaseUrl: string) => `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PHOTOS_BUCKET}/`

async function sha256Hex(text: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("")
}

/** Descarga una foto y la sube a Storage. El nombre es el hash de la URL, así la misma foto no se sube dos veces */
async function rehostOne(client: SupabaseClient, supabaseUrl: string, raw: string): Promise<{ url: string; size: ImageSize | null; aviso?: string }> {
    const prefix = publicPrefix(supabaseUrl)
    if (raw.startsWith(prefix)) return { url: raw, size: null } // ya es nuestra

    const source = normalizePhotoUrl(raw)
    try {
        const res = await fetch(source, {
            headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8" },
            redirect: "follow",
            signal: AbortSignal.timeout(12_000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
        const ext = TYPES[type]
        if (!ext) throw new Error(`no es una imagen (${type || "sin tipo"})`)
        const declared = Number(res.headers.get("content-length") ?? 0)
        if (declared > MAX_BYTES) throw new Error("más de 10 MB")
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength > MAX_BYTES) throw new Error("más de 10 MB")

        const path = `${(await sha256Hex(source)).slice(0, 32)}.${ext}`
        const { error } = await client.storage.from(PHOTOS_BUCKET).upload(path, bytes, { contentType: type, upsert: true, cacheControl: "31536000" })
        if (error) throw new Error(`Storage: ${error.message}`)
        return { url: prefix + path, size: imageSize(bytes) }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { url: source, size: null, aviso: `No se pudo copiar ${source}: ${message}` }
    }
}

/**
 * Copia hasta MAX_CLAUDE_PHOTOS fotos. La principal es fotoPrincipal si se da; si no, la primera de la lista.
 * Devuelve las URLs en Storage (o la original si falló alguna) y el encuadre automático de la principal.
 */
export async function rehostPhotos(client: SupabaseClient, supabaseUrl: string, fotoPrincipal: string | undefined, fotos: string[] | undefined): Promise<RehostResult> {
    const ordered = [fotoPrincipal, ...(fotos ?? [])].filter((u): u is string => !!u && u.trim().length > 0)
    const unique: string[] = []
    for (const u of ordered) {
        const key = normalizePhotoUrl(u)
        if (!unique.some(x => normalizePhotoUrl(x) === key)) unique.push(u)
    }
    const results = await Promise.all(unique.slice(0, MAX_CLAUDE_PHOTOS).map(u => rehostOne(client, supabaseUrl, u)))
    return {
        fotos: results.map(r => r.url),
        posicionY: autoFramingY(results[0]?.size ?? null),
        avisos: results.flatMap(r => (r.aviso ? [r.aviso] : [])),
    }
}

/**
 * Borra del bucket las fotos de un coche que ya no use ningún otro coche de Claude.
 * No se llama para coches movidos a "mis coches" (imported_cars usa esas mismas URLs y el Worker no lee esa tabla).
 */
export async function deleteUnusedPhotos(client: SupabaseClient, supabaseUrl: string, fotos: string[]) {
    const prefix = publicPrefix(supabaseUrl)
    const ours = fotos.filter(u => u.startsWith(prefix))
    if (!ours.length) return
    const stillUsed = new Set<string>()
    const { data } = await client.from("coches_claude").select("fotos").overlaps("fotos", ours)
    for (const row of data ?? []) for (const u of (row.fotos as string[]) ?? []) stillUsed.add(u)
    const paths = ours.filter(u => !stillUsed.has(u)).map(u => u.slice(prefix.length))
    if (paths.length) await client.storage.from(PHOTOS_BUCKET).remove(paths)
}
