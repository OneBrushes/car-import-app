// Acceso a Supabase desde el Worker. Usa la clave de servicio, así que AQUÍ está la frontera de seguridad:
// el Worker solo toca coches_claude, mcp_logs, mcp_config (lectura), company_settings (lectura) y el bucket de
// Storage "coches-claude" (photos.ts). Nunca imported_cars ni ninguna otra tabla con tus coches.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { IMPORT_COSTS_SETTING_KEY, normalizeImportCostSettings, type ImportCostSettings } from "../../../lib/import-costs"
import type { Env } from "./env"

export const CARS_TABLE = "coches_claude"
const LOGS_TABLE = "mcp_logs"

export function db(env: Env): SupabaseClient {
    return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-client-info": "nordrive-mcp" } },
    })
}

/** Cuenta dueña de los coches de Claude (mcp_config.owner_id) */
export async function ownerId(client: SupabaseClient): Promise<string> {
    const { data, error } = await client.from("mcp_config").select("owner_id").maybeSingle()
    if (error) throw new Error(`No se pudo leer mcp_config: ${error.message}`)
    if (!data?.owner_id) throw new Error("Falta el dueño en mcp_config: ejecuta supabase/2026-11_coches_claude.sql con tu email")
    return data.owner_id as string
}

/** Gastos fijos y comunidad por defecto (los mismos que usa la Calculadora) */
export async function costSettings(client: SupabaseClient): Promise<ImportCostSettings> {
    const { data } = await client.from("company_settings").select("value").eq("key", IMPORT_COSTS_SETTING_KEY).maybeSingle()
    return normalizeImportCostSettings(data?.value)
}

export async function logCall(client: SupabaseClient, entry: { herramienta: string; ok: boolean; coche_id?: string | null; resumen?: string; error?: string }) {
    console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }))
    const { error } = await client.from(LOGS_TABLE).insert({
        herramienta: entry.herramienta,
        ok: entry.ok,
        coche_id: entry.coche_id ?? null,
        resumen: entry.resumen?.slice(0, 500) ?? null,
        error: entry.error?.slice(0, 1000) ?? null,
    })
    if (error) console.error("No se pudo guardar el registro de la llamada:", error.message)
}
