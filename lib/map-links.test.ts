import { describe, expect, it } from "vitest"
import { extractMapUrl, googleMapsUrl } from "./map-links"

describe("enlaces de mapa", () => {
    it("saca el enlace del texto compartido por Google Maps", () => {
        expect(extractMapUrl("Ubicación compartida: https://maps.app.goo.gl/AbC123xyz")).toBe("https://maps.app.goo.gl/AbC123xyz")
        expect(extractMapUrl("https://www.google.com/maps/place/Lyon/@45.75,4.85,12z")).toBe("https://www.google.com/maps/place/Lyon/@45.75,4.85,12z")
        expect(extractMapUrl("https://maps.apple.com/?ll=45.75,4.85&q=Lyon")).toBe("https://maps.apple.com/?ll=45.75,4.85&q=Lyon")
    })
    it("rechaza enlaces que no son de mapas", () => {
        expect(extractMapUrl("https://ejemplo.com/maps")).toBeNull()
        expect(extractMapUrl("http://maps.app.goo.gl/x")).toBeNull()
        expect(extractMapUrl("Lyon, Francia")).toBeNull()
    })
    it("crea el enlace de Google Maps con coordenadas", () => {
        expect(googleMapsUrl(45.764043, 4.835659)).toBe("https://www.google.com/maps?q=45.76404,4.83566")
    })
})
