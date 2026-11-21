/**
 * Utilidades de fotos compartidas por la app y el Worker del MCP (sin dependencias).
 *  · imageSize(): ancho y alto leyendo solo la cabecera del archivo (JPEG, PNG, WebP, GIF).
 *  · autoFramingY(): encuadre vertical (object-position Y en %) para la tarjeta.
 *  · normalizePhotoUrl(): fotos de mobile.de al mayor tamaño (?rule=mo-1600.jpg; al copiar se baja si no existe).
 */

export interface ImageSize {
    width: number
    height: number
}

/** Proporción de la foto en las tarjetas (aspect-[16/10]) */
export const CARD_PHOTO_ASPECT = 16 / 10

/** Encuadre por defecto cuando no hay uno guardado: centrado */
export const DEFAULT_PHOTO_POSITION_Y = 50

/**
 * Encuadre de las fotos verticales: centrado. Se probó centrar el tercio inferior (100 en una 432×768) y en las
 * fotos reales de mobile.de se quedaba en las ruedas y el suelo: el coche suele ocupar el centro de la foto.
 */
const VERTICAL_POSITION_Y = 50

export function imageSize(bytes: Uint8Array): ImageSize | null {
    const b = bytes
    const u16be = (i: number) => (b[i] << 8) | b[i + 1]
    const u16le = (i: number) => b[i] | (b[i + 1] << 8)
    const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
    const u32be = (i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])
    const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
    if (b.length < 24) return null

    // PNG: IHDR
    if (b[0] === 0x89 && ascii(1, 3) === "PNG") return { width: u32be(16), height: u32be(20) }

    // GIF
    if (ascii(0, 3) === "GIF") return { width: u16le(6), height: u16le(8) }

    // WebP
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
        const chunk = ascii(12, 4)
        if (chunk === "VP8X") return { width: u24le(24) + 1, height: u24le(27) + 1 }
        if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff }
        if (chunk === "VP8L") {
            const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
        }
        return null
    }

    // JPEG: recorre los segmentos hasta un SOFn
    if (b[0] === 0xff && b[1] === 0xd8) {
        let i = 2
        while (i + 9 < b.length) {
            if (b[i] !== 0xff) { i++; continue }
            const marker = b[i + 1]
            if (marker === 0xff) { i++; continue }
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
            const length = u16be(i + 2)
            const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
            if (isSof) return { width: u16be(i + 7), height: u16be(i + 5) }
            i += 2 + length
        }
    }
    return null
}

/**
 * Encuadre vertical (0–100, object-position Y) para una foto en la tarjeta (object-fit: cover).
 * Verticales: VERTICAL_POSITION_Y. Horizontales o cuadradas: null (se usa DEFAULT_PHOTO_POSITION_Y).
 */
export function autoFramingY(size: ImageSize | null, containerAspect = CARD_PHOTO_ASPECT): number | null {
    if (!size || size.width <= 0 || size.height <= 0 || size.height <= size.width) return null
    // Si la foto cabe entera a lo alto en el hueco no hay nada que encuadrar
    if (size.width / containerAspect / size.height >= 1) return null
    return VERTICAL_POSITION_Y
}

/**
 * Tamaños de mobile.de, de mayor a menor. mo-1024 es una caja de 1024×768 (una foto vertical sale a 432×768);
 * al copiar se prueban en este orden y se usa el primero que exista.
 */
export const MOBILE_PHOTO_RULES = ["mo-1600.jpg", "mo-1280.jpg", "mo-1024.jpg"] as const

export function isMobilePhoto(raw: string): boolean {
    try { return new URL(raw).hostname.endsWith("classistatic.de") } catch { return false }
}

/** La misma foto de mobile.de con otro tamaño */
export function withMobileRule(raw: string, rule: string): string {
    try {
        const url = new URL(raw)
        url.searchParams.set("rule", rule)
        return url.toString()
    } catch {
        return raw
    }
}

/** Medidas que lleva en el nombre una foto ya copiada (…-1600x1200.jpg) */
export function storedPhotoSize(url: string): ImageSize | null {
    const m = url.match(/-(\d{2,5})x(\d{2,5})\.[a-z0-9]+(?:\?.*)?$/i)
    return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}

/** Fotos de mobile.de (img.classistatic.de) al mayor tamaño y de AutoScout24 en 1280×960 */
export function normalizePhotoUrl(raw: string): string {
    try {
        const url = new URL(raw.trim())
        if (url.hostname.endsWith("classistatic.de")) url.searchParams.set("rule", MOBILE_PHOTO_RULES[0])
        if (url.hostname.endsWith("pictures.autoscout24.net")) {
            const base = url.pathname.match(/^(\/listing-images\/[^/]+\.(?:jpe?g|png|webp))/i)?.[1]
            if (base) { url.pathname = `${base}/1280x960.webp`; url.search = "" }
        }
        return url.toString()
    } catch {
        return raw.trim()
    }
}

/** Identidad de una foto sin el tamaño (para no repetir la misma foto en dos tamaños) */
export function photoKey(raw: string): string {
    try {
        const url = new URL(raw.trim())
        if (url.hostname.endsWith("classistatic.de")) return `mobile:${url.pathname}`
        const as24 = url.pathname.match(/^\/listing-images\/([^/]+)/i)
        if (url.hostname.endsWith("pictures.autoscout24.net") && as24) return `as24:${as24[1]}`
        return url.origin + url.pathname
    } catch {
        return raw.trim()
    }
}
