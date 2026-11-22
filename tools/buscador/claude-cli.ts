// Lectura de anuncios con Claude usando la suscripción (Claude Code en modo no interactivo, `claude -p`), no la API.
// Se arranca "en limpio" (sin MCP, sin ajustes, sin herramientas, prompt de sistema propio) para que cada ficha gaste
// ~1.500 tokens y no ~90.000. La salida se valida con --json-schema.
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ESQUEMA_LECTURA, SISTEMA_LECTURA, mensajeLectura, type LecturaIA } from "../../lib/buscador/ia"

export const MODELO_IA = process.env.NORDRIVE_IA_MODELO || "claude-opus-5-5"

/** claude.exe: CLAUDE_EXE, el de la extensión de VS Code más reciente o `claude` del PATH */
export function rutaClaude(): string {
    if (process.env.CLAUDE_EXE && fs.existsSync(process.env.CLAUDE_EXE)) return process.env.CLAUDE_EXE
    const ext = path.join(os.homedir(), ".vscode", "extensions")
    try {
        const dirs = fs.readdirSync(ext).filter(d => d.startsWith("anthropic.claude-code-")).sort().reverse()
        for (const d of dirs) {
            const exe = path.join(ext, d, "resources", "native-binary", process.platform === "win32" ? "claude.exe" : "claude")
            if (fs.existsSync(exe)) return exe
        }
    } catch { /* sin extensión */ }
    return "claude"
}

/** Lee un anuncio con Claude y devuelve el JSON validado */
export async function leerAnuncio(an: Parameters<typeof mensajeLectura>[0]): Promise<LecturaIA> {
    const args = [
        "-p", "--output-format", "json", "--no-session-persistence",
        "--model", MODELO_IA,
        "--system-prompt", SISTEMA_LECTURA,
        "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
        "--setting-sources", "",
        "--tools", "",
        "--json-schema", JSON.stringify(ESQUEMA_LECTURA),
    ]
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nordrive-ia-"))
    const salida = await new Promise<string>((resolve, reject) => {
        const p = spawn(rutaClaude(), args, { cwd, windowsHide: true })
        let out = "", err = ""
        const timer = setTimeout(() => { p.kill(); reject(new Error("la IA no ha respondido en 3 min")) }, 180_000)
        p.stdout.on("data", d => (out += d))
        p.stderr.on("data", d => (err += d))
        p.on("error", e => { clearTimeout(timer); reject(e) })
        p.on("close", code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`claude salió con ${code}: ${(err || out).slice(0, 300)}`)) })
        // La descripción va por la entrada estándar (puede ser larga para la línea de comandos de Windows)
        p.stdin.end(mensajeLectura(an))
    })
    fs.rmSync(cwd, { recursive: true, force: true })
    const j = JSON.parse(salida)
    if (j.is_error) throw new Error(`IA: ${String(j.result).slice(0, 200)}`)
    const lectura = j.structured_output ?? (typeof j.result === "string" ? JSON.parse(j.result) : j.result)
    if (!lectura || typeof lectura !== "object" || !Array.isArray(lectura.alertas)) throw new Error("IA: respuesta sin el JSON esperado")
    return lectura as LecturaIA
}
