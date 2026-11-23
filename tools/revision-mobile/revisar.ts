/**
 * Revisión diaria de los anuncios de mobile.de desde el PC de casa (mobile.de bloquea al servidor de Cloudflare, pero no a
 * la conexión de casa). La lanza el Programador de tareas (instalar-tarea.ps1) a las 06:00, al iniciar sesión y al
 * arrancar el PC; solo se hace UNA vez al día.
 *
 *   npx tsx tools/revision-mobile/revisar.ts             → revisión normal
 *   npx tsx tools/revision-mobile/revisar.ts --forzar    → aunque ya se haya hecho hoy
 *   npx tsx tools/revision-mobile/revisar.ts --simular   → no guarda nada (solo log)
 *   npx tsx tools/revision-mobile/revisar.ts --max 5     → como mucho 5 anuncios (pruebas)
 *
 * Variables (tools/revision-mobile/.env, no se sube a git):
 *   LOCAL_REVIEW_TOKEN      el mismo secreto que tiene el Worker (obligatorio)
 *   NORDRIVE_API_URL        por defecto https://nordrive-mcp.infonordrive.workers.dev
 *   PAIS_CASA               ES (si la IP sale por otro país, se asume VPN)
 *   SUSPENDER_AL_TERMINAR   1 = volver a suspender el PC al terminar (solo si nadie lo está usando: 5 min sin teclado ni ratón)
 *   NAVEGADOR               chromium (por defecto) o chrome
 *   VISIBLE                 1 (por defecto) = ventana del navegador visible; 0 = sin ventana
 *
 * Pasos: ¿ya hecha hoy? → ¿hay internet y NO hay VPN? (reintenta cada 5 min hasta 1 h) → lista de coches de mobile.de
 * (/api/anuncios/mobile) → abre suchen.mobile.de con un perfil propio de Chromium → por cada anuncio, fetch dentro de la
 * página a /fahrzeuge/details.html?id=ID con 0,9–1,6 s de pausa → resultados a /api/anuncios/marcar en tandas de 10.
 * 403 o captcha → no se marca nada, espera 5 min y sigue más despacio; al 3.er bloqueo seguido, aborta y avisa.
 * Si la PRIMERA consulta da 403, no sigue (casi seguro VPN o bloqueo) y avisa.
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { chromium, type BrowserContext, type Page } from "@playwright/test"
import { classifyMobileQuick, madridDate, mobileBlockAction, mobilePauseMs, type MobileQuickFetch } from "../../lib/listing-check"
import { adaptadorVpn, cuentaVacia, RED_MAX_ESPERA_MS, RED_REINTENTO_MS, vpnSospechosa, yaRevisadoHoy, type Cuenta, type IpInfo } from "./comun"

const here = path.dirname(fileURLToPath(import.meta.url))
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const flag = (n: string) => process.argv.includes(n)
const FORZAR = flag("--forzar")
const SIMULAR = flag("--simular")
const MAX = Number(arg("--max") ?? Infinity)
const TANDA = 10
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- Configuración, log y estado ----------------------------------------------------------------------------------------

function cargarEnv() {
    const f = path.join(here, ".env")
    if (!fs.existsSync(f)) return
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
}
cargarEnv()
const API = (process.env.NORDRIVE_API_URL || "https://nordrive-mcp.infonordrive.workers.dev").replace(/\/+$/, "")
const TOKEN = process.env.LOCAL_REVIEW_TOKEN ?? ""
const PAIS_CASA = process.env.PAIS_CASA || "ES"
const SUSPENDER = process.env.SUSPENDER_AL_TERMINAR === "1"
const NAVEGADOR = process.env.NAVEGADOR === "chrome" ? "chrome" : "chromium"
const VISIBLE = process.env.VISIBLE !== "0"

const HOY = madridDate()
const LOGS = path.join(here, "logs")
const ESTADO = path.join(here, "estado.json")
const PERFIL = path.join(here, "perfil")
fs.mkdirSync(LOGS, { recursive: true })
const logFile = path.join(LOGS, `${HOY}.log`)
function log(...a: unknown[]) {
    const line = `${new Date().toLocaleTimeString("es-ES")} ${a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`
    console.log(line)
    fs.appendFileSync(logFile, line + "\n")
}

function leerEstado(): { ultima_completa?: string } {
    try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")) } catch { return {} }
}
function guardarEstado(e: { ultima_completa?: string; ultimo_intento?: string; motivo?: string }) {
    fs.writeFileSync(ESTADO, JSON.stringify({ ...leerEstado(), ...e }, null, 2))
}

/** Notificación de Windows (globo en la esquina); si falla, solo queda en el log */
function avisar(titulo: string, texto: string) {
    log(`AVISO: ${titulo} — ${texto}`)
    const esc = (s: string) => s.replace(/'/g, "''")
    const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x = $t.GetElementsByTagName('text')
$x.Item(0).AppendChild($t.CreateTextNode('${esc(titulo)}')) > $null
$x.Item(1).AppendChild($t.CreateTextNode('${esc(texto)}')) > $null
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($t))`
    try {
        execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { stdio: "ignore", timeout: 15_000 })
    } catch { /* sin notificación */ }
}

/** Segundos sin tocar teclado ni ratón (para no suspender el PC si lo estás usando) */
function segundosInactivo(): number {
    const ps = `Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Idle { [StructLayout(LayoutKind.Sequential)] struct L { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref L l);
  public static uint Seconds() { L l = new L(); l.cbSize = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return ((uint)Environment.TickCount - l.dwTime) / 1000; } }
'@
[Idle]::Seconds()`
    try {
        return Number(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { encoding: "utf8", timeout: 20_000 }).trim())
    } catch { return 0 }
}

function suspender() {
    log("Volviendo a suspender el PC…")
    const ps = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) | Out-Null"
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { detached: true, stdio: "ignore" }).unref()
}

// --- API del Worker ------------------------------------------------------------------------------------------------------

interface CocheMobile { id: string; idMobile: string | null; url: string; precio: number | null; nombre: string; revisado_hoy: boolean }

async function api<T>(ruta: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${ruta}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    })
    const txt = await res.text()
    if (!res.ok) throw new Error(`${ruta}: HTTP ${res.status} ${txt.slice(0, 200)}`)
    return JSON.parse(txt) as T
}

// --- Red: internet y VPN --------------------------------------------------------------------------------------------------

function adaptadoresActivos(): string[] {
    try {
        const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
            "Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { $_.Name + ' | ' + $_.InterfaceDescription }"], { encoding: "utf8", timeout: 20_000 })
        return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    } catch { return [] }
}

/** null = todo bien; si no, el problema ("sin internet", "VPN…") */
async function problemaDeRed(): Promise<string | null> {
    const vpn = adaptadorVpn(adaptadoresActivos())
    if (vpn) return `VPN activa (adaptador "${vpn}")`
    let info: IpInfo
    try {
        const res = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } })
        info = (await res.json()) as IpInfo
    } catch (e) {
        return `sin internet (${e instanceof Error ? e.message : String(e)})`
    }
    const sospecha = vpnSospechosa(info, PAIS_CASA)
    return sospecha ? `posible VPN: ${sospecha}` : null
}

/** Espera a tener internet sin VPN: reintenta cada 5 min hasta 1 h */
async function esperarRed(): Promise<string | null> {
    const fin = Date.now() + RED_MAX_ESPERA_MS
    for (;;) {
        const p = await problemaDeRed()
        if (!p) return null
        if (Date.now() + RED_REINTENTO_MS > fin) return p
        log(`Red no válida (${p}); reintento en 5 min`)
        await sleep(RED_REINTENTO_MS)
    }
}

// --- mobile.de dentro de la página -----------------------------------------------------------------------------------------

async function pedirFicha(page: Page, idMobile: string): Promise<MobileQuickFetch> {
    return page.evaluate(async (id: string) => {
        const r = await fetch(`/fahrzeuge/details.html?id=${encodeURIComponent(id)}`, { credentials: "include", headers: { Accept: "text/html" } })
        const t = await r.text()
        const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(t) || [])[1] || null
        const head = t.slice(0, 300_000)
        return {
            status: r.status,
            url: r.url,
            title,
            gone: /nicht mehr verf(ü|ue|&uuml;)gbar|Inserat (ist )?(nicht mehr|gelöscht)|no longer available/i.test(head),
            blocked: /captcha|px-captcha|Zugriff verweigert|access denied|ungew(ö|oe)hnliche Aktivit|unusual traffic/i.test(head),
        }
    }, idMobile)
}

// --- Revisión --------------------------------------------------------------------------------------------------------------

type Pendiente = { id: string; estado: "activo" | "retirado"; precio: number | null; motivo: string; http_status: number }

async function main() {
    const inicio = new Date()
    log(`=== Revisión de mobile.de · ${HOY}${SIMULAR ? " · SIMULACIÓN" : ""}${FORZAR ? " · forzada" : ""} ===`)
    if (!TOKEN || TOKEN.length < 32) {
        avisar("NorDrive · revisión mobile.de", "Falta LOCAL_REVIEW_TOKEN en tools/revision-mobile/.env")
        process.exitCode = 1
        return
    }
    if (!FORZAR && leerEstado().ultima_completa === HOY) { log("Ya se hizo hoy (estado.json). Nada que hacer."); return }

    // 1) Internet y VPN (antes de tocar mobile.de)
    const red = await esperarRed()
    if (red) {
        guardarEstado({ ultimo_intento: new Date().toISOString(), motivo: red })
        await fin(inicio, cuentaVacia(), false, `no se revisa: ${red}`).catch(() => {})
        avisar("NorDrive · revisión mobile.de NO hecha", `${red}. Quita la VPN o revisa la conexión; se reintentará al iniciar sesión.`)
        process.exitCode = 2
        return
    }

    // 2) Lista de coches
    const lista = await api<{ fecha: string; ya_revisado_hoy: boolean; coches: CocheMobile[] }>("/api/anuncios/mobile")
    if (!FORZAR && yaRevisadoHoy(HOY, leerEstado().ultima_completa, lista.ya_revisado_hoy)) {
        log("Ya se hizo hoy (tabla revisiones). Nada que hacer.")
        guardarEstado({ ultima_completa: HOY })
        return
    }
    const pendientes = lista.coches.filter(c => c.idMobile && (FORZAR || !c.revisado_hoy)).slice(0, MAX)
    const sinId = lista.coches.filter(c => !c.idMobile)
    if (sinId.length) log(`${sinId.length} coche(s) de mobile.de sin id en la URL (no se pueden revisar):`, sinId.map(c => c.url))
    log(`${lista.coches.length} coches de mobile.de; ${pendientes.length} por revisar hoy`)
    if (!pendientes.length) {
        await fin(inicio, cuentaVacia(), true, null)
        guardarEstado({ ultima_completa: HOY })
        return
    }

    // 3) Navegador con perfil propio (cookies de mobile.de guardadas entre días)
    let ctx: BrowserContext | null = null
    const cuenta: Cuenta = cuentaVacia()
    let motivoFallo: string | null = null
    try {
        ctx = await chromium.launchPersistentContext(PERFIL, {
            headless: !VISIBLE,
            channel: NAVEGADOR === "chrome" ? "chrome" : undefined,
            locale: "de-DE",
            viewport: { width: 1280, height: 860 },
            args: VISIBLE ? ["--start-minimized"] : [],
        })
        const page = ctx.pages()[0] ?? (await ctx.newPage())
        const portada = await page.goto("https://suchen.mobile.de/", { waitUntil: "domcontentloaded", timeout: 45_000 })
        const st = portada?.status() ?? 0
        if (st === 403 || st === 429) throw new BloqueoInicial(`la portada de mobile.de da HTTP ${st}`)
        await sleep(1500)

        let ritmo = 1
        let bloqueos = 0
        let primera = true
        const buffer: Pendiente[] = []
        const enviar = async () => {
            if (!buffer.length) return
            const lote = buffer.splice(0, buffer.length)
            if (SIMULAR) { log(`(simulación) no se envían ${lote.length} resultados`); return }
            const r = await api<{ guardados: number; cambios: { nombre: string; cambios: string[] }[] }>("/api/anuncios/marcar", { resultados: lote })
            for (const c of r.cambios) {
                const txt = c.cambios.join("; ")
                if (/SUBE|BAJA|VENDIDO|retirado/.test(txt)) log(`  ${c.nombre}: ${txt}`)
                if (/SUBE|BAJA/.test(txt)) cuenta.cambios_precio++
            }
        }

        for (let i = 0; i < pendientes.length; i++) {
            const car = pendientes[i]
            if (!primera) await sleep(mobilePauseMs(ritmo))
            let f: MobileQuickFetch
            try {
                f = await pedirFicha(page, car.idMobile!)
            } catch (e) {
                cuenta.errores++
                log(`✗ ${car.nombre}: error al pedir la ficha (${e instanceof Error ? e.message : e})`)
                primera = false
                continue
            }
            const r = classifyMobileQuick(f)
            if (r.bloqueado) {
                if (primera) throw new BloqueoInicial(`la primera consulta da ${r.motivo}`)
                bloqueos++
                const a = mobileBlockAction(bloqueos)
                if (a.accion === "abortar") throw new Error(`mobile.de bloquea (${r.motivo}) ${bloqueos} veces seguidas`)
                log(`⚠ Bloqueo (${r.motivo}) en ${car.nombre}; espero ${a.esperaMs / 60_000} min y sigo más despacio (×${a.ritmo})`)
                await enviar()
                await sleep(a.esperaMs)
                ritmo = a.ritmo
                i-- // se reintenta el mismo anuncio
                continue
            }
            primera = false
            bloqueos = 0
            if (r.resultado === "no_comprobado") {
                cuenta.errores++
                log(`? ${car.nombre}: ${r.motivo}`)
                continue
            }
            cuenta.revisados++
            if (r.resultado === "activo") cuenta.activos++
            else cuenta.retirados++
            const cambio = r.precio && car.precio && Math.abs(r.precio - car.precio) > 1 ? ` (antes ${car.precio} €)` : ""
            log(`${r.resultado === "activo" ? "✓" : "✗"} ${car.nombre}: ${r.resultado}${r.precio ? ` · ${r.precio} €${cambio}` : ""}${r.resultado === "retirado" ? ` · ${r.motivo}` : ""}`)
            buffer.push({ id: car.id, estado: r.resultado, precio: r.precio, motivo: r.motivo, http_status: r.http_status ?? 200 })
            if (buffer.length >= TANDA) await enviar()
        }
        await enviar()
    } catch (e) {
        motivoFallo = e instanceof BloqueoInicial ? `posible VPN o bloqueo: ${e.message}` : (e instanceof Error ? e.message : String(e))
    } finally {
        await ctx?.close().catch(() => {})
    }

    const completa = !motivoFallo
    log(`Fin: ${cuenta.revisados} revisados · ${cuenta.activos} activos · ${cuenta.retirados} retirados · ${cuenta.cambios_precio} cambios de precio · ${cuenta.errores} errores${motivoFallo ? ` · ABORTADA: ${motivoFallo}` : ""}`)
    await fin(inicio, cuenta, completa, motivoFallo).catch(e => log(`No se pudo guardar el resumen: ${e instanceof Error ? e.message : e}`))
    if (completa) {
        if (!SIMULAR) guardarEstado({ ultima_completa: HOY, ultimo_intento: new Date().toISOString(), motivo: undefined })
        if (cuenta.retirados || cuenta.cambios_precio) avisar("NorDrive · mobile.de revisado", `${cuenta.revisados} anuncios: ${cuenta.retirados} retirados, ${cuenta.cambios_precio} cambios de precio`)
    } else {
        guardarEstado({ ultimo_intento: new Date().toISOString(), motivo: motivoFallo ?? undefined })
        avisar("NorDrive · revisión mobile.de INCOMPLETA", `${motivoFallo}. Se reintentará al iniciar sesión.`)
        process.exitCode = 3
    }
}

class BloqueoInicial extends Error {}

async function fin(inicio: Date, c: Cuenta, completa: boolean, motivo: string | null) {
    if (SIMULAR) return
    await api("/api/anuncios/fin", { inicio: inicio.toISOString(), ...c, completa, detalle: motivo ? { motivo } : {} })
}

main()
    .catch(e => {
        avisar("NorDrive · revisión mobile.de con error", e instanceof Error ? e.message : String(e))
        process.exitCode = 1
    })
    .finally(() => {
        // Solo si está configurado y nadie está usando el PC (más de 5 min sin teclado ni ratón: lo ha despertado la tarea)
        if (SUSPENDER) {
            const inactivo = segundosInactivo()
            if (inactivo >= 300) suspender()
            else log(`No se suspende: el PC está en uso (última actividad hace ${inactivo} s)`)
        }
    })
