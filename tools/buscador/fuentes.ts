// Lectores de portales para la búsqueda automática (se ejecutan en el PC, no en Cloudflare).
//  · Alemania: AutoScout24.de (__NEXT_DATA__) y Kleinanzeigen (HTML). mobile.de bloquea al navegador automatizado:
//    lo revisa Claude en Chrome (herramienta listar_busquedas del MCP).
//  · España (precio de venta): Wallapop (su API web) y AutoScout24.es.
import type { Anuncio, Busqueda, Comparable } from "../../lib/buscador/tipos"
import { carroceriaExcluida } from "../../lib/buscador/filtro"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Ritmo humano entre páginas: 4–8 s */
export const pausa = () => sleep(4000 + Math.random() * 4000)

async function get(url: string, extra: Record<string, string> = {}): Promise<Response> {
    return fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "de-DE,de;q=0.9,es;q=0.8", ...extra },
        signal: AbortSignal.timeout(30_000),
    })
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const num = (s: unknown) => {
    if (typeof s === "number") return Number.isFinite(s) ? s : null
    const n = Number(String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))
    return Number.isFinite(n) && String(s ?? "").match(/\d/) ? n : null
}
const stripHtml = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim()

function nextData(html: string): any {
    const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)
    if (!m) throw new Error("la página no trae __NEXT_DATA__")
    return JSON.parse(m[1])
}

/**
 * ¿Aparece la palabra de versión suelta? "Golf R 2.0" sí; "R-Line", "R-Kamera" o "R.Cam" no (un guion o punto pegado
 * la convierte en otra cosa).
 */
export function tienePalabra(texto: string, palabra: string): boolean {
    const p = palabra.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`(^|[^a-z0-9\\-.])${p}(?![a-z0-9]|[-.][a-z])`).test(texto.toLowerCase())
}

/** ¿Cumple la búsqueda lo que se ve en la lista (antes de abrir la ficha)? */
export function encajaEnBusqueda(b: Busqueda, d: { titulo: string; version: string; anio: number | null; km: number | null; precio: number | null; cv: number | null; combustible: string | null }): string | null {
    const texto = `${d.titulo} ${d.version}`.toLowerCase()
    for (const p of b.palabras_version) if (!tienePalabra(texto, p)) return `no es la versión (${p})`
    const carro = carroceriaExcluida({ carroceria: null, titulo: d.titulo, version: d.version }, b.carrocerias_excluidas)
    if (carro) return `carrocería excluida: ${carro}`
    if (b.modelos.length && !b.modelos.some(m => texto.includes(m.toLowerCase()))) return "otro modelo"
    if (b.anio_min && d.anio && d.anio < b.anio_min) return "año"
    if (b.anio_max && d.anio && d.anio > b.anio_max) return "año"
    if (b.km_max && d.km && d.km > b.km_max) return "km"
    if (b.precio_max && d.precio && d.precio > b.precio_max) return "precio"
    if (b.cv_min && d.cv && d.cv < b.cv_min) return "potencia"
    if (b.combustibles.length && d.combustible && !b.combustibles.some(c => d.combustible!.toLowerCase().startsWith(c.toLowerCase().slice(0, 4)))) return "combustible"
    return null
}

// --- AutoScout24 -------------------------------------------------------------------------------------------------------

function as24Url(host: string, b: Busqueda, modelo: string, page: number, pais: "D" | "E", anios?: [number | null, number | null]) {
    const q = new URLSearchParams({ sort: "price", desc: "0", atype: "C", cy: pais, ustate: "N,U", page: String(page) })
    const [amin, amax] = anios ?? [b.anio_min, b.anio_max]
    if (amin) q.set("fregfrom", String(amin))
    if (amax) q.set("fregto", String(amax))
    if (pais === "D") {
        if (b.km_max) q.set("kmto", String(b.km_max))
        if (b.precio_max) q.set("priceto", String(b.precio_max))
        // AutoScout24 filtra la potencia en kW (1 CV = 0,7355 kW); se redondea a la baja para no perder versiones
        if (b.cv_min) { q.set("powerfrom", String(Math.floor(b.cv_min * 0.7355))); q.set("powertype", "kw") }
    }
    return `https://${host}/lst/${slug(b.marca)}/${slug(modelo)}?${q}`
}

interface ListaAS { id: string; url: string; titulo: string; version: string; precio: number | null; km: number | null; anio: number | null; cv: number | null; combustible: string | null; particular: boolean; ciudad: string | null }

function listaAutoscout(listings: any[], host: string): ListaAS[] {
    return (listings ?? []).filter((l: any) => typeof l?.url === "string").map((l: any) => {
        const v = l.vehicle ?? {}
        const fr = /(\d{2})-(\d{4})/.exec(l.tracking?.firstRegistration ?? "")
        const kw = num(l.vehicleDetails?.find?.((d: any) => /kw|ps|cv/i.test(d?.data ?? ""))?.data?.match(/\((\d+)\s*(PS|CV)\)/i)?.[1])
        return {
            id: String(l.id), url: `https://${host}${l.url}`,
            titulo: [v.make, v.model, v.modelVersionInput].filter(Boolean).join(" "),
            version: v.modelVersionInput ?? v.variant ?? "",
            precio: num(l.price?.priceRaw ?? l.tracking?.price),
            km: num(l.tracking?.mileage),
            anio: fr ? Number(fr[2]) : null,
            cv: kw,
            combustible: v.fuel ?? null,
            particular: /private/i.test(l.seller?.type ?? ""),
            ciudad: l.location?.city ?? null,
        }
    })
}

/** Lista de AutoScout24.de para una búsqueda (hasta `paginas` páginas de 20) */
export async function buscarAutoscout24(b: Busqueda, paginas = 3): Promise<ListaAS[]> {
    const out: ListaAS[] = []
    for (const modelo of b.modelos.length ? b.modelos : [""]) {
        for (let p = 1; p <= paginas; p++) {
            if (out.length) await pausa()
            const res = await get(as24Url("www.autoscout24.de", b, modelo, p, "D"))
            if (!res.ok) throw new Error(`AutoScout24 HTTP ${res.status}`)
            const pp = nextData(await res.text()).props.pageProps
            out.push(...listaAutoscout(pp.listings, "www.autoscout24.de"))
            if (p >= (pp.numberOfPages ?? 1)) break
        }
    }
    return out
}

/** Ficha de AutoScout24.de */
export async function fichaAutoscout24(item: ListaAS): Promise<Anuncio> {
    const res = await get(item.url)
    if (!res.ok) throw new Error(`ficha HTTP ${res.status}`)
    const pp = nextData(await res.text()).props.pageProps
    const d = pp.listingDetails
    if (!d) throw new Error("ficha sin listingDetails (¿Smyle?)")
    const v = d.vehicle ?? {}
    const reg = /^(\d{4})-(\d{2})/.exec(v.firstRegistrationDateRaw ?? "")
    const co2 = num(JSON.stringify(d).match(/"co2Emission[^"]*"\s*:\s*"?([\d.,]+)/i)?.[1])
    const cv = num(v.powerInHp ?? v.rawPowerInHp) ?? num(JSON.stringify(v).match(/"power(?:InHp)?"\s*:\s*"?[^"]*?\((\d+)\s*PS\)/i)?.[1]) ?? item.cv
    const fotos = (d.images ?? []).map((i: any) => (typeof i === "string" ? i : i?.url ?? i?.src)).filter(Boolean)
    return {
        portal: "autoscout24", id: item.id, url: item.url,
        titulo: item.titulo, marca: v.make ?? "", modelo: v.model ?? "", version: v.modelVersionInput ?? item.version,
        precio: num(d.prices?.public?.priceRaw) ?? item.precio,
        precio_neto: num(d.prices?.public?.netPriceRaw),
        km: num(v.mileageInKmRaw) ?? item.km,
        anio: reg ? Number(reg[1]) : item.anio, mes: reg ? Number(reg[2]) : null,
        cv, cc: num(v.rawDisplacementInCCM ?? v.engineDisplacementInCCM), co2,
        combustible: v.fuelCategory?.formatted ?? v.fuel ?? item.combustible,
        carroceria: v.bodyType ?? null,
        cambio: v.transmissionType ?? v.transmission ?? null,
        descripcion: stripHtml(d.description ?? ""),
        vendedor_tipo: /private/i.test(d.seller?.type ?? "") ? "particular" : "concesionario",
        vendedor_nombre: d.seller?.companyName ?? d.seller?.contactName ?? null,
        ciudad: d.location?.city ?? item.ciudad, pais: d.location?.countryCode ?? "DE",
        fotos, mediana_portal: num(d.prices?.public?.median),
    }
}

// --- Kleinanzeigen -----------------------------------------------------------------------------------------------------

interface ListaKA { id: string; url: string; titulo: string; precio: number | null }

export async function buscarKleinanzeigen(b: Busqueda, paginas = 2): Promise<ListaKA[]> {
    const out: ListaKA[] = []
    for (const modelo of b.modelos.length ? b.modelos : [""]) {
        for (let p = 1; p <= paginas; p++) {
            await pausa()
            // Marca y modelo van como filtros (autos.marke_s / autos.model_s); la versión ("golf r") como palabra clave
            const filtros = [
                `autos.marke_s:${slug(b.marca).replace(/-/g, "_")}`,
                modelo ? `autos.model_s:${slug(modelo).replace(/-/g, "_")}` : null,
                b.anio_min || b.anio_max ? `autos.ez_i:${b.anio_min ?? ""}%2C${b.anio_max ?? ""}` : null,
                b.km_max ? `autos.km_i:%2C${b.km_max}` : null,
            ].filter(Boolean).join("+")
            const precio = b.precio_max ? `preis::${b.precio_max}/` : ""
            const pagina = p > 1 ? `seite:${p}/` : ""
            const clave = slug([modelo, ...b.palabras_version].join(" "))
            const url = `https://www.kleinanzeigen.de/s-autos/${precio}${pagina}${clave ? `${clave}/k0` : ""}c216+${filtros}`
            const res = await get(url)
            if (!res.ok) throw new Error(`Kleinanzeigen HTTP ${res.status}`)
            const html = await res.text()
            const antes = out.length
            for (const m of html.matchAll(/<article[^>]*data-adid="(\d+)"[^>]*data-href="([^"]+)"[\s\S]*?<\/article>/g)) {
                const art = m[0]
                const titulo = stripHtml(/"title":"([^"]+)"/.exec(art)?.[1] ?? /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(art)?.[1] ?? "")
                const precio = num(/(\d{1,3}(?:\.\d{3})+|\d{4,6})\s*€/.exec(stripHtml(art))?.[1])
                if (!out.some(o => o.id === m[1])) out.push({ id: m[1], url: `https://www.kleinanzeigen.de${m[2]}`, titulo, precio })
            }
            if (out.length === antes) break
        }
    }
    return out
}

export async function fichaKleinanzeigen(item: ListaKA): Promise<Anuncio> {
    const res = await get(item.url)
    if (!res.ok) throw new Error(`ficha HTTP ${res.status}`)
    const html = await res.text()
    if (/nicht mehr verf(ü|ue)gbar|wurde gelöscht/i.test(html) && !/id="viewad-description/.test(html)) throw new Error("anuncio retirado")
    const detalle = (etiqueta: string) => {
        const re = new RegExp(`${etiqueta}\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`, "i")
        return stripHtml(re.exec(html)?.[1] ?? "") || null
    }
    const ez = detalle("Erstzulassung") ?? ""
    const ezm = /(\d{4})/.exec(ez)
    const MESES: Record<string, number> = { januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 }
    const mes = MESES[(ez.split(/\s+/)[0] ?? "").toLowerCase()] ?? num(/^(\d{1,2})[./]/.exec(ez)?.[1])
    const descripcion = stripHtml(/<p[^>]*id="viewad-description-text"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "")
    const titulo = stripHtml(/<h1[^>]*id="viewad-title"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? item.titulo)
    const fotos = [...new Set([...html.matchAll(/https:\/\/img\.kleinanzeigen\.de\/api\/v1\/prod-ads\/images\/[^"'?\s]+/g)].map(m => m[0]))].map(u => `${u}?rule=$_59.AUTO`)
    const privado = /Privater Nutzer|Privat(e|er)? Anbieter/i.test(html)
    return {
        portal: "kleinanzeigen", id: item.id, url: item.url,
        titulo, marca: detalle("Marke") ?? "", modelo: detalle("Modell") ?? "", version: titulo,
        precio: num(stripHtml(/id="viewad-price"[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "")) ?? item.precio,
        precio_neto: null,
        km: num(detalle("Kilometerstand")), anio: ezm ? Number(ezm[1]) : null, mes: mes ?? null,
        cv: num(detalle("Leistung")), cc: null, co2: num(detalle("CO₂-Emissionen") ?? detalle("CO2-Emissionen")),
        combustible: detalle("Kraftstoffart"), carroceria: detalle("Fahrzeugtyp"), cambio: detalle("Getriebe"),
        descripcion,
        vendedor_tipo: privado ? "particular" : "concesionario",
        vendedor_nombre: stripHtml(/class="text-body-regular-strong text-force-linebreak userprofile-vip"[^>]*>([\s\S]*?)<\//.exec(html)?.[1] ?? "") || null,
        ciudad: stripHtml(/id="viewad-locality"[^>]*>([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "") || null, pais: "DE",
        fotos, mediana_portal: null,
    }
}

// --- España: Wallapop y AutoScout24.es -----------------------------------------------------------------------------------

/** Anuncios de Wallapop (particulares sobre todo) del modelo y años indicados */
export async function comparablesWallapop(b: Busqueda, anioMin: number | null, anioMax: number | null): Promise<Comparable[]> {
    const out: Comparable[] = []
    for (const modelo of b.modelos.length ? b.modelos : [""]) {
        const q = new URLSearchParams({
            category_id: "100", source: "search_box", latitude: "41.47", longitude: "2.08", order_by: "most_relevance",
            keywords: [b.marca, modelo, ...b.palabras_version].join(" "),
        })
        if (anioMin) q.set("min_year", String(anioMin))
        if (anioMax) q.set("max_year", String(anioMax))
        const res = await get(`https://api.wallapop.com/api/v3/search?${q}`, { Origin: "https://es.wallapop.com", Referer: "https://es.wallapop.com/", "X-DeviceOS": "0", Accept: "application/json", "Accept-Language": "es-ES" })
        if (!res.ok) throw new Error(`Wallapop HTTP ${res.status}`)
        const items = ((await res.json()) as any)?.data?.section?.payload?.items ?? []
        for (const it of items) {
            const ta = it.type_attributes ?? {}
            const texto = `${it.title ?? ""} ${ta.version ?? ""}`.toLowerCase()
            if (b.palabras_version.some(p => !tienePalabra(texto, p))) continue
            if (ta.brand && ta.brand.toLowerCase() !== b.marca.toLowerCase()) continue
            const precio = num(it.price?.amount)
            if (!precio) continue
            out.push({
                fuente: "wallapop", url: `https://es.wallapop.com/item/${it.web_slug}`, titulo: `${it.title} · ${ta.version ?? ""}`.trim(),
                precio, anio: num(ta.year), km: num(ta.km), cv: num(ta.horsepower),
                particular: !it.is_top_profile,
                dias_publicado: it.created_at ? Math.round((Date.now() - Number(it.created_at)) / 86_400_000) : null,
            })
        }
        await pausa()
    }
    return out
}

/** Anuncios de AutoScout24.es (concesionarios sobre todo) */
export async function comparablesAutoscoutEs(b: Busqueda, anioMin: number | null, anioMax: number | null): Promise<Comparable[]> {
    const out: Comparable[] = []
    for (const modelo of b.modelos.length ? b.modelos : [""]) {
        for (let p = 1; p <= 2; p++) {
            const res = await get(as24Url("www.autoscout24.es", b, modelo, p, "E", [anioMin, anioMax]), { "Accept-Language": "es-ES" })
            if (!res.ok) throw new Error(`AutoScout24.es HTTP ${res.status}`)
            const pp = nextData(await res.text()).props.pageProps
            for (const l of listaAutoscout(pp.listings, "www.autoscout24.es")) {
                if (encajaEnBusqueda({ ...b, km_max: null, precio_max: null, anio_min: null, anio_max: null, cv_min: null, combustibles: [] }, l)) continue
                if (!l.precio) continue
                out.push({ fuente: "autoscout24.es", url: l.url, titulo: l.titulo, precio: l.precio, anio: l.anio, km: l.km, cv: l.cv, particular: l.particular, dias_publicado: null })
            }
            await pausa()
            if (p >= (pp.numberOfPages ?? 1)) break
        }
    }
    return out
}

export type { ListaAS, ListaKA }
