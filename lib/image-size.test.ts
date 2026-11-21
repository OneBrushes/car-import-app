import { describe, expect, it } from "vitest"
import { autoFramingY, imageSize, normalizePhotoUrl } from "./image-size"

function png(width: number, height: number) {
    const b = new Uint8Array(33)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    new DataView(b.buffer).setUint32(16, width)
    new DataView(b.buffer).setUint32(20, height)
    return b
}

function jpeg(width: number, height: number) {
    // SOI, APP0 (16 bytes), SOF0 con alto y ancho
    const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0, 0, 1, 0, 1, 0, 0]
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
    return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9])
}

function webpVp8x(width: number, height: number) {
    const b = new Uint8Array(30)
    b.set([..."RIFF"].map(c => c.charCodeAt(0)), 0)
    b.set([..."WEBPVP8X"].map(c => c.charCodeAt(0)), 8)
    const w = width - 1, h = height - 1
    b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24)
    return b
}

describe("imageSize", () => {
    it("lee PNG, JPEG y WebP", () => {
        expect(imageSize(png(1024, 768))).toEqual({ width: 1024, height: 768 })
        expect(imageSize(jpeg(768, 1024))).toEqual({ width: 768, height: 1024 })
        expect(imageSize(webpVp8x(1600, 900))).toEqual({ width: 1600, height: 900 })
    })
    it("devuelve null si no es una imagen conocida", () => {
        expect(imageSize(new TextEncoder().encode("<html>no es una imagen</html>"))).toBeNull()
    })
})

describe("autoFramingY", () => {
    it("solo encuadra fotos verticales", () => {
        expect(autoFramingY({ width: 1024, height: 768 })).toBeNull()
        expect(autoFramingY({ width: 1000, height: 1000 })).toBeNull()
    })
    it("en una vertical alargada centra la ventana en el tercio inferior", () => {
        // 600×1600 en un hueco 16:10 → se ve el 23,4 % de la altura; su centro queda en 5/6
        const y = autoFramingY({ width: 600, height: 1600 })!
        const visible = 600 / 1.6 / 1600
        const center = (y / 100) * (1 - visible) + visible / 2
        expect(center).toBeCloseTo(5 / 6, 2)
    })
    it("si la ventana no puede bajar tanto, la pega abajo", () => {
        // 768×1024: se ve el 46,9 % de la altura; centrarla en 5/6 se saldría de la foto
        expect(autoFramingY({ width: 768, height: 1024 })).toBe(100)
    })
})

describe("normalizePhotoUrl", () => {
    it("pide las fotos de mobile.de a 1024 px", () => {
        expect(normalizePhotoUrl("https://img.classistatic.de/api/v1/mo-prod/images/ab/abc?rule=mo-360.jpg"))
            .toBe("https://img.classistatic.de/api/v1/mo-prod/images/ab/abc?rule=mo-1024.jpg")
        expect(normalizePhotoUrl("https://img.classistatic.de/api/v1/mo-prod/images/ab/abc"))
            .toBe("https://img.classistatic.de/api/v1/mo-prod/images/ab/abc?rule=mo-1024.jpg")
        expect(normalizePhotoUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg")
    })
})
