// Herramientas MCP de "Guardados por Claude". Solo leen y escriben la tabla coches_claude.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
    CLAUDE_CAR_STATES,
    MAX_CLAUDE_PHOTOS,
    computeClaudeCar,
    normalizeListingUrl,
    type ClaudeCar,
    type ClaudeCarFields,
} from "../../../lib/claude-cars"
import { CARS_TABLE, costSettings, db, logCall, ownerId } from "./db"
import { deleteUnusedPhotos, rehostPhotos } from "./photos"
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
    valor_hacienda: euros("Valor de tablas de Hacienda del modelo nuevo (Orden HAC/1501/2025), si lo conoces. Sin él, la base del impuesto es el precio de compra"),
    impuesto_matriculacion: euros("Impuesto de matriculación (IEDMT) que has calculado. Si lo das, es el que se aplica al coste; la app guarda también el suyo y avisa si difieren más de 100 €"),
    precio_venta_estimado_espana: euros("Precio de venta estimado en España"),
    transporte: euros("Transporte (si no lo das, se usa el de los ajustes de la app)"),
    itv: euros("ITV de importación (si no lo das, se usa el de los ajustes)"),
    homologacion: euros("Homologación / ficha técnica (si no lo das, se usa el de los ajustes)"),
    placas: euros("Placas (si no lo das, se usa el de los ajustes)"),
    gestoria: euros("Gestoría (si no lo das, se usa el de los ajustes)"),
    foto_url: z.string().url().max(2000).describe("URL de la foto principal (la que mejor muestre el coche entero). Si no la das, la principal es la primera de 'fotos'"),
    fotos: z.array(z.string().url().max(2000)).max(MAX_CLAUDE_PHOTOS).describe(`URLs de las fotos del anuncio (máx. ${MAX_CLAUDE_PHOTOS}), en orden. Sustituyen a las que hubiera. La app las copia a su almacenamiento para que no se pierdan si se borra el anuncio`),
    foto_posicion_y: z.number().int().min(0).max(100).describe("Encuadre vertical de la foto principal en la tarjeta: 0 = arriba, 100 = abajo. Si no lo das, la app lo calcula (en fotos verticales centra el tercio inferior, donde suele estar el coche)"),
    notas: z.string().max(4000).describe("Tus notas: por qué es interesante, riesgos, qué preguntar al vendedor…"),
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

// --- Utilidades ---------------------------------------------------------------------------------------------------------

const eur = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

const carName = (c: Partial<ClaudeCar>) => [c.marca, c.modelo, c.version, c.anio ? `(${c.anio})` : null].filter(Boolean).join(" ") || c.url || "coche"

function summary(c: ClaudeCar) {
    const parts = [
        `${carName(c)} · ${c.estado}`,
        `Coste total en España: ${eur(c.coste_total_espana)}`,
        `Beneficio: ${c.beneficio == null ? "— (falta precio de venta estimado)" : `${eur(c.beneficio)}${c.margen_pct != null ? ` (${c.margen_pct} %)` : ""}`}`,
    ]
    if (c.aviso_impuesto) parts.push(`⚠️ ${c.aviso_impuesto}`)
    return parts.join("\n")
}

/** Lo que se devuelve a Claude: resumen legible + el coche completo con sus cálculos */
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

// --- Servidor -----------------------------------------------------------------------------------------------------------

export function buildServer(env: Env): McpServer {
    const client = db(env)
    const server = new McpServer(
        { name: "nordrive-coches", version: "1.0.0" },
        {
            jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
            instructions:
                "Guarda coches de Alemania para NorDrive en la pestaña 'Guardados por Claude'. La app calcula el coste puesto en España " +
                "y el beneficio con su propia fórmula (impuesto de matriculación, IVA si toca, transporte, ITV, homologación, DGT, placas y gestoría). " +
                "Confirma siempre al usuario el coste total y el beneficio que devuelve la herramienta.",
        },
    )

    /**
     * Columnas de fotos a guardar: copia las fotos a Storage y calcula el encuadre de la principal.
     * Si solo llega foto_url, se pone delante de las fotos que ya tuviera el coche.
     */
    async function photoColumns(input: Partial<ClaudeCarFields>, existingFotos: string[] = []) {
        if (input.foto_url === undefined && input.fotos === undefined) {
            return { columns: input.foto_posicion_y !== undefined ? { foto_posicion_y: input.foto_posicion_y } : {}, avisos: [] as string[] }
        }
        const list = input.fotos !== undefined ? (input.fotos ?? []) : existingFotos
        const r = await rehostPhotos(client, env.SUPABASE_URL, input.foto_url ?? undefined, list)
        return {
            columns: { foto_url: r.fotos[0] ?? null, fotos: r.fotos, foto_posicion_y: input.foto_posicion_y ?? r.posicionY },
            avisos: r.avisos,
        }
    }

    const withWarnings = (prefix: string, avisos: string[]) => (avisos.length ? `${prefix}\n⚠️ ${avisos.join("\n⚠️ ")}` : prefix)

    server.registerTool(
        "guardar_coche",
        {
            title: "Guardar coche",
            description:
                "Guarda un coche de un anuncio alemán en 'Guardados por Claude'. Solo la URL es obligatoria. La app calcula el coste total " +
                "en España y el beneficio con su fórmula. Si la URL ya está guardada, actualiza ese coche (solo los campos que mandes) en vez de duplicarlo. " +
                "Devuelve el coche guardado con sus cálculos.",
            inputSchema: { url: urlSchema, ...optionalCarFields },
        },
        async (args) => logged(client, "guardar_coche", async () => {
            const url = normalizeListingUrl(args.url)
            const incoming = defined({ ...args, url }) as ClaudeCarFields
            const [owner, settings, existing] = await Promise.all([
                ownerId(client),
                costSettings(client),
                client.from(CARS_TABLE).select("*").eq("url", url).maybeSingle(),
            ])
            if (existing.error) throw new Error(existing.error.message)

            const merged = { ...(existing.data ?? {}), ...incoming } as ClaudeCarFields
            const photos = await photoColumns(incoming, (existing.data?.fotos as string[] | undefined) ?? [])
            const row = { ...incoming, ...photos.columns, ...computeClaudeCar(merged, settings), updated_at: new Date().toISOString() }

            const saved = existing.data
                ? await client.from(CARS_TABLE).update(row).eq("id", existing.data.id).select("*").single()
                : await client.from(CARS_TABLE).insert({ ...row, user_id: owner, estado: "nuevo" }).select("*").single()
            if (saved.error) throw new Error(saved.error.message)
            const car = saved.data as ClaudeCar
            const action = existing.data ? "Actualizado (la URL ya estaba guardada)" : "Guardado"
            const fotosInfo = car.fotos?.length ? ` · ${car.fotos.length} foto(s)` : ""
            return {
                result: carResult(car, withWarnings(`${action} en 'Guardados por Claude'.`, photos.avisos)),
                carId: car.id,
                resumen: `${action}: ${carName(car)}${fotosInfo}${photos.avisos.length ? ` · ${photos.avisos.length} foto(s) sin copiar` : ""}`,
            }
        }),
    )

    server.registerTool(
        "listar_coches",
        {
            title: "Listar coches",
            description:
                "Lista los coches de 'Guardados por Claude', del más reciente al más antiguo, con su coste total en España y su beneficio calculados. " +
                "Filtros opcionales: estado, marca y beneficio mínimo en euros.",
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
            const cars = (data ?? []) as ClaudeCar[]
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
                "Si cambian datos que afectan al precio, la app recalcula el coste y el beneficio. Devuelve el coche actualizado.",
            inputSchema: {
                id: z.string().uuid().describe("id del coche (lo devuelven guardar_coche y listar_coches)"),
                url: urlSchema.optional(),
                estado: stateSchema.optional().describe("Nuevo estado"),
                ...optionalCarFields,
            },
        },
        async ({ id, ...changes }) => logged(client, "actualizar_coche", async () => {
            const patch = defined({ ...changes, url: changes.url ? normalizeListingUrl(changes.url) : undefined }) as Partial<ClaudeCar>
            if (Object.keys(patch).length === 0) return { result: errorResult("No has indicado ningún cambio."), carId: id }

            const current = await client.from(CARS_TABLE).select("*").eq("id", id).maybeSingle()
            if (current.error) throw new Error(current.error.message)
            if (!current.data) return { result: errorResult(`No existe ningún coche de Claude con id ${id}.`), carId: id }

            const photos = await photoColumns(patch, (current.data.fotos as string[] | undefined) ?? [])
            let row: Record<string, unknown> = { ...patch, ...photos.columns, updated_at: new Date().toISOString() }
            if (CALC_KEYS.some(key => key in patch)) {
                const settings = await costSettings(client)
                row = { ...row, ...computeClaudeCar({ ...current.data, ...patch } as ClaudeCarFields, settings) }
            }
            const saved = await client.from(CARS_TABLE).update(row).eq("id", id).select("*").single()
            if (saved.error) throw new Error(saved.error.message)
            const car = saved.data as ClaudeCar
            return { result: carResult(car, withWarnings("Actualizado.", photos.avisos)), carId: id, resumen: `${carName(car)}: ${Object.keys(patch).join(", ")}` }
        }),
    )

    server.registerTool(
        "borrar_coche",
        {
            title: "Borrar coche",
            description: "Borra definitivamente un coche de 'Guardados por Claude', por su id. Para apartarlo sin borrarlo, usa actualizar_coche con estado 'descartado'.",
            inputSchema: { id: z.string().uuid().describe("id del coche") },
            annotations: { destructiveHint: true },
        },
        async ({ id }) => logged(client, "borrar_coche", async () => {
            const { data, error } = await client.from(CARS_TABLE).delete().eq("id", id).select("*").maybeSingle()
            if (error) throw new Error(error.message)
            if (!data) return { result: errorResult(`No existe ningún coche de Claude con id ${id}.`), carId: id }
            const car = data as ClaudeCar
            // Si se movió a "mis coches", sus fotos siguen en uso allí
            if (!car.movido_a && car.fotos?.length) await deleteUnusedPhotos(client, env.SUPABASE_URL, car.fotos).catch(e => console.error("No se pudieron borrar las fotos:", e))
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
