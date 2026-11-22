import { describe, expect, it } from "vitest"
import { classifyListing, isRetiredDiscard, planReview, type CarRow, type ListingFetch } from "./listing-check"
import { DEFAULT_IMPORT_COST_SETTINGS } from "./import-costs"
import { CLAUDE_CAR_STATE_LABELS, CLAUDE_CAR_STATES, isClosedClaudeCar, type ClaudeCar } from "./claude-cars"

const AS = "https://www.autoscout24.de/angebote/bmw-x3-m40i-xdrive-benzin-schwarz-fe330ec7-3fd4-430d-90e3-cd5db0ebe67c"
const SMYLE = "https://www.autoscout24.de/smyle/details/d1ee7f10-e23e-40d4-b9f2-dcbbbf033227"
const MOBILE = "https://suchen.mobile.de/fahrzeuge/details.html?id=443891517"
const ok = (url: string, html: string, extra: Partial<ListingFetch> = {}): ListingFetch => ({ status: 200, finalUrl: url, redirects: [], html, ...extra })

// Lo que trae cualquier página de AutoScout24 (también las de coches activos): las traducciones de la página de retirado
const AS_TRANSLATIONS = `"detailpage.gonePage.newSearch":"Neue Suche starten","detailpage.gonePage.title":"Dieses Fahrzeug ist leider nicht mehr verfügbar."`
const asPage = (status: string, price: string) =>
    `<html><head><title>BMW X3 für € 28.790</title></head><body><h1>BMW X3</h1><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{${AS_TRANSLATIONS},"listingDetails":{"id":"fe330ec7","status":"${status}",${price}}}}}</script></body></html>`

describe("revisión de anuncios · clasificación", () => {
    it("AutoScout24 activo aunque la página traiga el texto 'nicht mehr verfügbar' en las traducciones (falso positivo real)", () => {
        const r = classifyListing(AS, ok(AS, asPage("Active", `"prices":{"public":{"priceRaw":28790,"price":"€ 28.790"}}`)))
        expect(r.resultado).toBe("activo")
        expect(r.precio).toBe(28790)
    })

    it("AutoScout24 Smyle: precio en price.value.raw", () => {
        const r = classifyListing(SMYLE, ok(SMYLE, asPage("ACTIVE", `"price":{"value":{"raw":25750,"formatted":"€ 25.750"}}`)))
        expect(r).toMatchObject({ resultado: "activo", precio: 25750 })
    })

    it("AutoScout24 retirado: 404/410, redirección a /lst/, estado inactivo o aviso visible", () => {
        expect(classifyListing(SMYLE, { status: 410, finalUrl: SMYLE, redirects: [], html: "" }).resultado).toBe("retirado")
        expect(classifyListing(AS, { status: 404, finalUrl: AS, redirects: [], html: "" }).resultado).toBe("retirado")
        expect(classifyListing(AS, ok("https://www.autoscout24.de/lst/bmw/x3", "<html>listado</html>", { redirects: [AS] })).resultado).toBe("retirado")
        expect(classifyListing(AS, ok(AS, asPage("Inactive", `"priceRaw":28790`))).resultado).toBe("retirado")
        expect(classifyListing(AS, ok(AS, `<div><h2>Dieses Fahrzeug ist leider nicht mehr verfügbar.</h2></div>`)).resultado).toBe("retirado")
    })

    it("mobile.de: 403 'Zugriff verweigert' (lo que recibe Cloudflare) → no comprobado", () => {
        const r = classifyListing(MOBILE, { status: 403, finalUrl: MOBILE, redirects: [], html: "<title>Zugriff verweigert / Access denied</title>" })
        expect(r.resultado).toBe("no_comprobado")
    })

    it("mobile.de: 404, redirección a search.html o aviso visible → retirado; ficha → activo con precio", () => {
        expect(classifyListing(MOBILE, { status: 404, finalUrl: MOBILE, redirects: [] }).resultado).toBe("retirado")
        expect(classifyListing(MOBILE, ok("https://suchen.mobile.de/fahrzeuge/search.html?ref=gone", "<html/>", { redirects: [MOBILE] })).resultado).toBe("retirado")
        expect(classifyListing(MOBILE, ok(MOBILE, `<p>Das Fahrzeug ist nicht mehr verfügbar</p>`)).resultado).toBe("retirado")
        const activo = classifyListing(MOBILE, ok(MOBILE, `<meta property="og:title" content="Porsche Cayman"><script type="application/ld+json">{"@type":"Car","offers":{"price":"28900","priceCurrency":"EUR"}}</script>`))
        expect(activo).toMatchObject({ resultado: "activo", precio: 28900 })
    })

    it("5xx, timeout o captcha nunca descartan", () => {
        expect(classifyListing(AS, { status: 503, finalUrl: AS, redirects: [] }).resultado).toBe("no_comprobado")
        expect(classifyListing(AS, { status: null, finalUrl: AS, redirects: [], error: "timeout" }).resultado).toBe("no_comprobado")
        expect(classifyListing(MOBILE, ok(MOBILE, "<html>Please solve the captcha</html>")).resultado).toBe("no_comprobado")
        expect(classifyListing(AS, { status: 429, finalUrl: AS, redirects: [] }).resultado).toBe("no_comprobado")
    })
})

describe("revisión de anuncios · qué cambia en el coche", () => {
    const settings = { ...DEFAULT_IMPORT_COST_SETTINGS }
    const NOW = new Date("2026-11-22T05:10:00Z")
    const car = (extra: Partial<CarRow> = {}): CarRow => ({
        id: "c1", user_id: "u", url: AS, estado: "nuevo", movido_a: null, created_at: "", updated_at: "",
        marca: "BMW", modelo: "X3", anio: 2019, mes_matriculacion: 6, km: 60000, co2: 190, precio_alemania: 28790,
        precio_venta_estimado_espana: 38000, notas: "Buen coche", anuncio_fallos_seguidos: 0,
        coste_total_espana: 0, beneficio: 3000, margen_pct: null, impuesto_calculado: 0, aviso_impuesto: null, desglose: null as unknown as ClaudeCar["desglose"],
        ...extra,
    }) as CarRow

    it("retirado: 1.º aviso; 2.º seguido → 'retirado' (Vendido / retirado) con nota y fecha", () => {
        const first = planReview(car(), { resultado: "retirado", motivo: "404", http_status: 404, precio: null }, settings, NOW)
        expect(first.patch).toMatchObject({ anuncio_estado: "retirado", anuncio_fallos_seguidos: 1 })
        expect(first.patch.estado).toBeUndefined()
        const second = planReview(car({ anuncio_fallos_seguidos: 1 }), { resultado: "retirado", motivo: "404", http_status: 404, precio: null }, settings, NOW)
        expect(second.patch.estado).toBe("retirado")
        expect(second.patch.retirado_en).toBe(NOW.toISOString())
        expect(second.patch.notas).toBe("Buen coche\n\nAnuncio retirado o vendido (detectado el 22/11/2026)")
    })

    it("vuelve a estar activo → fallos a 0; no comprobado no toca los fallos", () => {
        const back = planReview(car({ anuncio_fallos_seguidos: 1 }), { resultado: "activo", motivo: "", http_status: 200, precio: 28790 }, settings, NOW)
        expect(back.patch.anuncio_fallos_seguidos).toBe(0)
        const unknown = planReview(car({ anuncio_fallos_seguidos: 1 }), { resultado: "no_comprobado", motivo: "403", http_status: 403, precio: null }, settings, NOW)
        expect(unknown.patch.anuncio_fallos_seguidos).toBeUndefined()
        expect(unknown.patch.estado).toBeUndefined()
    })

    it("bajada de precio → precio_bajado, recalcula coste y beneficio y guarda el anterior en el historial", () => {
        const r = planReview(car(), { resultado: "activo", motivo: "", http_status: 200, precio: 26990 }, settings, NOW)
        expect(r.patch).toMatchObject({ precio_actual: 26990, precio_alemania: 26990, precio_bajado: true })
        expect(r.patch.coste_total_espana).toBeLessThan(planReview(car(), { resultado: "activo", motivo: "", http_status: 200, precio: 28790 }, settings, NOW).patch.coste_total_espana as number ?? Infinity)
        expect(r.historial).toMatchObject({ precio_detectado: 26990, precio_anterior: 28790 })
    })

    it("cron: nunca pasa a 'descartado'; el 1.º aviso no pone retirado_en", () => {
        const first = planReview(car(), { resultado: "retirado", motivo: "410", http_status: 410, precio: null }, settings, NOW)
        expect(first.patch.retirado_en).toBeUndefined()
        for (const estado of ["nuevo", "interesante", "contactado", "candidato"] as const) {
            const r = planReview(car({ estado, anuncio_fallos_seguidos: 1 }), { resultado: "retirado", motivo: "410", http_status: 410, precio: null }, settings, NOW)
            expect(r.patch.estado).toBe("retirado")
            expect(r.cambios[0]).toMatch(/VENDIDO \/ RETIRADO/)
        }
    })

    it("ya retirado o comprado: no cambia el estado ni repite la nota", () => {
        for (const estado of ["retirado", "comprado"] as const) {
            const r = planReview(car({ estado, anuncio_fallos_seguidos: 2 }), { resultado: "retirado", motivo: "404", http_status: 404, precio: null }, settings, NOW)
            expect(r.patch.estado).toBeUndefined()
            expect(r.patch.notas).toBeUndefined()
            expect(r.patch.anuncio_fallos_seguidos).toBe(3)
        }
    })

    it("marcar_anuncio (origen claude): la misma regla", () => {
        const r = planReview(car({ anuncio_fallos_seguidos: 1 }), { resultado: "retirado", motivo: "comprobado por Claude con el navegador", http_status: null, precio: null }, settings, NOW, "claude")
        expect(r.patch.estado).toBe("retirado")
        expect(r.historial.origen).toBe("claude")
    })
})

describe("estado 'retirado' (Vendido / retirado)", () => {
    it("está en los estados, con su texto, y no cuenta como activo", () => {
        expect(CLAUDE_CAR_STATES).toContain("retirado")
        expect(CLAUDE_CAR_STATE_LABELS.retirado).toBe("Vendido / retirado")
        expect(isClosedClaudeCar("retirado")).toBe(true)
        expect(isClosedClaudeCar("descartado")).toBe(true)
        expect(isClosedClaudeCar("contactado")).toBe(false)
    })

    it("migración: descartados por anuncio retirado → retirado; el resto se queda", () => {
        expect(isRetiredDiscard({ estado: "descartado", notas: "❌ Anuncio retirado del portal" })).toBe(true)
        expect(isRetiredDiscard({ estado: "descartado", notas: "Retirado por el vendedor" })).toBe(true)
        expect(isRetiredDiscard({ estado: "descartado", notas: "Buen coche\n\nAnuncio retirado o vendido (detectado el 20/11/2026)" })).toBe(true)
        expect(isRetiredDiscard({ estado: "descartado", notas: "Caro", anuncio_estado: "retirado" })).toBe(true)
        expect(isRetiredDiscard({ estado: "descartado", notas: "Demasiados km" })).toBe(false)
        expect(isRetiredDiscard({ estado: "nuevo", notas: "❌ Anuncio retirado", anuncio_estado: "retirado" })).toBe(false)
    })
})
