// Gastos fijos de importación guardados en Supabase (company_settings 'import_costs').
// Los leen la Calculadora y el servidor MCP (workers/nordrive-mcp/src/db.ts) para que el coste sea el mismo.
import { supabase } from "./supabase"
import { IMPORT_COSTS_SETTING_KEY, normalizeImportCostSettings, type ImportCostSettings } from "./import-costs"

export async function loadImportCostSettings(): Promise<ImportCostSettings> {
    const { data } = await supabase.from("company_settings").select("value").eq("key", IMPORT_COSTS_SETTING_KEY).maybeSingle()
    return normalizeImportCostSettings(data?.value)
}

/** Solo admin y super_admin (política company_settings_write) */
export async function saveImportCostSettings(settings: ImportCostSettings) {
    const { error } = await supabase
        .from("company_settings")
        .upsert({ key: IMPORT_COSTS_SETTING_KEY, value: normalizeImportCostSettings(settings), updated_at: new Date().toISOString() })
    if (error) throw error
}
