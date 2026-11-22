import { describe, expect, it } from "vitest"
import { buscarAlarmas, carroceriaExcluida, filtroDuro, medianaMercado } from "./filtro"
import { estudiarMercado, facilidadPorDias, percentil } from "./mercado"
import { motivosGravesIA, type LecturaIA } from "./ia"
import type { Anuncio, Comparable } from "./tipos"

const anuncio = (extra: Partial<Anuncio> = {}): Anuncio => ({
    portal: "autoscout24", id: "1", url: "u", titulo: "VW Golf R", marca: "Volkswagen", modelo: "Golf", version: "R 2.0 TSI 4Motion DSG",
    precio: 32000, precio_neto: null, km: 60000, anio: 2021, mes: 5, cv: 320, cc: 1984, co2: 180, combustible: "Benzin", carroceria: "Limousine",
    cambio: "Automatik", descripcion: "Scheckheftgepflegt, unfallfrei, 2. Hand, Nichtraucher, Garagenwagen. Inspektion neu.",
    vendedor_tipo: "particular", vendedor_nombre: "Max", ciudad: "Köln", pais: "DE", fotos: [], mediana_portal: null, ...extra,
})

describe("buscador · filtro duro con casos reales que ya nos han fallado", () => {
    it("RS5 con 'US-Carfax' → importado de EE. UU.", () => {
        const a = buscarAlarmas("Audi RS5 Sportback, US-Carfax vorhanden, Erstzulassung USA 2019, jetzt mit deutscher Zulassung")
        expect(a.map(x => x.motivo)).toContain("historial de EE. UU.")
    })
    it("M5 'seit 2019 abgemeldet' → parado", () => {
        expect(buscarAlarmas("BMW M5 F10, Fahrzeug ist seit 2019 abgemeldet und stand in der Halle").map(x => x.motivo)).toContain("parado / dado de baja")
    })
    it("Macan 'echter Preis nur am Telefon' → precio por teléfono", () => {
        expect(buscarAlarmas("Porsche Macan S. Der echte Preis nur am Telefon! Bitte anrufen.").map(x => x.motivo)).toContain("precio real por teléfono")
        expect(buscarAlarmas("Porsche Macan S. Echter Preis nur am Telefon! Bitte anrufen.").map(x => x.motivo)).toContain("precio real por teléfono")
    })
    it("CLS 63 con kit Prior Design → kit de carrocería", () => {
        expect(buscarAlarmas("Mercedes CLS 63 AMG mit Prior Design Bodykit PD550, Eintragung vorhanden").map(x => x.motivo)).toContain("kit de carrocería")
    })
    it("León VZ Sportstourer → carrocería familiar excluida", () => {
        expect(carroceriaExcluida({ carroceria: "Kombi", titulo: "Cupra Leon Sportstourer VZ 2.0 TSI", version: "VZ" }, ["familiar"])).toBe("familiar")
        expect(carroceriaExcluida({ carroceria: "Limousine", titulo: "Cupra Leon VZ 2.0 TSI", version: "VZ" }, ["familiar"])).toBeNull()
    })
    it("A 35 sedán → excluido si se excluye 'sedan'", () => {
        expect(carroceriaExcluida({ carroceria: "Limousine", titulo: "Mercedes-AMG A 35 4Matic Limousine Sedan", version: "A 35" }, ["sedan"])).toBe("sedan")
    })
    it("negaciones: 'unfallfrei', 'kein Unfall', 'Vorschäden: keine' no son alarma", () => {
        expect(buscarAlarmas("Unfallfrei! Kein Unfall, Vorschäden: keine. Scheckheft.")).toEqual([])
        expect(buscarAlarmas("Leichter Unfallschaden hinten, repariert").map(x => x.motivo)).toContain("accidente")
    })
    it("texto legal de concesionario con 'Gewerbe' no descarta; 'nur an Händler' sí", () => {
        expect(buscarAlarmas("Gewährleistung gemäß Gesetz. Verkauf an Gewerbe ohne Gewährleistung möglich.")).toEqual([])
        expect(buscarAlarmas("Verkauf nur an Händler oder Export!").map(x => x.motivo)).toEqual(expect.arrayContaining(["solo profesionales", "exportación"]))
    })
    it("filtro completo: sin descripción y posible fraude (< 70 % del mercado)", () => {
        expect(filtroDuro(anuncio({ descripcion: "Top" }), { carrocerias_excluidas: [] }, null).motivos).toContain("sin descripción")
        const r = filtroDuro(anuncio({ precio: 19000 }), { carrocerias_excluidas: [] }, 34000)
        expect(r.posible_fraude).toBe(true)
        expect(filtroDuro(anuncio(), { carrocerias_excluidas: [] }, 34000).pasa).toBe(true)
    })
    it("mercado alemán: mediana del mismo año con 5+ anuncios; si no, la del portal", () => {
        const mismos = [30000, 31000, 32000, 33000, 34000].map((p, i) => anuncio({ id: String(i), precio: p }))
        expect(medianaMercado(anuncio(), mismos)).toBe(32000)
        expect(medianaMercado(anuncio({ mediana_portal: 35000 }), mismos.slice(0, 3))).toBe(35000)
    })
})

describe("buscador · mercado en España", () => {
    const comp = (precio: number, extra: Partial<Comparable> = {}): Comparable => ({ fuente: "wallapop", url: "w", titulo: "Golf R", precio, anio: 2021, km: 60000, cv: 320, particular: true, dias_publicado: 30, ...extra })
    it("percentil 25 de particulares con km parecidos y facilidad por días", () => {
        const r = estudiarMercado([comp(38000), comp(40000), comp(42000), comp(44000), comp(30000, { km: 200000 }), comp(50000, { particular: false })], { anio: 2021, km: 60000 })
        expect(r.ok).toBe(true)
        expect(r.comparables.length).toBe(5) // el de 200.000 km no cuenta
        expect(r.base).toBe("particulares")
        expect(r.precio_venta).toBe(Math.round(percentil([38000, 40000, 42000, 44000], 25)! / 100) * 100)
        expect(r.facilidad).toBe(2)
    })
    it("menos de 3 comparables → pocos datos", () => {
        const r = estudiarMercado([comp(38000), comp(40000, { anio: 2017 })], { anio: 2021, km: 60000 })
        expect(r.ok).toBe(false)
        expect(r.motivo).toMatch(/pocos datos/)
    })
    it("facilidad: ≤20→1, 20–35→2, 35–60→3, >60→4", () => {
        expect([10, 20, 21, 35, 36, 60, 61].map(facilidadPorDias)).toEqual([1, 1, 2, 2, 3, 3, 4])
    })
})

describe("buscador · lectura con IA", () => {
    const limpio: LecturaIA = { accidente: false, importado: false, pais_origen: null, parado_desde: null, modificado: false, itv_hasta: "2027-05", duenos: 2, vendedor_pide_whatsapp_o_senal: false, precio_texto_distinto: false, alertas: [] }
    const HOY = new Date(2026, 10, 22)
    it("sin alertas graves pasa; 'otros' solo se anota", () => {
        expect(motivosGravesIA(limpio, HOY)).toEqual([])
        expect(motivosGravesIA({ ...limpio, alertas: [{ tipo: "otros", cita_exacta: "Klimaanlage müsste befüllt werden" }] }, HOY)).toEqual([])
    })
    it("RS5 importado, M5 parado desde 2019, Macan precio por teléfono, CLS modificado", () => {
        expect(motivosGravesIA({ ...limpio, importado: true, pais_origen: "USA" }, HOY)).toEqual(["IA: importado (USA)"])
        expect(motivosGravesIA({ ...limpio, parado_desde: "2019-01" }, HOY)).toEqual(["IA: parado desde 2019-01"])
        expect(motivosGravesIA({ ...limpio, precio_texto_distinto: true }, HOY)).toEqual(["IA: el precio real no es el anunciado"])
        expect(motivosGravesIA({ ...limpio, modificado: true, alertas: [{ tipo: "modificado", cita_exacta: "Prior Design PD550" }] }, HOY)).toEqual(["IA: modificado"])
    })
    it("parado hace menos de 12 meses no descarta", () => {
        expect(motivosGravesIA({ ...limpio, parado_desde: "2026-06" }, HOY)).toEqual([])
    })
})

import { tienePalabra, encajaEnBusqueda } from "../../tools/buscador/fuentes"

describe("buscador · versión y carrocería en la lista", () => {
    it("'R' suelta sí; R-Line, R-Kamera, R.Cam no (casos reales de la simulación)", () => {
        expect(tienePalabra("Volkswagen Golf R 2.0 TSI 4Motion DSG", "R")).toBe(true)
        expect(tienePalabra("Golf VII R 4Motion *ACC*DYNAUDIO", "R")).toBe(true)
        expect(tienePalabra("Golf VIII GTI Clubsport 2.0 TSI*DSG*Navi*R-Kamera", "R")).toBe(false)
        expect(tienePalabra("Golf 1.5 TSI R-Line", "R")).toBe(false)
        expect(tienePalabra("CUPRA Leon 2.0 TSI VZ LED ACC R.Cam", "VZ")).toBe(true)
    })
    it("Variant/Sportstourer se descartan ya en la lista", () => {
        const b = { id: "x", nombre: "n", marca: "Volkswagen", modelos: ["Golf"], palabras_version: ["R"], anio_min: null, anio_max: null, km_max: null, precio_max: null, cv_min: null, combustibles: [], carrocerias_excluidas: ["familiar"], activa: true }
        const d = { titulo: "Volkswagen Golf Variant R 2.0 TSI", version: "Variant R", anio: 2021, km: 50000, precio: 30000, cv: 320, combustible: "Benzin" }
        expect(encajaEnBusqueda(b, d)).toBe("carrocería excluida: familiar")
        expect(encajaEnBusqueda(b, { ...d, titulo: "Volkswagen Golf R 2.0 TSI", version: "R" })).toBeNull()
    })
})
