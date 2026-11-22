// Filtro duro de la búsqueda automática: descarta sin gastar IA lo que tiene alarmas claras en el texto.
import type { Anuncio, Busqueda } from "./tipos"

export interface Alarma { motivo: string; cita: string }
export interface FiltroResultado { pasa: boolean; motivos: string[]; alarmas: Alarma[]; posible_fraude: boolean }

/**
 * Palabras de alarma. `neg` = si va precedida de una negación ("kein Unfall", "unfallfrei" no entra) se ignora.
 * Las de "solo para profesionales" se buscan como frase para no descartar el texto legal típico de concesionario.
 */
const ALARMAS: { motivo: string; re: RegExp; neg?: boolean }[] = [
    { motivo: "accidente", re: /\b(unfall(?!frei)\w*|verunfallt|unfallwagen)\b/i, neg: true },
    { motivo: "daños", re: /\b(\w*schaden|\w*sch(ä|ae)den|besch(ä|ae)digt)\b/i, neg: true },
    { motivo: "motor dañado", re: /\bmotorschaden\b/i, neg: true },
    { motivo: "granizo", re: /\bhagel\w*/i, neg: true },
    { motivo: "defecto", re: /\bdefekt\w*/i, neg: true },
    { motivo: "para bricolaje", re: /\bbastler\w*/i },
    { motivo: "importado", re: /\b(\w*import\w*)\b/i },
    { motivo: "historial de EE. UU.", re: /\b(us[- ]?carfax|carfax|usa|us[- ]?(fahrzeug|version|modell|import))\b/i },
    { motivo: "origen Dubái/Japón/Suiza", re: /\b(dubai|japan|schweiz|ch[- ]fahrzeug)\b/i },
    { motivo: "exportación", re: /\bexport\w*/i },
    { motivo: "solo profesionales", re: /\bnur an (h(ä|ae)ndler|gewerbe\w*)|\b(h(ä|ae)ndler|gewerbe)verkauf\b|\bnur f(ü|ue)r (h(ä|ae)ndler|gewerbe\w*)/i },
    { motivo: "más potencia (tuning)", re: /\b(leistungssteigerung|chip\s?tuning|stage\s?[1-3]|software\s?optimierung|kennfeldoptimierung)\b/i },
    { motivo: "kit de carrocería", re: /\b(prior[- ]?design|body\s?kit|widebody|breitbau)\b/i },
    { motivo: "parado / dado de baja", re: /\babgemeldet seit\b|\bseit \d{4} abgemeldet\b|\bstandsch(ä|ae)d\w*|\blange gestanden\b/i },
    { motivo: "ex alquiler", re: /\bmietwagen\b|\bex[- ]?miet\w*/i },
    { motivo: "precio real por teléfono", re: /\b(echter|richtiger|tats(ä|ae)chlicher) preis\b|\bpreis nur (am|per) telefon\b|\bpreis auf anfrage\b/i },
]

const NEGACION = /\b(kein|keine|keinen|keiner|ohne|nicht|nie|frei von)\s+(\w+\s+){0,2}$/i
const NEG_DESPUES = /^\s*(frei|freies|freier|ja\s*:\s*nein|:?\s*nein|:?\s*keine?)\b/i

/** Busca palabras de alarma en el texto del anuncio, con un trozo de texto como cita */
export function buscarAlarmas(texto: string): Alarma[] {
    const out: Alarma[] = []
    for (const a of ALARMAS) {
        const re = new RegExp(a.re.source, a.re.flags.includes("g") ? a.re.flags : a.re.flags + "g")
        for (const m of texto.matchAll(re)) {
            const at = m.index ?? 0
            const antes = texto.slice(Math.max(0, at - 40), at)
            const despues = texto.slice(at + m[0].length, at + m[0].length + 12)
            if (a.neg && (NEGACION.test(antes) || NEG_DESPUES.test(despues))) continue
            out.push({ motivo: a.motivo, cita: texto.slice(Math.max(0, at - 50), at + m[0].length + 50).replace(/\s+/g, " ").trim() })
            break
        }
    }
    return out
}

/** Carrocerías que se pueden excluir en una búsqueda y cómo aparecen en los anuncios */
const CARROCERIAS: Record<string, RegExp> = {
    familiar: /\b(kombi|variant|avant|touring|sports?tourer|estate|break|shooting brake|st\b)/i,
    descapotable: /\b(cabrio\w*|roadster|spider|spyder|convertible)\b/i,
    suv: /\b(suv|gel(ä|ae)ndewagen|pickup)\b/i,
    coupe: /\bcoup(e|é)\b/i,
    sedan: /\b(sedan|stufenheck)\b/i,
    monovolumen: /\b(van|minibus|kleinbus|gran tourer)\b/i,
}

/** ¿La carrocería del anuncio está entre las excluidas de la búsqueda? Devuelve cuál */
export function carroceriaExcluida(an: Pick<Anuncio, "carroceria" | "titulo" | "version">, excluidas: string[]): string | null {
    const texto = [an.carroceria, an.titulo, an.version].filter(Boolean).join(" ")
    for (const ex of excluidas) {
        const re = CARROCERIAS[ex.toLowerCase()] ?? new RegExp(`\\b${ex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
        if (re.test(texto)) return ex
    }
    return null
}

export interface ListaNegra { vendedores: string[]; ciudades: string[] }

/** Mediana */
export function mediana(nums: number[]): number | null {
    const s = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b)
    if (!s.length) return null
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Precio por debajo del cual un anuncio es "posible fraude" (70 % del mercado alemán) */
export const FRAUDE_RATIO = 0.7

/**
 * Mercado alemán del mismo modelo y año calculado con los anuncios de la misma búsqueda (mediana por año).
 * Se usa solo si hay al menos 5 anuncios de ese año; si no, la mediana que da el portal.
 */
export function medianaMercado(an: Anuncio, mismos: Anuncio[]): number | null {
    const delAnio = mismos.filter(o => o.anio === an.anio && o.precio).map(o => o.precio!)
    if (delAnio.length >= 5) return mediana(delAnio)
    return an.mediana_portal ?? null
}

/** Filtro duro: palabras de alarma, carrocería excluida, sin descripción, lista negra y posible fraude */
export function filtroDuro(an: Anuncio, busqueda: Pick<Busqueda, "carrocerias_excluidas">, mercado: number | null, negra: ListaNegra = { vendedores: [], ciudades: [] }): FiltroResultado {
    const motivos: string[] = []
    const texto = [an.titulo, an.version, an.descripcion].join("\n")
    const alarmas = buscarAlarmas(texto)
    for (const a of alarmas) motivos.push(`alarma: ${a.motivo}`)
    const carro = carroceriaExcluida(an, busqueda.carrocerias_excluidas)
    if (carro) motivos.push(`carrocería excluida: ${carro}`)
    if (an.descripcion.replace(/\s+/g, " ").trim().length < 40) motivos.push("sin descripción")
    const low = (s: string | null) => (s ?? "").toLowerCase()
    if (negra.vendedores.some(v => v && low(an.vendedor_nombre).includes(v.toLowerCase()))) motivos.push("vendedor en lista negra")
    if (negra.ciudades.some(c => c && low(an.ciudad) === c.toLowerCase())) motivos.push("ciudad en lista negra")
    const posible_fraude = !!(an.precio && mercado && an.precio < mercado * FRAUDE_RATIO)
    if (posible_fraude) motivos.push(`posible fraude: ${Math.round(an.precio! / 100) * 100} € < 70 % del mercado (${Math.round(mercado!)} €)`)
    return { pasa: motivos.length === 0, motivos, alarmas, posible_fraude }
}
