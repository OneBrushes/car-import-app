import { describe, expect, it } from "vitest"
import { carPhotoList } from "./claude-cars"
import { DEFAULT_PHOTO_POSITION_Y } from "./image-size"
import cla from "./__fixtures__/coche-cla-fotos.json"

// Coche del bug "la tarjeta dice 15 fotos y el visor no muestra ninguna" (2ac30b3d-…), datos reales de Supabase
describe("fotos del Mercedes CLA (2ac30b3d)", () => {
    it("el visor recibe las 15 fotos del array fotos, empezando por la principal", () => {
        const { photos, main, startIndex } = carPhotoList(cla)
        expect(photos).toHaveLength(15)
        expect(photos).toEqual(cla.fotos)
        expect(main).toBe(cla.foto_url)
        expect(photos[startIndex]).toBe(cla.foto_url)
        for (const url of photos) expect(url).toMatch(/^https:\/\/luzacvchtxkurisuywic\.supabase\.co\/storage\/v1\/object\/public\/coches-claude\/2ac30b3d-a589-4ffc-9a4d-3640600d3c1c\//)
    })

    it("respeta su encuadre guardado", () => {
        expect(cla.foto_posicion_y ?? DEFAULT_PHOTO_POSITION_Y).toBe(48)
    })

    it("sin fotos usa foto_url y, sin nada, no abre nada", () => {
        expect(carPhotoList({ foto_url: "https://x/a.jpg", fotos: [] })).toEqual({ photos: ["https://x/a.jpg"], main: "https://x/a.jpg", startIndex: 0 })
        expect(carPhotoList({ foto_url: null, fotos: null })).toEqual({ photos: [], main: null, startIndex: 0 })
        // una principal que ya no está en la lista no rompe el visor
        expect(carPhotoList({ foto_url: "https://x/vieja.jpg", fotos: ["https://x/b.jpg"] }).main).toBe("https://x/b.jpg")
    })
})
