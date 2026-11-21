/**
 * Utilidades de fotos compartidas por la app y el Worker del MCP (sin dependencias).
 *  · imageSize(): ancho y alto leyendo solo la cabecera del archivo (JPEG, PNG, WebP, GIF).
 *  · autoFramingY(): encuadre vertical (object-position Y en %) para que en una foto vertical se vea el coche,
 *    que en mobile.de suele estar en la parte de abajo, y no el cielo.
 *  · normalizePhotoUrl(): fotos de mobile.de a 1024 px (sufijo ?rule=mo-1024.jpg).
 */

export interface ImageSize {
    width: number
    height: number
}

/** Proporción de la foto en las tarjetas (aspect-[16/10]) */
export const CARD_PHOTO_ASPECT = 16 / 10

/** Encuadre por defecto cuando no hay uno guardado: algo por debajo del centro */
export const DEFAULT_PHOTO_POSITION_Y = 65

/** Centro de la ventana visible en una foto vertical: el centro del tercio inferior */
const LOWER_THIRD_CENTER = 5 / 6

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
 * Encuadre vertical (0–100, object-position Y) para una foto mostrada con object-fit: cover en un hueco de proporción
 * `containerAspect`. Solo para fotos verticales: la ventana visible se centra en el tercio inferior.
 * Devuelve null si la foto no es vertical (se usa DEFAULT_PHOTO_POSITION_Y).
 */
export function autoFramingY(size: ImageSize | null, containerAspect = CARD_PHOTO_ASPECT): number | null {
    if (!size || size.width <= 0 || size.height <= 0 || size.height <= size.width) return null
    const visible = size.width / containerAspect / size.height // fracción de la altura que se ve
    if (visible >= 1) return null
    const top = Math.min(Math.max(LOWER_THIRD_CENTER - visible / 2, 0), 1 - visible)
    return Math.round((top / (1 - visible)) * 100)
}

/** Fotos de mobile.de (img.classistatic.de) en tamaño 1024 px */
export function normalizePhotoUrl(raw: string): string {
    try {
        const url = new URL(raw.trim())
        if (url.hostname.endsWith("classistatic.de")) url.searchParams.set("rule", "mo-1024.jpg")
        return url.toString()
    } catch {
        return raw.trim()
    }
}
