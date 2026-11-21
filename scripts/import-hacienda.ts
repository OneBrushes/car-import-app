/**
 * Importa los precios medios de venta de Hacienda (Orden HAC/1501/2025, BOE-A-2025-26357, valores 2026) a la tabla
 * `valores_hacienda` de Supabase. Solo la primera sección del anexo I: turismos y todoterrenos.
 *
 * Uso:
 *   npx tsx scripts/import-hacienda.ts                 → descarga el PDF del BOE, lo lee y sube las filas
 *   npx tsx scripts/import-hacienda.ts --pdf ruta.pdf  → usa un PDF ya descargado
 *   npx tsx scripts/import-hacienda.ts --dry --out filas.json → solo lee y guarda en JSON (sin tocar Supabase)
 *
 * Para subir hacen falta SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno.
 * Antes hay que ejecutar supabase/2026-11_valores_hacienda.sql. Volver a ejecutarlo sustituye las filas del mismo ejercicio.
 *
 * Cómo se lee: el PDF tiene 2.219 páginas de tablas. pdftotext desalinea los nombres de modelo y sus datos, así que se
 * leen las coordenadas de cada texto con pdfjs: se agrupan por línea (misma y) y cada número se asigna a la columna cuya
 * cabecera (Inicio, Fin, C.C., N.º de cilind., Tipo de motor, P kW, cvf, cv, Valor) tiene la x más cercana.
 * Los turismos van de la A a la Z; cuando el orden alfabético de marcas vuelve a empezar, empiezan las autocaravanas y se para.
 */
import fs from "node:fs"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { createClient } from "@supabase/supabase-js"
import { normalizeBrand, type HaciendaRow } from "../lib/hacienda"

const BOE_PDF = "https://www.boe.es/boe/dias/2025/12/23/pdfs/BOE-A-2025-26357.pdf"
const EJERCICIO = 2026
const TABLE = "valores_hacienda"

type Col = "inicio" | "fin" | "cc" | "cilindros" | "combustible" | "kw" | "cvf" | "cv" | "valor"
interface Item { x: number; y: number; s: string }

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const flag = (name: string) => process.argv.includes(name)

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."))

/** x de cada columna según las cabeceras de la página (si no hay cabecera, las de la primera página) */
function headerColumns(items: Item[], fallback: Record<Col, number> | null): Record<Col, number> | null {
    const find = (re: RegExp) => items.find(i => re.test(i.s.trim()))?.x
    const inicio = find(/^Inicio$/), fin = find(/^Fin$/), cc = find(/^C\.C\.$/), kw = find(/^P kW$/), cvf = find(/^cvf$/)
    const cv = find(/^cv$/), valor = find(/^Valor$/), cil = find(/^N\.º de$/), motor = find(/^Tipo de$/)
    if ([inicio, fin, cc, kw, cvf, cv, valor].some(v => v == null)) return fallback
    return {
        inicio: inicio!, fin: fin!, cc: cc!, cilindros: cil ?? (cc! + kw!) / 2 - 15, combustible: motor ?? (cc! + kw!) / 2 + 12,
        kw: kw!, cvf: cvf!, cv: cv!, valor: valor!,
    }
}

function lines(items: Item[]): Item[][] {
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
    const out: Item[][] = []
    for (const it of sorted) {
        const last = out.at(-1)
        if (last && Math.abs(last[0].y - it.y) <= 2) last.push(it)
        else out.push([it])
    }
    return out.map(l => l.sort((a, b) => a.x - b.x))
}

/** Palabras de las cabeceras de las tablas */
const HEADER_WORDS = /^(Periodo|comercial|Datos|ficha técnica|Datos ficha técnica|Modelo-Tipo|Inicio|Fin|C\.C\.|N\.º de|cilind\.|Tipo de|motor|de|P kW|cvf|cv|Valor|euros|2026|Inicio Fin|cv Valor)$/

const FUEL = /^(G|D|M|S|H|E|Elc|PHEV|GyE|DyE|SyE|GLP|GNC|Bio)$/i

export async function parseHaciendaPdf(data: Uint8Array, log = console.log): Promise<HaciendaRow[]> {
    const doc = await getDocument({ data, verbosity: 0 }).promise
    const rows: HaciendaRow[] = []
    let cols: Record<Col, number> | null = null
    let brand: string | null = null
    let started = false
    const anomalies: string[] = []

    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const tc = await page.getTextContent()
        const items: Item[] = (tc.items as any[])
            .filter(i => typeof i.str === "string" && i.str.trim())
            .map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }))
        page.cleanup()

        cols = headerColumns(items, cols)
        let pendingName: string[] = []
        let finished = false
        for (const line of lines(items)) {
            // Una página puede tener dos tablas (dos marcas): la marca se lee en su línea
            const brandItem = line.find(i => /^Marca:/.test(i.s))
            if (brandItem) {
                const name = brandItem.s.replace(/^Marca:\s*/, "").trim() || line.find(i => i.x > brandItem.x && !HEADER_WORDS.test(i.s))?.s
                if (name) {
                    // El orden alfabético vuelve a empezar: se acaban los turismos (empiezan las autocaravanas)
                    if (started && brand && normalizeBrand(name) < normalizeBrand(brand) && normalizeBrand(name)[0] < normalizeBrand(brand)[0]) {
                        log(`Fin de turismos en la página ${p} (${brand} → ${name})`)
                        finished = true
                        break
                    }
                    brand = name
                    started = true
                }
                pendingName = []
                continue
            }
            if (!started || !cols) continue
            if (line.every(i => HEADER_WORDS.test(i.s)) || /^(cve:|Verificable|Núm\.|Martes|BOLETÍN)/.test(line[0].s) || /^(cve:|Verificable)/.test(line.at(-1)!.s)) continue
            const modelLimit = cols.inicio - 8
            const name = line.filter(i => i.x < modelLimit).map(i => i.s).join(" ").trim()
            const data = line.filter(i => i.x >= modelLimit)
            if (!data.length) {
                // Nombre largo partido en dos líneas: se une con la línea de datos siguiente
                if (name && !/^(Núm\.|BOLETÍN|Martes|Marca:)/.test(name)) pendingName.push(name)
                continue
            }
            const fields: Partial<Record<Col, string>> = {}
            for (const it of data) {
                // Varias palabras en un mismo item (p. ej. "2200 4"): se separan con su x aproximada
                const parts = it.s.split(/\s+/)
                parts.forEach((part, k) => {
                    const x = it.x + k * 14
                    let best: Col = "inicio", dist = Infinity
                    for (const [c, cx] of Object.entries(cols!) as [Col, number][]) {
                        const d = Math.abs(cx - x)
                        if (d < dist) { dist = d; best = c }
                    }
                    if (FUEL.test(part)) best = "combustible"
                    fields[best] = fields[best] ? `${fields[best]} ${part}` : part
                })
            }
            const fullName = [...pendingName, name].join(" ").replace(/\s+/g, " ").trim()
            pendingName = []
            const valor = fields.valor ? num(fields.valor) : NaN
            const inicio = fields.inicio ? Number(fields.inicio) : NaN
            if (!fullName || !Number.isFinite(valor)) {
                anomalies.push(`p${p}: ${fullName} | ${JSON.stringify(fields)}`)
                continue
            }
            rows.push({
                marca: brand!,
                modelo: fullName,
                inicio: Number.isFinite(inicio) ? inicio : null,
                fin: fields.fin ? Number(fields.fin) : null,
                cc: fields.cc ? Number(fields.cc) || null : null,
                cilindros: fields.cilindros ? Number(fields.cilindros) || null : null,
                combustible: fields.combustible ?? null,
                kw: fields.kw ? num(fields.kw) || null : null,
                cvf: fields.cvf ? num(fields.cvf) || null : null,
                cv: fields.cv ? num(fields.cv) || null : null,
                valor,
            })
        }
        if (finished) break
        if (p % 200 === 0) log(`… página ${p}/${doc.numPages}: ${rows.length} filas (${brand})`)
    }
    if (anomalies.length) {
        log(`${anomalies.length} línea(s) sin leer:`)
        for (const a of anomalies.slice(0, 30)) log("  " + a)
    }
    return rows
}

async function main() {
    const pdfPath = arg("--pdf")
    let data: Uint8Array
    if (pdfPath) data = new Uint8Array(fs.readFileSync(pdfPath))
    else {
        console.log(`Descargando ${BOE_PDF} …`)
        const res = await fetch(BOE_PDF)
        if (!res.ok) throw new Error(`BOE: HTTP ${res.status}`)
        data = new Uint8Array(await res.arrayBuffer())
    }
    const rows = await parseHaciendaPdf(data)
    console.log(`${rows.length} versiones de ${new Set(rows.map(r => r.marca)).size} marcas`)
    const out = arg("--out")
    if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1))
    if (flag("--dry")) return

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")
    const client = createClient(url, key, { auth: { persistSession: false } })
    const del = await client.from(TABLE).delete().eq("ejercicio", EJERCICIO)
    if (del.error) throw new Error(`Borrando ${EJERCICIO}: ${del.error.message}`)
    for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000).map(r => ({ ...r, ejercicio: EJERCICIO }))
        const { error } = await client.from(TABLE).insert(chunk)
        if (error) throw new Error(`Subiendo filas ${i}–${i + chunk.length}: ${error.message}`)
        process.stdout.write(`\r${Math.min(i + 1000, rows.length)}/${rows.length} subidas`)
    }
    console.log("\nListo")
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/import-hacienda.ts")) {
    main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
