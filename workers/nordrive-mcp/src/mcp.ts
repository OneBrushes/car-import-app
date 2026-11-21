// Herramientas MCP de "Guardados por Claude". Solo leen y escriben coches_claude, contactos_claude y el bucket
// de fotos "coches-claude". Nunca tus coches (imported_cars).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
    CLAUDE_CAR_STATES,
    CONTACT_CHANNELS,
    CONTACT_DIRECTIONS,
    CONTACT_SENDERS,
    MAX_CLAUDE_PHOTOS,
    awaitingReplySince,
    saleEaseLabel,
    computeClaudeCar,
    daysSince,
    normalizeListingUrl,
    withContacts,
    type ClaudeCar,
    type ClaudeCarFields,
    type ClaudeContact,
} from "../../../lib/claude-cars"
import { HACIENDA_MIN_SCORE, buscarValorHacienda, needsVersionCheck, type HaciendaMatch } from "../../../lib/hacienda"
import { CARS_TABLE, CONTACTS_TABLE, costSettings, db, logCall, ownerId } from "./db"
import { publicPrefix, pruneCarFolder, refreshFromListing, samePhoto, storePhotos, type StoredPhotos } from "./photos"
import type { Env } from "./env"

// --- Esquemas ---------------------------------------------------------------------------------------------------------

const euros = (what: string) => z.number().nonnegative().describe(`${what} en euros`)

/** Campos del coche (todos opcionales salvo la URL en guardar_coche) */
const carFields = {
    marca: z.string().trim().min(1).max(60).describe("Marca, p. ej. Volkswagen"),
    modelo: z.string().trim().min(1).max(80).describe("Modelo, p. ej. Golf"),
    version: z.string().trim().max(120).describe("Versión o acabado, p. ej. R 2.0 TSI 4Motion DSG"),
    anio: z.number().int().min(1950).max(2100).describe("Año de primera matriculación"),
    mes_matriculacion: z.number().int().min(1).max(12).describe("Mes de primera matriculación (1–12)"),
    km: z.number().int().nonnegative().describe("Kilómetros"),
    potencia_cv: z.number().int().positive().max(2000).describe("Potencia en CV"),
    combustible: z.string().trim().max(40).describe("Gasolina, Diésel, Híbrido, Eléctrico o Gas"),
    precio_alemania: euros("Precio del anuncio en Alemania (con IVA si lo lleva)"),
    precio_neto: euros("Precio neto sin IVA (el 'Netto' del anuncio); solo cuenta si iva_deducible es true"),
    iva_deducible: z.boolean().describe("true si compro como empresa y el IVA es deducible (concesionario con 'MwSt. ausweisbar'): el coste será el precio neto"),
    tipo_vendedor: z.enum(["particular", "concesionario"]).describe("Tipo de vendedor"),
    nombre_vendedor: z.string().trim().max(160).describe("Nombre del vendedor o concesionario"),
    valoracion_vendedor: z.number().min(0).max(5).describe("Valoración del vendedor (0–5 estrellas)"),
    unfallfrei: z.boolean().describe("true si el anuncio dice 'unfallfrei' (sin accidentes)"),
    duenos: z.number().int().min(0).max(20).describe("Número de dueños anteriores"),
    co2: z.number().nonnegative().max(1000).describe("Emisiones de CO2 WLTP en g/km"),
    valor_hacienda: euros("Valor de tablas de Hacienda del modelo nuevo (Orden HAC/1501/2025). Si no lo das, la app lo busca sola en las tablas con marca, modelo, versión, año, CV y combustible (y avisa si hay que verificar la versión); también puedes consultarlo con buscar_valor_hacienda"),
    impuesto_matriculacion: euros("Impuesto de matriculación (IEDMT) que has calculado. Si lo das, es el que se aplica al coste; la app guarda también el suyo y avisa si difieren más de 100 €"),
    precio_venta_estimado_espana: euros("Precio de venta estimado en España"),
    transporte: euros("Transporte (si no lo das, se usa el de los ajustes de la app)"),
    itv: euros("ITV de importación (si no lo das, se usa el de los ajustes)"),
    homologacion: euros("Homologación / ficha técnica (si no lo das, se usa el de los ajustes)"),
    placas: euros("Placas (si no lo das, se usa el de los ajustes)"),
    gestoria: euros("Gestoría (si no lo das, se usa el de los ajustes)"),
    foto_url: z.string().url().max(2000).describe("URL de la foto principal (la que mejor muestre el coche entero). Si no la das, la principal es la primera de 'fotos'"),
    fotos: z.array(z.string().url().max(2000)).max(MAX_CLAUDE_PHOTOS).describe(
        `URLs de las fotos (máx. ${MAX_CLAUDE_PHOTOS}), en orden; la primera es la principal. Sustituyen a las que hubiera. ` +
        "En AutoScout24 la app las saca sola del anuncio; en mobile.de (que bloquea la lectura automática) pásalas tú: todas las de la galería. También sirve para elegir o reordenar fotos"),
    foto_posicion_y: z.number().int().min(0).max(100).describe("Encuadre vertical de la foto principal en la tarjeta: 0 = arriba, 100 = abajo. Si no lo das, la app lo calcula (en fotos verticales centra el tercio inferior, donde suele estar el coche)"),
    facilidad_venta: z.number().int().min(1).max(5).describe(
        "Lo fácil que será venderlo en España: 1 = fácil de vender, 2 = bastante fácil, 3 = venta media, 4 = bastante difícil, 5 = difícil de vender. " +
        "Valóralo por la demanda del modelo, motor y cambio, color, km, precio frente al mercado español y cuántos hay a la venta"),
    facilidad_venta_motivo: z.string().trim().max(500).describe("Por qué le das esa facilidad de venta, en una o dos frases"),
    notas: z.string().max(4000).describe("Tus notas: por qué es interesante, riesgos, qué preguntar al vendedor… Los mensajes con el vendedor NO van aquí: usa registrar_contacto"),
}

const optionalCarFields = Object.fromEntries(
    Object.entries(carFields).map(([key, schema]) => [key, schema.optional()]),
) as { [K in keyof typeof carFields]: z.ZodOptional<(typeof carFields)[K]> }

const urlSchema = z.string().trim().min(8).max(2000).describe("URL del anuncio (mobile.de, AutoScout24…). Si ya existe, se actualiza ese coche")
const stateSchema = z.enum(CLAUDE_CAR_STATES)

/** Columnas que afectan al cálculo: si cambia alguna, se recalcula */
const CALC_KEYS: (keyof ClaudeCarFields)[] = [
    "anio", "mes_matriculacion", "km", "precio_alemania", "precio_neto", "iva_deducible", "co2", "valor_hacienda",
    "impuesto_matriculacion", "precio_venta_estimado_espana", "transporte", "itv", "homologacion", "placas", "gestoria",
]
const PHOTO_KEYS = ["foto_url", "fotos", "foto_posicion_y"] as const
/** Columnas que identifican la versión: si cambian, se vuelve a buscar el valor de Hacienda */
const IDENTITY_KEYS: (keyof ClaudeCarFields)[] = ["marca", "modelo", "version", "anio", "potencia_cv", "combustible"]

// --- Utilidades ---------------------------------------------------------------------------------------------------------

const eur = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

const carName = (c: Partial<ClaudeCar>) => [c.marca, c.modelo, c.version, c.anio ? `(${c.anio})` : null].filter(Boolean).join(" ") || c.url || "coche"

function summary(c: ClaudeCar) {
    const parts = [
        `${carName(c)} · ${c.estado}`,
        `Coste total en España: ${eur(c.coste_total_espana)}`,
        `Beneficio: ${c.beneficio == null ? "— (falta precio de venta estimado)" : `${eur(c.beneficio)}${c.margen_pct != null ? ` (${c.margen_pct} %)` : ""}`}`,
    ]
    if (c.valor_hacienda) {
        parts.push(`Valor Hacienda: ${eur(c.valor_hacienda)}${c.valor_hacienda_origen === "tabla" ? ` (de las tablas: ${c.valor_hacienda_version ?? "?"})` : ""}${c.verificar_version ? " · ⚠️ VERIFICAR VERSIÓN" : ""}`)
    }
    const ease = saleEaseLabel(c.facilidad_venta)
    if (ease) parts.push(`Facilidad de venta: ${ease} (${c.facilidad_venta}/5)${c.facilidad_venta_motivo ? ` — ${c.facilidad_venta_motivo}` : ""}`)
    if (c.fotos?.length) parts.push(`Fotos: ${c.fotos.length}`)
    const last = c.contactos?.at(-1)
    if (last) {
        const waiting = awaitingReplySince(c.contactos)
        parts.push(`Último contacto: ${fecha(last.fecha)} (${last.direccion}, ${last.canal})${waiting ? ` · sin respuesta desde hace ${daysSince(waiting)} día(s)` : ""}`)
    }
    if (c.aviso_impuesto) parts.push(`⚠️ ${c.aviso_impuesto}`)
    return parts.join("\n")
}

/** Lo que se devuelve a Claude: resumen legible + el coche completo con sus cálculos y contactos */
function carResult(c: ClaudeCar, prefix: string) {
    return {
        content: [
            { type: "text" as const, text: `${prefix}\n${summary(c)}` },
            { type: "text" as const, text: JSON.stringify(c, null, 2) },
        ],
    }
}

function errorResult(message: string) {
    return { isError: true, content: [{ type: "text" as const, text: message }] }
}

/** Quita undefined para no pisar columnas que Claude no ha mandado */
function defined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

const versionName = (m: HaciendaMatch) =>
    `${m.marca} ${m.modelo} (${m.inicio ?? "?"}–${m.fin ?? "hoy"}${m.cc ? `, ${m.cc} cc` : ""}${m.cv ? `, ${m.cv} CV` : ""}${m.combustible ? `, ${m.combustible}` : ""})`

/**
 * Si el coche no trae valor_hacienda (o el que tiene lo puso la app), lo busca en las tablas de Hacienda (valores_hacienda).
 * Devuelve las columnas a guardar y un aviso para Claude; null si no hay que tocar nada.
 */
async function autoHaciendaValue(client: SupabaseClient, car: Partial<ClaudeCar>): Promise<{ fields: Partial<ClaudeCar>; note: string | null } | null> {
    if (car.valor_hacienda && car.valor_hacienda_origen !== "tabla") return null
    if (!car.marca || !car.modelo) return null
    const modelo = [car.modelo, car.version].filter(Boolean).join(" ")
    const { matches, error } = await buscarValorHacienda(client, {
        marca: car.marca, modelo, anio: car.anio, cv: car.potencia_cv, combustible: car.combustible,
    }, 5)
    if (error && !matches.length) return { fields: {}, note: `Valor de Hacienda: no se ha podido buscar (${error}). Pásalo en valor_hacienda o usa buscar_valor_hacienda.` }
    const best = matches[0]
    if (!best || best.parecido < HACIENDA_MIN_SCORE) {
        return {
            fields: car.valor_hacienda_origen === "tabla" ? { valor_hacienda: null, valor_hacienda_origen: null, valor_hacienda_version: null, verificar_version: false } : {},
            note: "Valor de Hacienda: no hay ninguna versión parecida en las tablas; el impuesto se ha calculado sobre el precio de compra. Usa buscar_valor_hacienda y pasa valor_hacienda.",
        }
    }
    const verify = needsVersionCheck(matches)
    const others = matches.slice(1, 4).map(m => `${versionName(m)}: ${eur(m.valor)}`).join("; ")
    return {
        fields: { valor_hacienda: best.valor, valor_hacienda_origen: "tabla", valor_hacienda_version: versionName(best), verificar_version: verify },
        note: `Valor de Hacienda de las tablas: ${eur(best.valor)} — ${versionName(best)} (parecido ${best.parecido}/100).` +
            (verify ? ` VERIFICAR VERSIÓN: hay otras posibles (${others}). Si no es la buena, pasa el valor correcto en valor_hacienda.` : ""),
    }
}

/** Columnas añadidas después (2026-11_coches_claude_facilidad_venta.sql, 2026-11_valores_hacienda.sql) */
const NEWER_COLUMNS = ["facilidad_venta", "facilidad_venta_motivo", "valor_hacienda_origen", "valor_hacienda_version", "verificar_version"]

/** Guarda la fila; si falla porque aún no se ha ejecutado el SQL de alguna columna nueva, la guarda sin ellas */
async function saveTolerant<T extends { error: { message: string } | null }>(row: Record<string, unknown>, run: (r: Record<string, unknown>) => PromiseLike<T>): Promise<T> {
    const first = await run(row)
    if (!first.error || !NEWER_COLUMNS.some(c => first.error!.message.includes(c))) return first
    return run(Object.fromEntries(Object.entries(row).filter(([k]) => !NEWER_COLUMNS.includes(k))))
}

const withWarnings = (prefix: string, avisos: string[]) => (avisos.length ? `${prefix}\n⚠️ ${avisos.join("\n⚠️ ")}` : prefix)

type ToolOutput = { content: { type: "text"; text: string }[]; isError?: boolean }

/** Ejecuta la herramienta y deja constancia en mcp_logs, salga bien o mal */
async function logged(client: SupabaseClient, tool: string, fn: () => Promise<{ result: ToolOutput; carId?: string | null; resumen?: string }>): Promise<ToolOutput> {
    try {
        const { result, carId, resumen } = await fn()
        await logCall(client, { herramienta: tool, ok: !result.isError, coche_id: carId, resumen, error: result.isError ? result.content[0]?.text : undefined })
        return result
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await logCall(client, { herramienta: tool, ok: false, error: message })
        return errorResult(`Error: ${message}`)
    }
}

// --- Acceso a datos compartido (también lo usa el botón "Actualizar fotos" de la app) -----------------------------------

export async function loadContacts(client: SupabaseClient, carIds: string[]): Promise<ClaudeContact[]> {
    if (!carIds.length) return []
    const { data, error } = await client.from(CONTACTS_TABLE).select("*").in("coche_id", carIds).order("fecha", { ascending: true })
    // Tabla aún sin crear (falta ejecutar supabase/2026-11_contactos_claude.sql): sin historial, pero sin romper nada
    if (error && (error.code === "42P01" || error.code === "PGRST205")) return []
    if (error) throw new Error(`No se pudieron leer los contactos: ${error.message}`)
    return (data ?? []) as ClaudeContact[]
}

export async function attachContacts(client: SupabaseClient, cars: ClaudeCar[]): Promise<ClaudeCar[]> {
    const contacts = await loadContacts(client, cars.map(c => c.id))
    return cars.map(c => withContacts(c, contacts))
}

/** Columnas de fotos a partir de lo guardado */
function photoRow(stored: StoredPhotos, posicionPedida?: number) {
    return {
        foto_url: stored.fotos[0] ?? null,
        fotos: stored.fotos,
        ...(posicionPedida !== undefined ? { foto_posicion_y: posicionPedida } : stored.posicionY !== undefined ? { foto_posicion_y: stored.posicionY } : {}),
    }
}

/**
 * Saca todas las fotos del anuncio y las guarda en el coche (botón "Actualizar fotos" y guardar_coche sin fotos).
 * Devuelve el coche actualizado y los avisos.
 */
export async function refreshCarPhotos(client: SupabaseClient, env: Env, carId: string, given?: string[]) {
    const { data, error } = await client.from(CARS_TABLE).select("*").eq("id", carId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const car = data as ClaudeCar
    const stored = await refreshFromListing(client, env.SUPABASE_URL, car, given)
    if (!stored.fotos.length) return { car, avisos: stored.avisos, pendientes: 0, leidas: stored.leidas }
    // Misma principal (aunque ahora en más resolución): se respeta el encuadre guardado
    const keepY = car.foto_posicion_y != null && samePhoto(env.SUPABASE_URL, car.foto_url, stored.fotos[0]) ? car.foto_posicion_y : undefined
    const saved = await client.from(CARS_TABLE).update({ ...photoRow(stored, keepY), updated_at: new Date().toISOString() }).eq("id", carId).select("*").single()
    if (saved.error) throw new Error(saved.error.message)
    // Si se movió a "mis coches", esas URLs se usan allí: no se borra nada
    if (!car.movido_a && stored.pendientes === 0) await pruneCarFolder(client, env.SUPABASE_URL, carId, stored.fotos).catch(() => {})
    return { car: saved.data as ClaudeCar, avisos: stored.avisos, pendientes: stored.pendientes, leidas: stored.leidas }
}

function photoNotes(stored: { avisos: string[]; pendientes: number; leidas?: number | null } | null): string[] {
    if (!stored) return []
    const notes = [...stored.avisos]
    if (stored.pendientes) notes.push(`Quedan ${stored.pendientes} foto(s) por copiar al almacenamiento de la app; se copiarán en la siguiente actualización (botón "Actualizar fotos" de la app).`)
    return notes
}

// --- Servidor -----------------------------------------------------------------------------------------------------------

export function buildServer(env: Env): McpServer {
    const client = db(env)
    const server = new McpServer(
        { name: "nordrive-coches", version: "1.4.0" },
        {
            jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
            instructions:
                "Guarda coches de Alemania para NorDrive en la pestaña 'Guardados por Claude'. La app calcula el coste puesto en España " +
                "y el beneficio con su propia fórmula (impuesto de matriculación, IVA si toca, transporte, ITV, homologación, DGT, placas y gestoría) " +
                "y saca sola todas las fotos del anuncio. Confirma siempre al usuario el coste total y el beneficio que devuelve la herramienta. " +
                "Cada vez que envíes o recibas un mensaje de un vendedor, regístralo con registrar_contacto (no lo escribas en las notas). " +
                "Al guardar un coche, valora siempre facilidad_venta (1 fácil … 5 difícil) con su motivo.",
        },
    )

    server.registerTool(
        "guardar_coche",
        {
            title: "Guardar coche",
            description:
                "Guarda un coche de un anuncio alemán en 'Guardados por Claude'. Solo la URL es obligatoria. La app calcula el coste total " +
                "en España y el beneficio con su fórmula e intenta sacar todas las fotos del anuncio. mobile.de bloquea esa lectura automática: " +
                "en anuncios de mobile.de pasa tú en 'fotos' todas las URLs de las fotos de la galería (img.classistatic.de/…), en orden. " +
                "Si la URL ya está guardada, actualiza ese coche " +
                "(solo los campos que mandes) en vez de duplicarlo. Devuelve el coche guardado con sus cálculos y su historial de contactos.",
            inputSchema: { url: urlSchema, ...optionalCarFields },
        },
        async (args) => logged(client, "guardar_coche", async () => {
            const url = normalizeListingUrl(args.url)
            const { foto_url, fotos, foto_posicion_y, ...rest } = args
            const incoming = defined({ ...rest, url }) as ClaudeCarFields
            const [owner, settings, existing] = await Promise.all([
                ownerId(client),
                costSettings(client),
                client.from(CARS_TABLE).select("*").eq("url", url).maybeSingle(),
            ])
            if (existing.error) throw new Error(existing.error.message)

            // Valor de Hacienda: el de Claude si lo da; si no, la app lo busca en las tablas del BOE
            if (incoming.valor_hacienda !== undefined) Object.assign(incoming, { valor_hacienda_origen: "claude", valor_hacienda_version: null, verificar_version: false })
            const haciendaNotes: string[] = []
            const auto = await autoHaciendaValue(client, { ...(existing.data ?? {}), ...incoming }).catch(() => null)
            if (auto) { Object.assign(incoming, auto.fields); if (auto.note) haciendaNotes.push(auto.note) }

            const merged = { ...(existing.data ?? {}), ...incoming } as ClaudeCarFields
            const row = { ...incoming, ...computeClaudeCar(merged, settings), updated_at: new Date().toISOString() }
            const saved = await saveTolerant(row, r => existing.data
                ? client.from(CARS_TABLE).update(r).eq("id", existing.data.id).select("*").single()
                : client.from(CARS_TABLE).insert({ ...r, user_id: owner, estado: "nuevo" }).select("*").single())
            if (saved.error) throw new Error(saved.error.message)
            let car = saved.data as ClaudeCar

            // Fotos: las que indique Claude o, si no, todas las del anuncio (coche nuevo, sin fotos o con fotos por copiar)
            let notes: string[] = []
            const prefix = publicPrefix(env.SUPABASE_URL)
            if (foto_url !== undefined || fotos !== undefined) {
                const list = fotos ?? car.fotos ?? []
                const stored = await storePhotos(client, env.SUPABASE_URL, car.id, foto_url ? [foto_url, ...list] : list)
                const upd = await client.from(CARS_TABLE).update(photoRow(stored, foto_posicion_y)).eq("id", car.id).select("*").single()
                if (upd.error) throw new Error(upd.error.message)
                car = upd.data as ClaudeCar
                notes = photoNotes(stored)
            } else if (!car.fotos?.length || car.fotos.some(u => !u.startsWith(prefix))) {
                const refreshed = await refreshCarPhotos(client, env, car.id)
                if (refreshed) { car = refreshed.car; notes = photoNotes(refreshed) }
                if (foto_posicion_y !== undefined) {
                    const upd = await client.from(CARS_TABLE).update({ foto_posicion_y }).eq("id", car.id).select("*").single()
                    if (!upd.error) car = upd.data as ClaudeCar
                }
            } else if (foto_posicion_y !== undefined) {
                const upd = await client.from(CARS_TABLE).update({ foto_posicion_y }).eq("id", car.id).select("*").single()
                if (!upd.error) car = upd.data as ClaudeCar
            }

            ;[car] = await attachContacts(client, [car])
            const action = existing.data ? "Actualizado (la URL ya estaba guardada)" : "Guardado"
            notes = [...haciendaNotes, ...notes]
            return {
                result: carResult(car, withWarnings(`${action} en 'Guardados por Claude'.`, notes)),
                carId: car.id,
                resumen: `${action}: ${carName(car)}${car.fotos?.length ? ` · ${car.fotos.length} foto(s)` : ""}${notes.length ? ` · ${notes.length} aviso(s)` : ""}`,
            }
        }),
    )

    server.registerTool(
        "listar_coches",
        {
            title: "Listar coches",
            description:
                "Lista los coches de 'Guardados por Claude', del más reciente al más antiguo, con su coste total en España, su beneficio y su " +
                "historial de contactos (ultimo_contacto y contactos). Filtros opcionales: estado, marca y beneficio mínimo en euros.",
            inputSchema: {
                estado: stateSchema.optional().describe("Solo coches en este estado"),
                marca: z.string().trim().min(1).max(60).optional().describe("Solo esta marca (no distingue mayúsculas)"),
                margen_minimo: z.number().optional().describe("Beneficio mínimo en euros"),
                limite: z.number().int().min(1).max(200).optional().describe("Máximo de coches a devolver (por defecto 50)"),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ estado, marca, margen_minimo, limite }) => logged(client, "listar_coches", async () => {
            let query = client.from(CARS_TABLE).select("*").order("created_at", { ascending: false }).limit(limite ?? 50)
            if (estado) query = query.eq("estado", estado)
            if (marca) query = query.ilike("marca", marca.replace(/[%_]/g, "\\$&"))
            if (margen_minimo != null) query = query.gte("beneficio", margen_minimo)
            const { data, error } = await query
            if (error) throw new Error(error.message)
            const cars = await attachContacts(client, (data ?? []) as ClaudeCar[])
            const text = cars.length
                ? cars.map(c => `• [${c.id}] ${summary(c).replace(/\n/g, " · ")}\n  ${c.url}`).join("\n")
                : "No hay coches con esos filtros."
            return {
                result: { content: [{ type: "text", text: `${cars.length} coche(s).\n${text}` }, { type: "text", text: JSON.stringify(cars, null, 2) }] },
                resumen: `${cars.length} coche(s)${estado ? ` · ${estado}` : ""}${marca ? ` · ${marca}` : ""}${margen_minimo != null ? ` · ≥ ${margen_minimo} €` : ""}`,
            }
        }),
    )

    server.registerTool(
        "actualizar_coche",
        {
            title: "Actualizar coche",
            description:
                "Cambia cualquier campo o el estado (nuevo, interesante, contactado, descartado, comprado) de un coche de 'Guardados por Claude', por su id. " +
                "Si cambian datos que afectan al precio, la app recalcula el coste y el beneficio. Devuelve el coche actualizado con su historial de contactos.",
            inputSchema: {
                id: z.string().uuid().describe("id del coche (lo devuelven guardar_coche y listar_coches)"),
                url: urlSchema.optional(),
                estado: stateSchema.optional().describe("Nuevo estado"),
                ...optionalCarFields,
            },
        },
        async ({ id, foto_url, fotos, foto_posicion_y, ...changes }) => logged(client, "actualizar_coche", async () => {
            const patch = defined({ ...changes, url: changes.url ? normalizeListingUrl(changes.url) : undefined }) as Partial<ClaudeCar>
            const photoChange = foto_url !== undefined || fotos !== undefined || foto_posicion_y !== undefined
            if (Object.keys(patch).length === 0 && !photoChange) return { result: errorResult("No has indicado ningún cambio."), carId: id }

            const current = await client.from(CARS_TABLE).select("*").eq("id", id).maybeSingle()
            if (current.error) throw new Error(current.error.message)
            if (!current.data) return { result: errorResult(`No existe ningún coche de Claude con id ${id}.`), carId: id }

            let notes: string[] = []
            // Valor de Hacienda: el que pase Claude; si cambia el coche y el valor era de las tablas, se vuelve a buscar
            if (patch.valor_hacienda !== undefined) Object.assign(patch, { valor_hacienda_origen: "claude", valor_hacienda_version: null, verificar_version: false })
            else if (IDENTITY_KEYS.some(key => key in patch)) {
                const auto = await autoHaciendaValue(client, { ...current.data, ...patch }).catch(() => null)
                if (auto) { Object.assign(patch, auto.fields); if (auto.note) notes.push(auto.note) }
            }
            let row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
            if (CALC_KEYS.some(key => key in patch)) {
                const settings = await costSettings(client)
                row = { ...row, ...computeClaudeCar({ ...current.data, ...patch } as ClaudeCarFields, settings) }
            }
            if (foto_url !== undefined || fotos !== undefined) {
                const list = fotos ?? (current.data.fotos as string[] | null) ?? []
                const stored = await storePhotos(client, env.SUPABASE_URL, id, foto_url ? [foto_url, ...list] : list)
                row = { ...row, ...photoRow(stored, foto_posicion_y) }
                notes = photoNotes(stored)
            } else if (foto_posicion_y !== undefined) {
                row.foto_posicion_y = foto_posicion_y
            }
            const saved = await saveTolerant(row, r => client.from(CARS_TABLE).update(r).eq("id", id).select("*").single())
            if (saved.error) throw new Error(saved.error.message)
            const [car] = await attachContacts(client, [saved.data as ClaudeCar])
            const changed = [...Object.keys(patch), ...PHOTO_KEYS.filter(k => ({ foto_url, fotos, foto_posicion_y })[k] !== undefined)]
            return { result: carResult(car, withWarnings("Actualizado.", notes)), carId: id, resumen: `${carName(car)}: ${changed.join(", ")}` }
        }),
    )

    server.registerTool(
        "registrar_contacto",
        {
            title: "Registrar contacto",
            description:
                "Registra un mensaje enviado o recibido con el vendedor. Úsala SIEMPRE justo después de contactar a un vendedor. " +
                "Indica el coche por coche_id o por url. Al registrar un mensaje enviado, si el coche está en 'nuevo' o 'interesante' pasa a 'contactado'. " +
                "Devuelve el coche con todo su historial de contactos.",
            inputSchema: {
                coche_id: z.string().uuid().optional().describe("id del coche (o usa url)"),
                url: z.string().trim().min(8).max(2000).optional().describe("URL del anuncio del coche (o usa coche_id)"),
                canal: z.enum(CONTACT_CHANNELS).describe("Por dónde: mobile.de, email, whatsapp, telefono u otro"),
                direccion: z.enum(CONTACT_DIRECTIONS).describe("'enviado' si lo mandamos nosotros, 'recibido' si es la respuesta del vendedor"),
                mensaje: z.string().trim().min(1).max(20000).describe("Texto completo del mensaje (o resumen de la llamada)"),
                asunto: z.string().trim().max(300).optional().describe("Asunto, si lo tiene"),
                fecha: z.string().datetime({ offset: true }).optional().describe("Fecha y hora ISO 8601 (p. ej. 2026-11-21T20:45:00+01:00). Si no la das, ahora"),
                enviado_por: z.enum(CONTACT_SENDERS).optional().describe("Quién lo escribió o envió: 'claude' (por defecto) o 'usuario'"),
                notas: z.string().trim().max(2000).optional().describe("Notas sobre este mensaje (p. ej. 'pidió el VIN')"),
            },
        },
        async ({ coche_id, url, canal, direccion, mensaje, asunto, fecha: when, enviado_por, notas }) => logged(client, "registrar_contacto", async () => {
            if (!coche_id && !url) return { result: errorResult("Indica coche_id o url.") }
            const found = coche_id
                ? await client.from(CARS_TABLE).select("*").eq("id", coche_id).maybeSingle()
                : await client.from(CARS_TABLE).select("*").eq("url", normalizeListingUrl(url!)).maybeSingle()
            if (found.error) throw new Error(found.error.message)
            if (!found.data) return { result: errorResult(`No existe ese coche en 'Guardados por Claude'${url ? ` (${url})` : ""}. Guárdalo primero con guardar_coche.`), carId: coche_id ?? null }
            let car = found.data as ClaudeCar

            const { error } = await client.from(CONTACTS_TABLE).insert({
                coche_id: car.id, canal, direccion, mensaje, asunto: asunto ?? null, notas: notas ?? null,
                fecha: when ?? new Date().toISOString(), enviado_por: enviado_por ?? "claude",
            })
            if (error) throw new Error(error.message)

            let stateNote = ""
            if (direccion === "enviado" && (car.estado === "nuevo" || car.estado === "interesante")) {
                const upd = await client.from(CARS_TABLE).update({ estado: "contactado", updated_at: new Date().toISOString() }).eq("id", car.id).select("*").single()
                if (upd.error) throw new Error(upd.error.message)
                car = upd.data as ClaudeCar
                stateNote = " El coche pasa a 'contactado'."
            }
            ;[car] = await attachContacts(client, [car])
            return {
                result: carResult(car, `Contacto registrado (${direccion}, ${canal}).${stateNote}`),
                carId: car.id,
                resumen: `${carName(car)}: ${direccion} por ${canal}`,
            }
        }),
    )

    server.registerTool(
        "buscar_valor_hacienda",
        {
            title: "Buscar valor de Hacienda",
            description:
                "Busca en las tablas oficiales de precios medios de venta de Hacienda 2026 (Orden HAC/1501/2025, anexo I, turismos y todoterrenos) " +
                "el valor del coche nuevo con el que se calcula el impuesto de matriculación. Devuelve las versiones que encajan, ordenadas por parecido " +
                "(0–100), con su periodo comercial, cilindrada, potencia, combustible y valor. Pasa el que corresponda en valor_hacienda al guardar el coche.",
            inputSchema: {
                marca: z.string().trim().min(1).max(60).describe("Marca, p. ej. Volkswagen, Mercedes-Benz, BMW"),
                modelo: z.string().trim().min(1).max(160).describe("Modelo y versión, p. ej. 'Golf R 2.0 TSI 4Motion DSG' o 'C 63 AMG W204'"),
                anio: z.number().int().min(1950).max(2100).optional().describe("Año de primera matriculación"),
                cc: z.number().int().positive().max(10000).optional().describe("Cilindrada en cc"),
                cv: z.number().int().positive().max(2000).optional().describe("Potencia en CV"),
                combustible: z.string().trim().max(40).optional().describe("Gasolina, Diésel, Híbrido, Eléctrico…"),
                limite: z.number().int().min(1).max(30).optional().describe("Máximo de versiones a devolver (por defecto 10)"),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ marca, modelo, anio, cc, cv, combustible, limite }) => logged(client, "buscar_valor_hacienda", async () => {
            const { matches, error } = await buscarValorHacienda(client, { marca, modelo, anio, cc, cv, combustible }, limite ?? 10)
            if (error && !matches.length) return { result: errorResult(`No se ha podido buscar: ${error}`), resumen: `${marca} ${modelo}` }
            if (!matches.length) return { result: { content: [{ type: "text", text: "No hay ninguna versión con esa marca y modelo en las tablas de Hacienda 2026." }] }, resumen: `${marca} ${modelo}: 0` }
            const verify = needsVersionCheck(matches)
            const text = matches.map((m, i) => `${i + 1}. ${eur(m.valor)} — ${versionName(m)} · parecido ${m.parecido}/100 (${m.motivo})`).join("\n")
            return {
                result: {
                    content: [
                        { type: "text", text: `${verify ? "Hay varias versiones posibles: verifica cuál es." : "La más parecida es la primera."}\n${text}` },
                        { type: "text", text: JSON.stringify(matches, null, 2) },
                    ],
                },
                resumen: `${marca} ${modelo}${anio ? ` ${anio}` : ""}: ${matches.length} versión(es), mejor ${eur(matches[0].valor)}`,
            }
        }),
    )

    server.registerTool(
        "borrar_coche",
        {
            title: "Borrar coche",
            description: "Borra definitivamente un coche de 'Guardados por Claude' (con sus fotos y su historial de contactos), por su id. Para apartarlo sin borrarlo, usa actualizar_coche con estado 'descartado'.",
            inputSchema: { id: z.string().uuid().describe("id del coche") },
            annotations: { destructiveHint: true },
        },
        async ({ id }) => logged(client, "borrar_coche", async () => {
            const { data, error } = await client.from(CARS_TABLE).delete().eq("id", id).select("*").maybeSingle()
            if (error) throw new Error(error.message)
            if (!data) return { result: errorResult(`No existe ningún coche de Claude con id ${id}.`), carId: id }
            const car = data as ClaudeCar
            // Si se movió a "mis coches", sus fotos siguen en uso allí
            if (!car.movido_a) await pruneCarFolder(client, env.SUPABASE_URL, id, []).catch(e => console.error("No se pudieron borrar las fotos:", e))
            return { result: { content: [{ type: "text", text: `Borrado: ${carName(car)}\n${car.url}` }] }, carId: id, resumen: `Borrado: ${carName(car)}` }
        }),
    )

    return server
}

/** Una petición MCP (Streamable HTTP, sin sesión: cada petición es independiente) */
export async function handleMcp(request: Request, env: Env): Promise<Response> {
    const server = buildServer(env)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    try {
        return await transport.handleRequest(request)
    } finally {
        // En modo JSON la respuesta ya está completa al volver de handleRequest
        void server.close()
    }
}
