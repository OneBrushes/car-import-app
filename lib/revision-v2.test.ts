import { describe, expect, it } from "vitest"
import {
    classifyListing, classifyMobileQuick, compareReviewPriority, mobileAdId, mobileBlockAction, mobilePauseMs, mobileTitlePrice,
    nextWorkerBatch, planReview, reviewedToday, revisionDayText, summarizeRevisionDays, MOBILE_BLOCK_WAIT_MS, type CarRow,
} from "./listing-check"
import { DEFAULT_IMPORT_COST_SETTINGS } from "./import-costs"
import { computeClaudeCar, isHaciendaPending, type ClaudeCar } from "./claude-cars"
import { adaptadorVpn, vpnSospechosa, yaRevisadoHoy } from "../tools/revision-mobile/comun"

const NOW = new Date("2026-11-23T05:30:00Z") // 06:30 en Madrid
const AYER = "2026-11-22T05:40:00Z"
const HOY_TEMPRANO = "2026-11-22T23:30:00Z" // 00:30 del 23 en Madrid → ya es hoy
const settings = { ...DEFAULT_IMPORT_COST_SETTINGS }

const car = (extra: Partial<CarRow> = {}): CarRow => ({
    id: "c1", user_id: "u", url: "https://www.autoscout24.de/angebote/x-123", estado: "nuevo", movido_a: null, created_at: "", updated_at: "",
    marca: "BMW", modelo: "X3", anio: 2019, mes_matriculacion: 6, km: 60000, co2: 190, precio_alemania: 28790,
    precio_venta_estimado_espana: 38000, notas: null, anuncio_fallos_seguidos: 0,
    coste_total_espana: 0, beneficio: 3000, margen_pct: null, impuesto_calculado: 0, aviso_impuesto: null, desglose: null as unknown as ClaudeCar["desglose"],
    ...extra,
}) as CarRow

describe("mobile.de · título y clasificación (script del PC)", () => {
    it("precio del <title> 'für X €'", () => {
        expect(mobileTitlePrice("BMW X3 M40i xDrive für 28.790 € kaufen")).toBe(28790)
        expect(mobileTitlePrice("Volkswagen Golf R 2.0 TSI f&uuml;r 32.990 &euro;")).toBe(32990)
        expect(mobileTitlePrice("Mercedes-Benz C 63 AMG für 41.500 € - mobile.de")).toBe(41500)
        expect(mobileTitlePrice("mobile.de – Gebrauchtwagen")).toBeNull()
    })
    it("id del anuncio en la URL", () => {
        expect(mobileAdId("https://suchen.mobile.de/fahrzeuge/details.html?id=443891517&lang=de")).toBe("443891517")
        expect(mobileAdId("https://www.mobile.de/auto-inserat/bmw-x3/443891517.html")).toBe("443891517")
        expect(mobileAdId("https://www.autoscout24.de/angebote/x")).toBeNull()
    })
    it("activo con precio; 404/410 y 'nicht mehr verfügbar' → retirado", () => {
        expect(classifyMobileQuick({ status: 200, title: "Audi RS3 für 45.900 €" })).toMatchObject({ bloqueado: false, resultado: "activo", precio: 45900 })
        expect(classifyMobileQuick({ status: 404, title: null })).toMatchObject({ bloqueado: false, resultado: "retirado" })
        expect(classifyMobileQuick({ status: 410 })).toMatchObject({ resultado: "retirado" })
        expect(classifyMobileQuick({ status: 200, title: "mobile.de", gone: true })).toMatchObject({ resultado: "retirado" })
        expect(classifyMobileQuick({ status: 200, url: "https://suchen.mobile.de/fahrzeuge/search.html?x=1", title: "Suche" })).toMatchObject({ resultado: "retirado" })
    })
    it("el título con precio manda sobre textos sueltos de la página", () => {
        expect(classifyMobileQuick({ status: 200, title: "Golf R für 30.000 €", gone: true, blocked: true })).toMatchObject({ resultado: "activo", precio: 30000 })
    })
    it("403/429 o captcha → bloqueado: no se marca nada", () => {
        expect(classifyMobileQuick({ status: 403 })).toMatchObject({ bloqueado: true, http_status: 403 })
        expect(classifyMobileQuick({ status: 429 })).toMatchObject({ bloqueado: true })
        expect(classifyMobileQuick({ status: 200, title: "Access denied", blocked: true })).toMatchObject({ bloqueado: true })
        expect(classifyMobileQuick({ status: 200, title: "Ohne Preis" })).toMatchObject({ bloqueado: false, resultado: "no_comprobado" })
    })
    it("backoff: espera 5 min y va más despacio; al 3.er bloqueo seguido, aborta", () => {
        expect(mobileBlockAction(1)).toEqual({ accion: "esperar", esperaMs: MOBILE_BLOCK_WAIT_MS, ritmo: 2 })
        expect(mobileBlockAction(2)).toEqual({ accion: "esperar", esperaMs: 2 * MOBILE_BLOCK_WAIT_MS, ritmo: 4 })
        expect(mobileBlockAction(3)).toEqual({ accion: "abortar" })
        expect(MOBILE_BLOCK_WAIT_MS).toBe(5 * 60_000)
    })
    it("ritmo 0,9–1,6 s entre anuncios (×2 tras un bloqueo)", () => {
        expect(mobilePauseMs(1, 0)).toBe(900)
        expect(mobilePauseMs(1, 1)).toBe(1600)
        expect(mobilePauseMs(2, 0)).toBe(1800)
    })
})

describe("revisión · prioridad y tandas del Worker", () => {
    it("orden: contactado primero, luego beneficio, luego la comprobación más antigua", () => {
        const cars = [
            { id: "a", estado: "nuevo", beneficio: 9000, anuncio_ultima_comprobacion: AYER },
            { id: "b", estado: "contactado", beneficio: 1000, anuncio_ultima_comprobacion: AYER },
            { id: "c", estado: "interesante", beneficio: 9000, anuncio_ultima_comprobacion: "2026-11-20T05:00:00Z" },
            { id: "d", estado: "nuevo", beneficio: null, anuncio_ultima_comprobacion: null },
            { id: "e", estado: "contactado", beneficio: 5000, anuncio_ultima_comprobacion: null },
        ]
        expect([...cars].sort(compareReviewPriority).map(c => c.id)).toEqual(["e", "b", "c", "a", "d"])
    })
    it("tanda: sin mobile.de, sin lo revisado hoy, solo estados revisables, como mucho n", () => {
        const as = (id: string, extra: Record<string, unknown> = {}) => ({ id, url: `https://www.autoscout24.de/angebote/${id}`, estado: "nuevo", beneficio: 1000, anuncio_ultima_comprobacion: AYER, ...extra })
        const cars = [
            as("1", { beneficio: 5000 }),
            as("2", { url: "https://suchen.mobile.de/fahrzeuge/details.html?id=1", beneficio: 99999 }),
            as("3", { anuncio_ultima_comprobacion: HOY_TEMPRANO }),
            as("4", { estado: "descartado" }),
            as("5", { estado: "retirado" }),
            as("6", { estado: "contactado" }),
            as("7"),
        ]
        expect(nextWorkerBatch(cars, 2, NOW).map(c => c.id)).toEqual(["6", "1"])
        // cursor: la siguiente ejecución, con 6 y 1 ya revisados hoy, coge el siguiente
        const after = cars.map(c => (c.id === "6" || c.id === "1" ? { ...c, anuncio_ultima_comprobacion: NOW.toISOString() } : c))
        expect(nextWorkerBatch(after, 2, NOW).map(c => c.id)).toEqual(["7"])
        expect(nextWorkerBatch(after.map(c => ({ ...c, anuncio_ultima_comprobacion: NOW.toISOString() })), 20, NOW)).toEqual([])
    })
    it("ya revisado hoy = mismo día de Madrid", () => {
        expect(reviewedToday(HOY_TEMPRANO, NOW)).toBe(true)
        expect(reviewedToday(AYER, NOW)).toBe(false)
        expect(reviewedToday(null, NOW)).toBe(false)
    })
})

describe("revisión · AutoScout24 y cambios de precio", () => {
    const AS = "https://www.autoscout24.de/angebote/bmw-x3-abc"
    it("sin listingDetails en __NEXT_DATA__ → retirado; precio de listingDetails.prices.public.priceRaw", () => {
        const sin = `<script id="__NEXT_DATA__">{"props":{"pageProps":{"status":"Active","x":1}}}</script>`
        expect(classifyListing(AS, { status: 200, finalUrl: AS, redirects: [], html: sin }).resultado).toBe("retirado")
        const con = `<script id="__NEXT_DATA__">{"props":{"pageProps":{"listingDetails":{"status":"Active","prices":{"public":{"price":"€ 27.500","priceRaw":27500}},"x":{"priceRaw":1}}}}}</script>`
        expect(classifyListing(AS, { status: 200, finalUrl: AS, redirects: [], html: con })).toMatchObject({ resultado: "activo", precio: 27500 })
        expect(classifyListing(AS, { status: 410, finalUrl: AS, redirects: [] }).resultado).toBe("retirado")
        expect(classifyListing(AS, { status: 301, finalUrl: "https://www.autoscout24.de/lst/bmw/x3", redirects: [AS] }).resultado).toBe("retirado")
    })
    it("subida de precio: se actualiza el precio, se recalcula el beneficio y se guarda el original", () => {
        const base = car()
        const calcBase = computeClaudeCar(base, settings)
        const r = planReview({ ...base, ...calcBase }, { resultado: "activo", motivo: "", http_status: 200, precio: 30790 }, settings, NOW)
        expect(r.patch).toMatchObject({ precio_alemania: 30790, precio_actual: 30790, precio_original: 28790, precio_bajado: false })
        expect(r.patch.beneficio as number).toBeLessThan(calcBase.beneficio!)
        expect(r.cambios[0]).toMatch(/SUBE de precio/)
    })
    it("el precio original no se pisa en cambios posteriores; bajada respecto al original → precio_bajado", () => {
        const r = planReview(car({ precio_alemania: 30790, precio_original: 28790 }), { resultado: "activo", motivo: "", http_status: 200, precio: 27990 }, settings, NOW)
        expect(r.patch.precio_original).toBeUndefined()
        expect(r.patch.precio_bajado).toBe(true)
        const sube = planReview(car({ precio_alemania: 26990, precio_original: 28790 }), { resultado: "activo", motivo: "", http_status: 200, precio: 27990 }, settings, NOW)
        expect(sube.patch.precio_bajado).toBe(true) // sigue por debajo del original
    })
    it("revisión del PC (origen local): misma regla de 'retirado' a la 2.ª", () => {
        const r = planReview(car({ url: "https://suchen.mobile.de/fahrzeuge/details.html?id=1", anuncio_fallos_seguidos: 1 }), { resultado: "retirado", motivo: "HTTP 404", http_status: 404, precio: null }, settings, NOW, "local")
        expect(r.patch.estado).toBe("retirado")
        expect(r.historial.origen).toBe("local")
    })
})

describe("revisión · ya hecha hoy, VPN y resumen", () => {
    it("ya revisado hoy → no repetir (fichero local o tabla revisiones)", () => {
        expect(yaRevisadoHoy("2026-11-23", "2026-11-23", false)).toBe(true)
        expect(yaRevisadoHoy("2026-11-23", "2026-11-22", true)).toBe(true)
        expect(yaRevisadoHoy("2026-11-23", "2026-11-22", false)).toBe(false)
        expect(yaRevisadoHoy("2026-11-23", null, false)).toBe(false)
    })
    it("VPN: país distinto, proveedor de VPN/hosting o adaptador de VPN; la conexión de casa pasa", () => {
        expect(vpnSospechosa({ country: "ES", org: "AS3352 TELEFONICA DE ESPANA S.A.U." })).toBeNull()
        expect(vpnSospechosa({ country: "ES", org: "AS12430 Vodafone Spain S.A.U." })).toBeNull()
        expect(vpnSospechosa({ country: "ES", org: "AS57269 DIGI SPAIN TELECOM S.L." })).toBeNull()
        expect(vpnSospechosa({ country: "DE", org: "AS3320 Deutsche Telekom AG" })).toMatch(/DE/)
        expect(vpnSospechosa({ country: "ES", org: "AS9009 M247 Europe SRL" })).toMatch(/VPN u hosting/)
        expect(vpnSospechosa({ country: "ES", org: "AS212238 Datacamp Limited" })).toMatch(/VPN u hosting/)
        expect(vpnSospechosa({ country: "ES", org: "AS1 Casa", privacy: { vpn: true } })).toMatch(/VPN/)
        expect(adaptadorVpn(["Ethernet | Realtek PCIe GbE", "NordLynx | NordLynx Tunnel"])).toMatch(/NordLynx/)
        expect(adaptadorVpn(["Wi-Fi | Intel(R) Wi-Fi 6 AX201"])).toBeNull()
    })
    it("resumen por día: suma las tandas del Worker y marca incompleta la del PC con su motivo", () => {
        const days = summarizeRevisionDays([
            { fecha: "2026-11-23", origen: "worker", revisados: 20, activos: 18, retirados: 2, cambios_precio: 1, errores: 0, completa: false },
            { fecha: "2026-11-23", origen: "worker", revisados: 15, activos: 15, retirados: 0, cambios_precio: 0, errores: 0, completa: true },
            { fecha: "2026-11-23", origen: "local", revisados: 30, activos: 29, retirados: 1, cambios_precio: 2, errores: 0, completa: false, detalle: { motivo: "posible VPN" } },
            { fecha: "2026-11-22", origen: "local", revisados: 81, activos: 80, retirados: 1, cambios_precio: 0, errores: 0, completa: true },
        ])
        expect(days.map(d => d.fecha)).toEqual(["2026-11-23", "2026-11-22"])
        expect(days[0].origenes.worker).toMatchObject({ ejecuciones: 2, revisados: 35, retirados: 2, completa: true })
        expect(days[0].origenes.local).toMatchObject({ completa: false, motivo: "posible VPN" })
        expect(revisionDayText(days[0])).toMatch(/INCOMPLETA \(posible VPN\)/)
        expect(revisionDayText(days[1])).toMatch(/Servidor: sin revisión/)
    })
})

describe("guardar_coche · valor de Hacienda pendiente", () => {
    it("sin valor de las tablas: no usa el precio de compra (impuesto 0) y avisa", () => {
        const base = car({ valor_hacienda: null, valor_hacienda_origen: "pendiente", co2: 250 })
        expect(isHaciendaPending(base)).toBe(true)
        const c = computeClaudeCar(base, settings)
        expect(c.desglose.impuesto_aplicado).toBe("pendiente")
        expect(c.desglose.lines.find(l => l.label === "Impuesto de matriculación")?.amount ?? 0).toBe(0)
        expect(c.aviso_impuesto).toMatch(/PENDIENTE/)
        // Antes se calculaba sobre el precio de compra: con 250 g/km salía impuesto
        const antes = computeClaudeCar(car({ valor_hacienda: null, valor_hacienda_origen: null, co2: 250 }), settings)
        expect(antes.impuesto_calculado).toBeGreaterThan(0)
    })
    it("con impuesto de Claude o con valor de Hacienda ya no está pendiente", () => {
        expect(isHaciendaPending(car({ valor_hacienda_origen: "pendiente", impuesto_matriculacion: 1200 }))).toBe(false)
        expect(isHaciendaPending(car({ valor_hacienda_origen: "pendiente", valor_hacienda: 50000 }))).toBe(false)
    })
})
