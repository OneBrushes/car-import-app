/**
 * Precios medios de venta de Hacienda (Orden HAC/1501/2025, anexo I, turismos y todoterrenos; tabla valores_hacienda).
 * Es el "valor de tablas" del coche nuevo con el que se calcula el impuesto de matriculación (IEDMT) de un usado importado:
 * calculateImportCost() le aplica el % de antigüedad del anexo IV y la minoración.
 *
 * Lo comparten la app, el Worker del MCP y scripts/import-hacienda.ts: no importa el cliente de Supabase.
 */
/** Lo justo del cliente de Supabase (la app y el Worker tienen cada uno su copia de supabase-js) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface HaciendaDb { from: (table: string) => any; rpc: (fn: string) => any }

export const HACIENDA_TABLE = "valores_hacienda"
export const HACIENDA_EJERCICIO = 2026

export interface HaciendaRow {
    marca: string
    /** Modelo-Tipo tal como sale en el BOE, p. ej. "GOLF 2.0 TSI R 4Motion DSG" */
    modelo: string
    /** Periodo comercial: año de inicio y de fin (null = se sigue vendiendo) */
    inicio: number | null
    fin: number | null
    cc: number | null
    cilindros: number | null
    /** G, D, Elc, PHEV, GyE, DyE… */
    combustible: string | null
    kw: number | null
    cvf: number | null
    cv: number | null
    /** Valor en euros del coche nuevo */
    valor: number
}

export interface HaciendaQuery {
    marca: string
    modelo: string
    /** Versión o acabado (p. ej. "Mercedes-AMG E 43 4MATIC"): se busca también sola */
    version?: string | null
    anio?: number | null
    cc?: number | null
    cv?: number | null
    /** Gasolina, Diésel, Híbrido, Eléctrico… (opcional, ayuda a desempatar) */
    combustible?: string | null
}

export interface HaciendaMatch extends HaciendaRow {
    /** 0–100: lo que se parece a lo buscado */
    parecido: number
    /** Qué encaja y qué no, para poder verificarlo */
    motivo: string
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()

/** "Mercedes-Benz" → "MERCEDESBENZ" (para comparar marcas) */
export const normalizeBrand = (s: string) => strip(s).replace(/[^A-Z0-9]/g, "")

/** Nombres habituales → cómo los escribe el BOE (por prefijo normalizado) */
const BRAND_ALIASES: Record<string, string> = {
    VW: "VOLKSWAGEN",
    MERCEDES: "MERCEDES",
    MB: "MERCEDES",
    ALFA: "ALFAROMEO",
    LANDROVER: "LANDROVER",
    RANGEROVER: "LANDROVER",
    MINI: "MINI",
    CITROEN: "CITROEN",
    SKODA: "SKODA",
    SEAT: "SEAT",
    CUPRA: "CUPRA",
    DS: "DS",
}

export function brandKey(marca: string): string {
    const n = normalizeBrand(marca)
    for (const [alias, real] of Object.entries(BRAND_ALIASES)) if (n === alias || n.startsWith(alias)) return real
    return n
}

/** Palabras de un nombre de modelo: "Golf R 2.0 TSI 4Motion DSG" → ["GOLF","R","2.0","TSI","4MOTION","DSG"] */
export function modelTokens(s: string): string[] {
    return strip(s)
        .replace(/(\d),(\d)/g, "$1.$2")
        .replace(/[^A-Z0-9.]+/g, " ")
        .split(" ")
        .map(t => t.replace(/^\.+|\.+$/g, ""))
        .filter(Boolean)
}

/** Texto que los anuncios ponen y el BOE no: "Clase E", "Mercedes-AMG E 43", "E-Klasse"… */
const MODEL_NOISE: RegExp[] = [/\bMERCEDES[\s-]*(AMG|BENZ)\b/g, /\bMERCEDES\b/g, /\bCLASE\s+/g, /[\s-]KLASSE\b/g, /\bKLASSE\s+/g]

/**
 * Limpia un nombre de modelo antes de buscar: quita "Clase ", "Mercedes-AMG", "Mercedes-Benz", la propia marca y las
 * palabras repetidas. "Clase E Mercedes-AMG E 43 4MATIC" → "E 43 4MATIC"
 */
export function cleanModelText(text: string, marca?: string | null): string {
    let s = strip(text)
    for (const re of MODEL_NOISE) s = s.replace(re, " ")
    if (marca) {
        const b = strip(marca).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        s = s.replace(new RegExp(`(^|\\s)${b}(?=\\s|$)`, "g"), " ")
    }
    const seen = new Set<string>()
    return s.split(/\s+/).filter(t => t && !seen.has(t) && !!seen.add(t)).join(" ")
}

/** Textos con los que se busca: modelo + versión, solo la versión y solo el modelo (ya limpios, sin repetir) */
export function modelVariants(q: Pick<HaciendaQuery, "marca" | "modelo" | "version">): string[] {
    const full = cleanModelText([q.modelo, q.version].filter(Boolean).join(" "), q.marca)
    const version = q.version ? cleanModelText(q.version, q.marca) : ""
    const model = cleanModelText(q.modelo, q.marca)
    return [...new Set([full, version, model].filter(Boolean))]
}

/** Palabras que no distinguen versiones (se ignoran al comparar) */
const NOISE = new Set(["AUT", "AUTO", "MAN", "CV", "KW", "PS", "E6", "E6D", "4P", "5P", "3P", "2P"])

const FUEL_CODES: Record<string, string[]> = {
    gasolina: ["G", "M", "S"], diesel: ["D"], electrico: ["ELC", "E"], hibrido: ["GYE", "DYE", "SYE", "PHEV"],
    enchufable: ["PHEV"], phev: ["PHEV"], gas: ["GLP", "GNC", "SYE"], glp: ["GLP"],
}

function fuelMatches(query: string | null | undefined, code: string | null): boolean | null {
    if (!query || !code) return null
    const q = strip(query).toLowerCase()
    const c = code.toUpperCase()
    for (const [word, codes] of Object.entries(FUEL_CODES)) if (q.includes(word)) return codes.includes(c)
    return null
}

/**
 * Ordena las versiones del BOE por parecido con el coche buscado (la primera es la más parecida). Prueba cada variante del
 * nombre (modelVariants) y se queda con el mejor parecido de cada fila; las variantes parciales restan 3 para que, a igualdad,
 * gane la del nombre completo.
 */
export function rankHaciendaRows(rows: HaciendaRow[], q: HaciendaQuery): HaciendaMatch[] {
    const variants = modelVariants(q)
    if (!variants.length) return []
    const best = new Map<HaciendaRow, HaciendaMatch & { row: HaciendaRow }>()
    variants.forEach((modelo, i) => {
        for (const m of rankOne(rows, { ...q, modelo })) {
            const scored = i === 0 ? m : { ...m, parecido: Math.max(0, m.parecido - 3), motivo: `${m.motivo} · buscado como "${modelo}"` }
            const prev = best.get(m.row)
            if (!prev || scored.parecido > prev.parecido) best.set(m.row, scored)
        }
    })
    return [...best.values()]
        .map(({ row: _row, ...m }) => m as HaciendaMatch)
        .sort((a, b) => b.parecido - a.parecido || Math.abs((a.fin ?? 9999) - (q.anio ?? 0)) - Math.abs((b.fin ?? 9999) - (q.anio ?? 0)))
}

/** Parecido de cada fila con un nombre de modelo ya limpio */
function rankOne(rows: HaciendaRow[], q: HaciendaQuery): (HaciendaMatch & { row: HaciendaRow })[] {
    const qTokens = modelTokens(q.modelo).filter(t => !NOISE.has(t))
    const family = qTokens[0]
    return rows
        .map(row => {
            const rTokens = new Set(modelTokens(row.modelo))
            const why: string[] = []
            let score = 100

            // Modelo: la primera palabra (Golf, Serie, C…) debe salir; el resto suma
            if (family && !rTokens.has(family)) { score -= 45; why.push(`no es ${family}`) }
            const rest = qTokens.slice(1)
            if (rest.length) {
                const hits = rest.filter(t => rTokens.has(t)).length
                score -= Math.round(30 * (1 - hits / rest.length))
                why.push(`modelo ${hits}/${rest.length} palabras`)
            }

            // Año dentro del periodo comercial
            if (q.anio && row.inicio == null) {
                score -= 5; why.push("periodo sin indicar en el BOE")
            } else if (q.anio && row.inicio != null) {
                const end = row.fin ?? 9999
                const off = q.anio < row.inicio ? row.inicio - q.anio : q.anio > end ? q.anio - end : 0
                if (off) { score -= Math.min(25, 8 * off); why.push(`periodo ${row.inicio}–${row.fin ?? "hoy"} (fuera ${off} año${off > 1 ? "s" : ""})`) }
                else why.push(`periodo ${row.inicio}–${row.fin ?? "hoy"} ✓`)
            }

            // Potencia: lo que más distingue versiones del mismo modelo
            if (q.cv && row.cv) {
                const diff = Math.abs(row.cv - q.cv)
                score -= Math.min(30, Math.round(diff / 3))
                why.push(diff <= 5 ? `${row.cv} CV ✓` : `${row.cv} CV (buscado ${q.cv})`)
            }
            if (q.cc && row.cc) {
                const diff = Math.abs(row.cc - q.cc)
                score -= Math.min(15, Math.round(diff / 50))
                why.push(diff <= 60 ? `${row.cc} cc ✓` : `${row.cc} cc (buscado ${q.cc})`)
            }
            const fuel = fuelMatches(q.combustible, row.combustible)
            if (fuel === false) { score -= 15; why.push(`combustible ${row.combustible}`) }

            return { ...row, row, parecido: Math.max(0, score), motivo: why.join(" · ") }
        })
}

/** Por debajo de esto no se usa el valor solo (mejor no tener valor que uno de otro coche) */
export const HACIENDA_MIN_SCORE = 60

/**
 * ¿Hay que verificar la versión? Sí si la más parecida no destaca: otra versión con un valor distinto se le parece casi
 * igual, o el parecido no es alto.
 */
export function needsVersionCheck(matches: HaciendaMatch[]): boolean {
    const [best, second] = matches
    if (!best) return false
    if (best.parecido < 85) return true
    return !!second && best.parecido - second.parecido < 8 && Math.abs(second.valor - best.valor) > best.valor * 0.03
}

/** Busca en valores_hacienda las versiones que encajan con el coche, ordenadas por parecido */
export async function buscarValorHacienda(
    client: HaciendaDb,
    q: HaciendaQuery,
    limit = 10,
): Promise<{ matches: HaciendaMatch[]; marcas: string[]; error?: string }> {
    const key = brandKey(q.marca)
    if (!key) return { matches: [], marcas: [], error: "Falta la marca" }
    const { data: brandRows, error: brandError } = await client.rpc("hacienda_marcas")
    if (brandError) return { matches: [], marcas: [], error: brandError.message }
    const marcas = ((brandRows ?? []) as { marca: string }[]).map(r => r.marca).filter(m => normalizeBrand(m).startsWith(key) || key.startsWith(normalizeBrand(m)))
    if (!marcas.length) return { matches: [], marcas: [], error: `La marca "${q.marca}" no está en las tablas de Hacienda` }

    // Se piden las filas de la primera palabra de cada variante ("E" de "E 43 4MATIC", "GOLF"…); si no sale ninguna, todas las del año
    const families = [...new Set(modelVariants(q).map(v => modelTokens(v).filter(t => !NOISE.has(t))[0]).filter(Boolean))]
    const fetchRows = async (family: string | null) => {
        let query = client.from(HACIENDA_TABLE).select("marca, modelo, inicio, fin, cc, cilindros, combustible, kw, cvf, cv, valor")
            .eq("ejercicio", HACIENDA_EJERCICIO).in("marca", marcas).limit(3000)
        if (q.anio) query = query.or(`inicio.is.null,inicio.lte.${q.anio + 2}`).or(`fin.is.null,fin.gte.${q.anio - 2}`)
        if (family) query = query.ilike("modelo", `%${family.replace(/[%_]/g, "")}%`)
        return query as PromiseLike<{ data: HaciendaRow[] | null; error: { message: string } | null }>
    }
    const results = await Promise.all(families.map(fetchRows))
    const failed = results.find(r => r.error)
    if (failed?.error) return { matches: [], marcas, error: failed.error.message }
    const seen = new Set<string>()
    let rows = results.flatMap(r => r.data ?? []).filter(r => {
        const id = `${r.modelo}|${r.inicio}|${r.fin}|${r.cv}|${r.valor}`
        return !seen.has(id) && !!seen.add(id)
    })
    if (!rows.length) {
        const all = await fetchRows(null)
        if (all.error) return { matches: [], marcas, error: all.error.message }
        rows = all.data ?? []
    }
    return { matches: rankHaciendaRows(rows, q).slice(0, limit), marcas }
}
