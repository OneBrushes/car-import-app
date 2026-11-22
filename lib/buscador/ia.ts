// Lectura del anuncio con IA (Claude vía la suscripción: tools/buscador/claude-cli.ts). Aquí: prompt fijo, esquema
// del JSON y qué alertas son graves. Sin dependencias: lo usan el script y los tests.

export const TIPOS_ALERTA = ["accidente", "daños", "importado", "parado", "modificado", "fraude", "precio", "kilometraje", "otros"] as const
export type TipoAlerta = (typeof TIPOS_ALERTA)[number]

export interface LecturaIA {
    accidente: boolean | null
    importado: boolean | null
    pais_origen: string | null
    /** "AAAA-MM" si el anuncio dice desde cuándo está parado / dado de baja */
    parado_desde: string | null
    modificado: boolean | null
    /** "AAAA-MM" de la próxima ITV (TÜV/HU) si lo dice */
    itv_hasta: string | null
    duenos: number | null
    vendedor_pide_whatsapp_o_senal: boolean
    precio_texto_distinto: boolean
    alertas: { tipo: TipoAlerta; cita_exacta: string }[]
}

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] })

/** JSON Schema para --json-schema (salida validada) */
export const ESQUEMA_LECTURA = {
    type: "object",
    additionalProperties: false,
    required: ["accidente", "importado", "pais_origen", "parado_desde", "modificado", "itv_hasta", "duenos", "vendedor_pide_whatsapp_o_senal", "precio_texto_distinto", "alertas"],
    properties: {
        accidente: nullable("boolean"),
        importado: nullable("boolean"),
        pais_origen: nullable("string"),
        parado_desde: nullable("string"),
        modificado: nullable("boolean"),
        itv_hasta: nullable("string"),
        duenos: nullable("integer"),
        vendedor_pide_whatsapp_o_senal: { type: "boolean" },
        precio_texto_distinto: { type: "boolean" },
        alertas: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["tipo", "cita_exacta"],
                properties: { tipo: { type: "string", enum: [...TIPOS_ALERTA] }, cita_exacta: { type: "string" } },
            },
        },
    },
} as const

/** Prompt de sistema fijo (igual cada vez) */
export const SISTEMA_LECTURA = `Lees anuncios de coches usados de portales alemanes para un importador que los compra para venderlos en España.
Devuelve SOLO el JSON del esquema, sin texto alrededor.

Reglas:
- accidente: true si el texto dice o da a entender un accidente o daños por accidente (Unfall, Unfallschaden, Vorschaden reparado, verunfallt, "Karosserie instandgesetzt"…); false si dice expresamente que no lo tuvo ("unfallfrei", "kein Unfall"); null si no dice nada.
- importado: true si el coche viene de fuera de la UE o de otro mercado (USA, Carfax, Kanada, Dubai/VAE, Japón, Suiza, Corea…) o dice "Import/Reimport"; pais_origen el país si se sabe.
- parado_desde: "AAAA-MM" si dice desde cuándo está dado de baja o parado ("seit 2019 abgemeldet" → "2019-01"); null si no.
- modificado: true si tiene preparación de motor (Leistungssteigerung, Chiptuning, Stage 1/2), kit de carrocería (Prior Design, Bodykit, Widebody), suspensión o escape no de serie, o cualquier cambio que complique homologarlo en España.
- itv_hasta: "AAAA-MM" de la próxima HU/TÜV si lo dice.
- duenos: número de propietarios anteriores (Vorbesitzer/Halter) si lo dice.
- vendedor_pide_whatsapp_o_senal: true si pide contactar por WhatsApp/email fuera del portal, pagar señal o anticipo antes de ver el coche, envío del coche sin verlo, o cualquier patrón típico de estafa.
- precio_texto_distinto: true si el texto da otro precio distinto del anunciado, dice que el precio real se da por teléfono ("echter Preis nur am Telefon"), que el precio es "nur für Händler/Export", que es una cuota o que falta sumar algo.
- alertas: una por cada problema, con tipo y la frase EXACTA copiada del anuncio (en su idioma). tipos: accidente, daños, importado, parado, modificado, fraude, precio, kilometraje (manipulación o km dudosos), otros (algo que conviene preguntar pero no es grave).
- No inventes: si algo no aparece, null o false y sin alerta.`

export function mensajeLectura(an: { titulo: string; precio: number | null; km: number | null; anio: number | null; vendedor_tipo: string | null; descripcion: string }): string {
    return [
        `Título: ${an.titulo}`,
        `Precio anunciado: ${an.precio ?? "?"} €`,
        `Km: ${an.km ?? "?"} · Año: ${an.anio ?? "?"} · Vendedor: ${an.vendedor_tipo ?? "?"}`,
        "",
        "Descripción completa del anuncio:",
        an.descripcion,
    ].join("\n")
}

/** Alertas que descartan el coche (las de tipo "otros" solo se anotan) */
export const ALERTAS_GRAVES: TipoAlerta[] = ["accidente", "daños", "importado", "parado", "modificado", "fraude", "precio", "kilometraje"]

/** ¿La lectura descarta el coche? Devuelve los motivos (vacío = pasa) */
export function motivosGravesIA(l: LecturaIA, hoy = new Date()): string[] {
    const m: string[] = []
    if (l.accidente) m.push("IA: accidente")
    if (l.importado) m.push(`IA: importado${l.pais_origen ? ` (${l.pais_origen})` : ""}`)
    if (l.modificado) m.push("IA: modificado")
    if (l.vendedor_pide_whatsapp_o_senal) m.push("IA: posible estafa (WhatsApp/señal)")
    if (l.precio_texto_distinto) m.push("IA: el precio real no es el anunciado")
    if (l.parado_desde) {
        const [y, mo] = l.parado_desde.split("-").map(Number)
        const meses = (hoy.getFullYear() - y) * 12 + (hoy.getMonth() + 1 - (mo || 1))
        if (Number.isFinite(meses) && meses >= 12) m.push(`IA: parado desde ${l.parado_desde}`)
    }
    for (const a of l.alertas) if (ALERTAS_GRAVES.includes(a.tipo) && !m.some(x => x.startsWith(`IA: ${a.tipo}`))) m.push(`IA: ${a.tipo} («${a.cita_exacta.slice(0, 80)}»)`)
    return m
}
