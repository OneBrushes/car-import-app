/**
 * Búsqueda automática de coches de NorDrive. Se ejecuta en el PC con Windows (Programador de tareas, 02:00).
 *
 *   npx tsx tools/buscador/run.ts                         → búsquedas activas de Supabase, guarda candidatos
 *   npx tsx tools/buscador/run.ts --simular               → no guarda nada; deja un informe en tools/buscador/informes/
 *   npx tsx tools/buscador/run.ts --simular --busquedas tools/buscador/busquedas-ejemplo.json
 *   opciones: --max-fichas 150 · --sin-ia (salta la lectura con IA) · --por-busqueda 40
 *
 * Variables (tools/buscador/.env, no se sube a git): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Por cada búsqueda: AutoScout24.de + Kleinanzeigen → filtro de la lista → ficha (4–8 s entre páginas) → filtro duro
 * (palabras de alarma, carrocería, descripción, lista negra, posible fraude) → IA (suscripción, claude -p) →
 * mercado en España (Wallapop + AutoScout24.es) → impuesto con las tablas de Hacienda → candidato si beneficio > 3.000 €
 * y facilidad ≤ 3. mobile.de no se toca aquí (bloquea al navegador automatizado): lo revisa Claude en Chrome.
 */
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { normalizeImportCostSettings, IMPORT_COSTS_SETTING_KEY, type ImportCostSettings } from "../../lib/import-costs"
import { computeClaudeCar, type ClaudeCarFields } from "../../lib/claude-cars"
import { buscarValorHacienda, needsVersionCheck, HACIENDA_MIN_SCORE } from "../../lib/hacienda"
import { filtroDuro, medianaMercado, type ListaNegra } from "../../lib/buscador/filtro"
import { estudiarMercado, type EstudioMercado } from "../../lib/buscador/mercado"
import { motivosGravesIA, type LecturaIA } from "../../lib/buscador/ia"
import type { Anuncio, Busqueda, Comparable } from "../../lib/buscador/tipos"
import { imageSize } from "../../lib/image-size"
import {
    buscarAutoscout24, buscarKleinanzeigen, comparablesAutoscoutEs, comparablesWallapop, encajaEnBusqueda,
    fichaAutoscout24, fichaKleinanzeigen, pausa, type ListaAS, type ListaKA,
} from "./fuentes"
import { leerAnuncio, MODELO_IA } from "./claude-cli"

const here = path.dirname(fileURLToPath(import.meta.url))
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const flag = (n: string) => process.argv.includes(n)

const SIMULAR = flag("--simular")
const SIN_IA = flag("--sin-ia")
const MAX_FICHAS = Number(arg("--max-fichas") ?? 150)
const POR_BUSQUEDA = Number(arg("--por-busqueda") ?? 60)
export const BENEFICIO_MIN = 3000
export const FACILIDAD_MAX = 3
const PHOTOS_BUCKET = "coches-claude"
const MAX_FOTOS = 15

function cargarEnv() {
    const f = path.join(here, ".env")
    if (!fs.existsSync(f)) return
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
}

type Resultado = { portal: string; url: string; titulo: string; precio: number | null; resultado: "candidato" | "descartado" | "error" | "ya visto"; motivo: string; detalle?: Record<string, unknown> }

const eur = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("es-ES")} €`)
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString("es-ES"), ...a)

async function main() {
    cargarEnv()
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en tools/buscador/.env")
    const client = createClient(url, key, { auth: { persistSession: false } })

    const busquedas = await cargarBusquedas(client)
    const { data: s } = await client.from("company_settings").select("value").eq("key", IMPORT_COSTS_SETTING_KEY).maybeSingle()
    const settings = normalizeImportCostSettings(s?.value)
    const negra = cargarListaNegra()
    const owner = SIMULAR ? null : await duenio(client)

    log(`${SIMULAR ? "SIMULACIÓN · " : ""}${busquedas.length} búsqueda(s) · máx. ${MAX_FICHAS} fichas · IA ${SIN_IA ? "desactivada" : MODELO_IA}`)
    const resultados: Resultado[] = []
    const errores: string[] = []
    let fichas = 0
    const inicio = new Date()

    for (const b of busquedas) {
        if (fichas >= MAX_FICHAS) break
        log(`== ${b.nombre}`)
        // 1) Listas de Alemania
        let listaAS: ListaAS[] = [], listaKA: ListaKA[] = []
        try { listaAS = await buscarAutoscout24(b) } catch (e) { errores.push(`${b.nombre} · AutoScout24: ${msg(e)}`) }
        try { listaKA = await buscarKleinanzeigen(b) } catch (e) { errores.push(`${b.nombre} · Kleinanzeigen: ${msg(e)}`) }
        log(`   lista: ${listaAS.length} AutoScout24 · ${listaKA.length} Kleinanzeigen`)

        // 2) Filtro con lo que se ve en la lista
        const pendientesAS = listaAS.filter(l => !l.url.includes("/smyle/")).filter(l => {
            const fuera = encajaEnBusqueda(b, l)
            return !fuera
        })
        const pendientesKA = listaKA.filter(l => !encajaEnBusqueda(b, { titulo: l.titulo, version: "", anio: null, km: null, precio: l.precio, cv: null, combustible: null }))
        const vistos = await anunciosVistos(client, [...pendientesAS.map(l => ["autoscout24", l.id]), ...pendientesKA.map(l => ["kleinanzeigen", l.id])] as [string, string][])
        const cola: { portal: "autoscout24" | "kleinanzeigen"; item: ListaAS | ListaKA }[] = [
            ...pendientesAS.map(item => ({ portal: "autoscout24" as const, item })),
            ...pendientesKA.map(item => ({ portal: "kleinanzeigen" as const, item })),
        ].filter(({ portal, item }) => {
            const v = vistos.get(`${portal}:${item.id}`)
            if (v && v === String(item.precio ?? "")) { resultados.push({ portal, url: item.url, titulo: item.titulo, precio: item.precio, resultado: "ya visto", motivo: "visto antes con el mismo precio" }); return false }
            return true
        }).slice(0, POR_BUSQUEDA)
        log(`   para abrir: ${cola.length} ficha(s) (${listaAS.length + listaKA.length - pendientesAS.length - pendientesKA.length} no encajan en la búsqueda)`)

        // 3) Mercado alemán de referencia (para "posible fraude"): precios de la lista de AutoScout24
        const referencia: Anuncio[] = pendientesAS.map(l => ({ precio: l.precio, anio: l.anio } as Anuncio))

        // 4) Comparables de España (una vez por búsqueda)
        let comparables: Comparable[] = []
        try {
            const aMin = b.anio_min ? b.anio_min - 1 : null, aMax = b.anio_max ? b.anio_max + 1 : null
            comparables = [...await comparablesWallapop(b, aMin, aMax), ...await comparablesAutoscoutEs(b, aMin, aMax)]
            log(`   España: ${comparables.filter(c => c.fuente === "wallapop").length} Wallapop · ${comparables.filter(c => c.fuente === "autoscout24.es").length} AutoScout24.es`)
        } catch (e) { errores.push(`${b.nombre} · España: ${msg(e)}`) }

        // 5) Fichas
        for (const { portal, item } of cola) {
            if (fichas >= MAX_FICHAS) break
            await pausa()
            fichas++
            let an: Anuncio
            try {
                an = portal === "autoscout24" ? await fichaAutoscout24(item as ListaAS) : await fichaKleinanzeigen(item as ListaKA)
            } catch (e) {
                resultados.push({ portal, url: item.url, titulo: item.titulo, precio: item.precio, resultado: "error", motivo: msg(e) })
                continue
            }
            const r = await evaluar(client, an, b, referencia, comparables, settings, negra, owner)
            resultados.push(r)
            log(`   ${r.resultado === "candidato" ? "★" : "·"} ${an.titulo.slice(0, 60)} · ${eur(an.precio)} → ${r.resultado}${r.motivo ? `: ${r.motivo}` : ""}`)
            if (!SIMULAR) await marcarVisto(client, an, b, r)
        }
        if (!SIMULAR) await client.from("busquedas").update({ ultima_ejecucion: new Date().toISOString() }).eq("id", b.id)
    }

    // Resumen
    const descartes: Record<string, number> = {}
    for (const r of resultados.filter(x => x.resultado === "descartado")) {
        const clave = motivoCorto(r.motivo)
        descartes[clave] = (descartes[clave] ?? 0) + 1
    }
    const candidatos = resultados.filter(r => r.resultado === "candidato")
    const resumen = { inicio: inicio.toISOString(), fin: new Date().toISOString(), simulacion: SIMULAR, busquedas: busquedas.length, fichas_vistas: fichas, candidatos: candidatos.length, descartes, errores, detalle: resultados }
    if (!SIMULAR) {
        const { error } = await client.from("ejecuciones").insert(resumen)
        if (error) console.error("No se pudo guardar la ejecución:", error.message)
    }
    const dir = path.join(here, "informes")
    fs.mkdirSync(dir, { recursive: true })
    const informe = path.join(dir, `${inicio.toISOString().slice(0, 16).replace(/[:T]/g, "-")}${SIMULAR ? "-simulacion" : ""}.json`)
    fs.writeFileSync(informe, JSON.stringify(resumen, null, 2))
    log(`Fin: ${fichas} fichas · ${candidatos.length} candidato(s) · descartes ${JSON.stringify(descartes)}${errores.length ? ` · ${errores.length} error(es)` : ""}`)
    log(`Informe: ${informe}`)
}

/** Evalúa una ficha: filtro duro → IA → mercado en España → impuesto y beneficio → candidato o descartado */
async function evaluar(
    client: SupabaseClient, an: Anuncio, b: Busqueda, referencia: Anuncio[], comparables: Comparable[],
    settings: ImportCostSettings, negra: ListaNegra, owner: string | null,
): Promise<Resultado> {
    const base = { portal: an.portal, url: an.url, titulo: an.titulo, precio: an.precio }
    const fuera = encajaEnBusqueda(b, an)
    if (fuera) return { ...base, resultado: "descartado", motivo: `no encaja: ${fuera}` }

    const mercadoDE = medianaMercado(an, referencia)
    const duro = filtroDuro(an, b, mercadoDE, negra)
    if (!duro.pasa) return { ...base, resultado: "descartado", motivo: duro.motivos.join("; "), detalle: { alarmas: duro.alarmas } }

    let lectura: LecturaIA | null = null
    if (!SIN_IA) {
        try { lectura = await leerAnuncio(an) } catch (e) { return { ...base, resultado: "error", motivo: `IA: ${msg(e)}` } }
        const graves = motivosGravesIA(lectura)
        if (graves.length) return { ...base, resultado: "descartado", motivo: graves.join("; "), detalle: { ia: lectura } }
    }

    const estudio = estudiarMercado(comparables, { anio: an.anio, km: an.km })
    if (!estudio.ok) return { ...base, resultado: "descartado", motivo: estudio.motivo!, detalle: { ia: lectura } }

    // Impuesto: valor de las tablas de Hacienda; sin CO2 conocido se usa el tramo más alto (conservador)
    const hacienda = await buscarValorHacienda(client, { marca: an.marca || b.marca, modelo: an.modelo || b.modelos[0] || "", version: an.version, anio: an.anio, cc: an.cc, cv: an.cv, combustible: an.combustible }, 5)
    const mejor = hacienda.matches[0]
    const usarHacienda = mejor && mejor.parecido >= HACIENDA_MIN_SCORE
    const co2Desconocido = an.co2 == null
    const campos: ClaudeCarFields = {
        url: an.url, marca: an.marca || b.marca, modelo: an.modelo || b.modelos[0] || null, version: an.version, anio: an.anio, mes_matriculacion: an.mes,
        km: an.km, potencia_cv: an.cv, combustible: an.combustible, precio_alemania: an.precio, precio_neto: an.precio_neto,
        tipo_vendedor: an.vendedor_tipo, nombre_vendedor: an.vendedor_nombre, co2: an.co2 ?? 200,
        valor_hacienda: usarHacienda ? mejor.valor : null,
        precio_venta_estimado_espana: estudio.precio_venta,
        duenos: lectura?.duenos ?? null, unfallfrei: lectura?.accidente === false ? true : null,
    }
    const calc = computeClaudeCar(campos, settings)
    const detalle = { ia: lectura, mercado: resumenMercado(estudio), hacienda: usarHacienda ? `${mejor.modelo} (${mejor.parecido}/100)` : null, coste: calc.coste_total_espana, beneficio: calc.beneficio, facilidad: estudio.facilidad }

    if (calc.beneficio == null || calc.beneficio <= BENEFICIO_MIN) return { ...base, resultado: "descartado", motivo: `beneficio ${eur(calc.beneficio)} ≤ ${eur(BENEFICIO_MIN)} (venta ${eur(estudio.precio_venta)}, coste ${eur(calc.coste_total_espana)})`, detalle }
    if (estudio.facilidad == null || estudio.facilidad > FACILIDAD_MAX) return { ...base, resultado: "descartado", motivo: `facilidad de venta ${estudio.facilidad ?? "sin datos"} > ${FACILIDAD_MAX} (mediana ${estudio.dias_mediana ?? "?"} días publicados)`, detalle }

    if (!SIMULAR && owner) {
        try { await guardarCandidato(client, owner, an, campos, calc, estudio, lectura, hacienda.matches, co2Desconocido, b) } catch (e) { return { ...base, resultado: "error", motivo: `guardando: ${msg(e)}`, detalle } }
    }
    return { ...base, resultado: "candidato", motivo: `beneficio ${eur(calc.beneficio)} · facilidad ${estudio.facilidad}`, detalle }
}

function resumenMercado(e: EstudioMercado) {
    return {
        precio_venta: e.precio_venta, base: e.base, dias_mediana: e.dias_mediana, facilidad: e.facilidad,
        comparables: e.comparables.slice(0, 12).map(c => `${c.fuente} · ${eur(c.precio)} · ${c.anio ?? "?"} · ${c.km != null ? `${c.km.toLocaleString("es-ES")} km` : "? km"}${c.particular ? " · particular" : ""}${c.dias_publicado != null ? ` · ${c.dias_publicado} d` : ""} · ${c.url}`),
    }
}

async function guardarCandidato(
    client: SupabaseClient, owner: string, an: Anuncio, campos: ClaudeCarFields, calc: ReturnType<typeof computeClaudeCar>,
    e: EstudioMercado, lectura: LecturaIA | null, matches: Awaited<ReturnType<typeof buscarValorHacienda>>["matches"], co2Desconocido: boolean, b: Busqueda,
) {
    const notas = [
        `Encontrado por la búsqueda automática «${b.nombre}» (${an.portal}) el ${new Date().toLocaleDateString("es-ES")}.`,
        "",
        `ANUNCIO: ${an.titulo} · ${eur(an.precio)}${an.precio_neto ? ` (neto ${eur(an.precio_neto)})` : ""} · ${an.km?.toLocaleString("es-ES") ?? "?"} km · ${an.mes ? `${an.mes}/` : ""}${an.anio ?? "?"} · ${an.cv ?? "?"} CV · ${an.vendedor_tipo ?? "?"} en ${an.ciudad ?? "?"}`,
        lectura ? `IA: ${[lectura.duenos != null ? `${lectura.duenos} dueño(s)` : null, lectura.itv_hasta ? `HU hasta ${lectura.itv_hasta}` : null, lectura.accidente === false ? "sin accidentes" : null].filter(Boolean).join(" · ") || "sin datos destacados"}` : "IA: no se ha leído",
        ...(lectura?.alertas ?? []).map(a => `  · ${a.tipo}: «${a.cita_exacta}»`),
        "",
        `ESPAÑA: venta estimada ${eur(e.precio_venta)} (percentil 25 de ${e.base}, ${e.comparables.length} comparables, mediana ${e.dias_mediana ?? "?"} días publicados)`,
        ...e.comparables.slice(0, 10).map(c => `  · ${c.fuente} ${eur(c.precio)} · ${c.anio ?? "?"} · ${c.km?.toLocaleString("es-ES") ?? "?"} km${c.particular ? " · particular" : ""} · ${c.url}`),
        "",
        `CÁLCULO: coste en España ${eur(calc.coste_total_espana)} · beneficio ${eur(calc.beneficio)} (${calc.margen_pct ?? "?"} %)`,
        `Impuesto: ${matches[0] ? `valor Hacienda ${eur(matches[0].valor)} (${matches[0].modelo}, parecido ${matches[0].parecido}/100)` : "sin valor de tablas: base = precio de compra"}${co2Desconocido ? " · CO2 desconocido: calculado con el tramo más alto, revisar" : ""}`,
    ].join("\n")
    const row = {
        ...campos, ...calc, user_id: owner, estado: "candidato", notas,
        facilidad_venta: e.facilidad, facilidad_venta_motivo: `Mediana de ${e.dias_mediana ?? "?"} días publicados en España (${e.comparables.length} comparables)`,
        valor_hacienda_origen: campos.valor_hacienda ? "tabla" : null,
        valor_hacienda_version: matches[0] ? `${matches[0].marca} ${matches[0].modelo}` : null,
        verificar_version: needsVersionCheck(matches),
        updated_at: new Date().toISOString(),
    }
    const { data, error } = await client.from("coches_claude").upsert(row, { onConflict: "url" }).select("id").single()
    if (error) throw new Error(error.message)
    const fotos = await subirFotos(client, data.id, an.fotos.slice(0, MAX_FOTOS))
    if (fotos.length) await client.from("coches_claude").update({ fotos, foto_url: fotos[0] }).eq("id", data.id)
}

/** Descarga las fotos desde este PC y las sube a Supabase Storage (coches-claude/<id>/) */
async function subirFotos(client: SupabaseClient, carId: string, urls: string[]): Promise<string[]> {
    const out: string[] = []
    const prefix = `${process.env.SUPABASE_URL!.replace(/\/+$/, "")}/storage/v1/object/public/${PHOTOS_BUCKET}/`
    for (const u of urls) {
        try {
            const res = await fetch(u, { signal: AbortSignal.timeout(20_000) })
            if (!res.ok) continue
            const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]
            const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"
            const bytes = new Uint8Array(await res.arrayBuffer())
            const size = imageSize(bytes)
            const file = `${carId}/${crypto.createHash("sha256").update(u).digest("hex").slice(0, 32)}${size ? `-${size.width}x${size.height}` : ""}.${ext}`
            const { error } = await client.storage.from(PHOTOS_BUCKET).upload(file, bytes, { contentType: type, upsert: true, cacheControl: "31536000" })
            if (!error) out.push(prefix + file)
        } catch { /* foto que no baja: se salta */ }
    }
    return out
}

async function cargarBusquedas(client: SupabaseClient): Promise<Busqueda[]> {
    const file = arg("--busquedas")
    const norm = (b: Partial<Busqueda>): Busqueda => ({
        id: b.id ?? crypto.randomUUID(), nombre: b.nombre ?? `${b.marca} ${(b.modelos ?? []).join("/")}`, marca: b.marca ?? "", modelos: b.modelos ?? [],
        palabras_version: b.palabras_version ?? [], anio_min: b.anio_min ?? null, anio_max: b.anio_max ?? null, km_max: b.km_max ?? null,
        precio_max: b.precio_max ?? null, cv_min: b.cv_min ?? null, combustibles: b.combustibles ?? [], carrocerias_excluidas: b.carrocerias_excluidas ?? [], activa: b.activa ?? true,
    })
    if (file) return (JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Busqueda>[]).map(norm)
    const { data, error } = await client.from("busquedas").select("*").eq("activa", true).order("ultima_ejecucion", { ascending: true, nullsFirst: true })
    if (error) throw new Error(`busquedas: ${error.message} (¿has ejecutado supabase/2026-11_busquedas.sql?)`)
    return (data ?? []).map(norm)
}

function cargarListaNegra(): ListaNegra {
    const f = path.join(here, "lista-negra.json")
    try { return { vendedores: [], ciudades: [], ...JSON.parse(fs.readFileSync(f, "utf8")) } } catch { return { vendedores: [], ciudades: [] } }
}

async function duenio(client: SupabaseClient): Promise<string> {
    const { data, error } = await client.from("mcp_config").select("owner_id").maybeSingle()
    if (error || !data?.owner_id) throw new Error(`mcp_config sin dueño: ${error?.message ?? "vacío"}`)
    return data.owner_id
}

async function anunciosVistos(client: SupabaseClient, ids: [string, string][]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (!ids.length) return map
    const { data, error } = await client.from("anuncios_vistos").select("portal, anuncio_id, precio_hash").in("anuncio_id", ids.map(i => i[1]))
    if (error) return map // tabla aún no creada: no se repite nada que saber
    for (const r of data ?? []) map.set(`${r.portal}:${r.anuncio_id}`, r.precio_hash ?? "")
    return map
}

async function marcarVisto(client: SupabaseClient, an: Anuncio, b: Busqueda, r: Resultado) {
    await client.from("anuncios_vistos").upsert({
        portal: an.portal, anuncio_id: an.id, url: an.url, precio_hash: String(an.precio ?? ""), busqueda_id: b.id,
        resultado: r.resultado, motivo: r.motivo.slice(0, 500), visto_en: new Date().toISOString(),
    })
}

/** Motivo para agrupar: sin importes ni detalles ("beneficio -4998 € ≤ 3000 €" → "beneficio insuficiente") */
export function motivoCorto(m: string): string {
    const primero = m.split(";")[0].trim()
    if (primero.startsWith("beneficio")) return "beneficio ≤ 3.000 €"
    if (primero.startsWith("facilidad")) return "facilidad de venta > 3"
    if (primero.startsWith("pocos datos")) return "pocos datos en España"
    if (primero.startsWith("posible fraude")) return "posible fraude"
    return primero.replace(/\s*\(.*$/, "").replace(/«.*$/, "").trim()
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

main().catch(e => { console.error(msg(e)); process.exit(1) })
