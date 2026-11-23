// Worker de Cloudflare "nordrive-mcp": servidor MCP remoto para que Claude (claude.ai) guarde coches en
// la pestaña "Guardados por Claude" de la app.
//
//   /mcp                    → servidor MCP (Streamable HTTP). Pide un token OAuth, o "Authorization: Bearer MCP_SECRET"
//                             (para el MCP Inspector).
//   /authorize              → pantalla donde autorizas a claude.ai escribiendo MCP_SECRET (solo la primera vez).
//   /oauth/token, /oauth/register, /.well-known/*  → los sirve @cloudflare/workers-oauth-provider.
//
// Despliegue: ver workers/nordrive-mcp/README.md
import { AuthorizationError, CimdFetchError, OAuthProvider, type ConsentDescription } from "@cloudflare/workers-oauth-provider"
import { handleMcp, refreshCarPhotos } from "./mcp"
import { CARS_TABLE, costSettings, db, logCall, ownerId } from "./db"
import { reviewCars, runDailyBatch, saveReviews, saveSummary, reviewableCars, SUMMARY_TABLE } from "./revision"
import { compareReviewPriority, listingPortal, madridDate, madridHour, mobileAdId, planReview, reviewedToday, type CarRow } from "../../../lib/listing-check"
import type { Env } from "./env"

const SCOPE = "coches"

let provider: OAuthProvider<Env> | null = null
let providerUrl = ""

function getProvider(env: Env): OAuthProvider<Env> {
    const base = env.PUBLIC_URL.replace(/\/+$/, "")
    if (provider && providerUrl === base) return provider
    const resource = `${base}/mcp`
    providerUrl = base
    provider = new OAuthProvider<Env>({
        apiRoute: "/mcp",
        apiHandler: { fetch: (request, handlerEnv) => handleMcp(request, handlerEnv as Env) },
        defaultHandler: { fetch: (request, handlerEnv) => defaultHandler(request, handlerEnv as Env) },
        authorizeEndpoint: "/authorize",
        tokenEndpoint: "/oauth/token",
        clientRegistrationEndpoint: "/oauth/register",
        clientIdMetadataDocumentEnabled: true,
        scopesSupported: [SCOPE],
        requiredScopes: [SCOPE],
        resourceMetadata: { resource, authorization_servers: [base] },
        accessTokenTTL: 3600,
        refreshTokenTTL: 90 * 86400,
        // Bearer MCP_SECRET: para probar con el MCP Inspector sin pasar por OAuth
        resolveExternalToken: async ({ token, env: e }) =>
            e.MCP_SECRET && safeEqual(token, e.MCP_SECRET) ? { props: { via: "secret" }, audience: resource } : null,
    })
    return provider
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const missing = ["PUBLIC_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MCP_SECRET"].filter(k => !(env as unknown as Record<string, unknown>)[k])
        if (missing.length) return text(`Faltan variables del Worker: ${missing.join(", ")}`, 500)
        if (env.MCP_SECRET.length < 32) return text("MCP_SECRET debe tener al menos 32 caracteres", 500)
        return getProvider(env).fetch(request, env, ctx)
    },

    // Revisión diaria de anuncios: el cron salta cada 5 min de 04:00 a 05:59 UTC y solo trabaja a las 6 de Madrid
    // (06:00–06:55, en invierno y en verano). Cada ejecución revisa la siguiente tanda de coches pendientes de hoy (sin mobile.de).
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        if (madridHour(new Date(controller.scheduledTime)) !== 6) return
        ctx.waitUntil((async () => {
            const client = db(env)
            try {
                const { revisados, quedan, results } = await runDailyBatch(client, await costSettings(client))
                if (!revisados) return
                const count = (r: string) => results.filter(x => x.resultado === r).length
                const vendidos = results.filter(x => x.patch.estado === "retirado").length
                const precios = results.filter(x => "precio_alemania" in x.patch).length
                await logCall(client, {
                    herramienta: "revision_diaria", ok: true,
                    resumen: `${revisados} revisados · ${count("activo")} activos · ${count("retirado")} retirados${vendidos ? ` (${vendidos} pasan a vendido / retirado)` : ""} · ${count("no_comprobado")} sin comprobar${precios ? ` · ${precios} cambios de precio` : ""} · quedan ${quedan}`,
                })
            } catch (e) {
                await logCall(client, { herramienta: "revision_diaria", ok: false, error: e instanceof Error ? e.message : String(e) })
            }
        })())
    },
} satisfies ExportedHandler<Env>

// --- Pantalla de autorización ---------------------------------------------------------------------------------------

async function defaultHandler(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/" && request.method === "GET") return text("NorDrive MCP · el servidor está en /mcp")
    if (url.pathname === "/api/fotos") return photosApi(request, env)
    if (url.pathname === "/api/revision") return revisionApi(request, env)
    if (url.pathname.startsWith("/api/anuncios/")) return localReviewApi(request, env, url.pathname)
    if (url.pathname !== "/authorize") return text("No encontrado", 404)

    const oauth = env.OAUTH_PROVIDER
    try {
        if (request.method === "GET") {
            const authRequest = await oauth.parseAuthRequest(request)
            const details = await oauth.describeConsent(authRequest)
            const consent = await oauth.beginConsent(authRequest)
            consent.headers.set("Content-Type", "text/html; charset=utf-8")
            return new Response(consentPage(details, consent.handle), { headers: consent.headers })
        }
        if (request.method === "POST") {
            const form = await request.formData()
            const handle = String(form.get("handle") ?? "")
            if (form.get("decision") !== "approve") {
                const denied = await oauth.denyConsent(request, handle)
                return new Response(null, { status: 302, headers: denied.headers })
            }
            if (!safeEqual(String(form.get("secret") ?? ""), env.MCP_SECRET)) {
                await new Promise(r => setTimeout(r, 1500)) // frena los intentos a ciegas
                // No se consume el handle: se puede volver atrás y reintentar (vale 10 minutos en este navegador)
                return text("Clave incorrecta. Vuelve atrás e inténtalo de nuevo.", 403)
            }
            const approved = await oauth.approveConsent(request, handle, { scope: [SCOPE] })
            const { redirectTo } = await oauth.completeAuthorization({
                request: approved.request,
                userId: "owner",
                metadata: { label: "NorDrive · Guardados por Claude" },
                scope: approved.request.scope,
                props: { via: "oauth" },
            })
            approved.headers.set("Location", redirectTo)
            return new Response(null, { status: 302, headers: approved.headers })
        }
        return text("Método no permitido", 405)
    } catch (error) {
        if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302)
        if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
            const message = error instanceof AuthorizationError ? error.description : "No se ha podido verificar la aplicación."
            return text(message, 400)
        }
        throw error
    }
}

// --- Botón "Actualizar fotos" de la app ------------------------------------------------------------------------------
// POST /api/fotos  { id }  con "Authorization: Bearer <sesión de Supabase>". Solo la cuenta dueña (mcp_config).

const APP_ORIGINS = ["https://app.nordrivecars.com", "http://localhost:3000"]

async function photosApi(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? ""
    const cors: Record<string, string> = {
        "Access-Control-Allow-Origin": APP_ORIGINS.includes(origin) ? origin : APP_ORIGINS[0],
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
    }
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405)

    const auth = request.headers.get("Authorization") ?? ""
    if (!auth.startsWith("Bearer ")) return json({ error: "Falta la sesión" }, 401)
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth } })
    if (!userRes.ok) return json({ error: "Sesión no válida" }, 401)
    const user = (await userRes.json()) as { id?: string }
    const client = db(env)
    if (!user.id || user.id !== (await ownerId(client))) return json({ error: "Solo la cuenta dueña puede hacer esto" }, 403)

    const body = (await request.json().catch(() => ({}))) as { id?: string; fotos?: unknown }
    const given = Array.isArray(body.fotos) ? body.fotos.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 60) : undefined
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: "Falta el id del coche" }, 400)
    try {
        const result = await refreshCarPhotos(client, env, body.id, given)
        if (!result) return json({ error: "No existe ese coche" }, 404)
        await logCall(client, {
            herramienta: given ? "actualizar_fotos (app, pegadas)" : "actualizar_fotos (app)", ok: true, coche_id: body.id,
            resumen: `${result.car.fotos?.length ?? 0} foto(s)${result.leidas != null ? ` de ${result.leidas} del anuncio` : ""}${result.pendientes ? ` · ${result.pendientes} pendientes` : ""}`,
            error: result.avisos.length ? result.avisos.join(" · ") : undefined,
        })
        return json(result)
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await logCall(client, { herramienta: "actualizar_fotos (app)", ok: false, coche_id: body.id, error: message })
        return json({ error: message }, 500)
    }
}

const escape = (value: string) => value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

function consentPage(d: ConsentDescription, handle: string): string {
    const name = escape(d.clientName || "Aplicación")
    const origin = d.clientDomain
        ? `Publicada por <strong>${escape(d.clientDomain)}</strong>.`
        : "Esta aplicación se ha registrado sola: su nombre no está verificado."
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar ${name} · NorDrive</title>
<style>
  :root{color-scheme:light dark;--bg:#f6f6f4;--card:#fff;--fg:#151515;--muted:#666;--line:#ddd;--accent:#0b5cff}
  @media (prefers-color-scheme:dark){:root{--bg:#111;--card:#1b1b1b;--fg:#eee;--muted:#999;--line:#333;--accent:#5b8cff}}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:16px}
  main{max-width:420px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px}
  h1{font-size:19px;margin:0 0 12px} p{margin:0 0 12px;color:var(--muted)} strong{color:var(--fg)}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
  .row{display:flex;gap:8px;margin-top:16px} button{flex:1;padding:10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;cursor:pointer}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff} .warn{color:#c2410c}
</style></head><body><main>
<h1>¿Permitir que ${name} guarde coches en NorDrive?</h1>
<p>${origin} El acceso se enviará a <strong>${escape(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn"><strong>Esto envía el acceso a una aplicación de tu ordenador.</strong> Sigue solo si acabas de iniciar la conexión desde ella.</p>' : ""}
<p>Podrá guardar, listar, cambiar y borrar coches <strong>solo</strong> en «Guardados por Claude». Nunca tus coches.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <label for="secret"><p>Clave del servidor (MCP_SECRET)</p></label>
  <input id="secret" name="secret" type="password" autocomplete="current-password" required>
  <div class="row"><button name="decision" value="deny" formnovalidate>Cancelar</button><button class="primary" name="decision" value="approve">Permitir</button></div>
</form></main></body></html>`
}

function text(body: string, status = 200) {
    return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

/** Comparación en tiempo constante (no revela por dónde falla la clave) */
function safeEqual(a: string, b: string): boolean {
    const enc = new TextEncoder()
    const x = enc.encode(a)
    const y = enc.encode(b)
    let diff = x.length ^ y.length
    for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
    return diff === 0
}

// POST /api/revision  { ids: [...], simular?: true }  con "Authorization: Bearer MCP_SECRET".
// Revisa esos anuncios ahora mismo (de uno en uno, con pausa). Por defecto en simulación: no guarda nada.
async function revisionApi(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return text("Usa POST", 405)
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    if (!token || !safeEqual(token, env.MCP_SECRET)) return text("No autorizado", 401)
    const body = (await request.json().catch(() => ({}))) as { ids?: string[]; simular?: boolean }
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 10) return text("Pasa entre 1 y 10 ids", 400)
    const client = db(env)
    const [{ data, error }, settings] = await Promise.all([client.from(CARS_TABLE).select("*").in("id", body.ids), costSettings(client)])
    if (error) return text(error.message, 500)
    const order = new Map(body.ids.map((id, i) => [id, i]))
    const cars = (data ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const simular = body.simular !== false
    const results = await reviewCars(client, cars as never, settings, { simular, origen: "api" })
    return new Response(JSON.stringify({ simular, results }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } })
}

// --- Script del PC de casa: revisión de mobile.de (tools/revision-mobile) -------------------------------------------------
//   GET  /api/anuncios/mobile   → coches activos con anuncio de mobile.de (id, idMobile, precio) y si ya se revisó hoy
//   POST /api/anuncios/marcar   → { resultados: [{ id, estado: "activo"|"retirado", precio?, motivo?, http_status? }] }
//                                 misma lógica que marcar_anuncio (retirado 2 veces → "retirado"; cambio de precio → recalcula)
//   POST /api/anuncios/fin      → resumen de la pasada (tabla revisiones, origen "local")
//   Autenticación: "Authorization: Bearer LOCAL_REVIEW_TOKEN" (secreto del Worker; el mismo en tools/revision-mobile/.env)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } })

async function localReviewApi(request: Request, env: Env, path: string): Promise<Response> {
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    if (!env.LOCAL_REVIEW_TOKEN || env.LOCAL_REVIEW_TOKEN.length < 32) return text("Falta el secreto LOCAL_REVIEW_TOKEN en el Worker", 500)
    if (!token || !safeEqual(token, env.LOCAL_REVIEW_TOKEN)) return text("No autorizado", 401)
    const client = db(env)
    const now = new Date()
    try {
        if (path === "/api/anuncios/mobile" && request.method === "GET") {
            const [cars, done] = await Promise.all([
                reviewableCars(client),
                client.from(SUMMARY_TABLE).select("id").eq("fecha", madridDate(now)).eq("origen", "local").eq("completa", true).limit(1),
            ])
            const mobile = cars.filter(c => listingPortal(c.url) === "mobile.de").sort(compareReviewPriority)
            return json({
                fecha: madridDate(now),
                ya_revisado_hoy: !done.error && (done.data?.length ?? 0) > 0,
                coches: mobile.map(c => ({
                    id: c.id, idMobile: mobileAdId(c.url), url: c.url, precio: c.precio_alemania ?? null,
                    nombre: [c.marca, c.modelo, c.anio ? `(${c.anio})` : null].filter(Boolean).join(" "),
                    revisado_hoy: reviewedToday(c.anuncio_ultima_comprobacion, now),
                })),
            })
        }
        if (path === "/api/anuncios/marcar" && request.method === "POST") {
            const body = (await request.json().catch(() => ({}))) as { resultados?: { id: string; estado: string; precio?: number | null; motivo?: string; http_status?: number | null }[] }
            const items = (body.resultados ?? []).filter(r => r && typeof r.id === "string" && (r.estado === "activo" || r.estado === "retirado"))
            if (!items.length || items.length > 50) return text("Pasa entre 1 y 50 resultados (estado activo o retirado)", 400)
            const [{ data, error }, settings] = await Promise.all([client.from(CARS_TABLE).select("*").in("id", items.map(r => r.id)), costSettings(client)])
            if (error) return text(error.message, 500)
            const byId = new Map((data ?? []).map(c => [c.id as string, c as CarRow]))
            const reviews = items.filter(r => byId.has(r.id)).map(r => planReview(byId.get(r.id)!, {
                resultado: r.estado as "activo" | "retirado",
                precio: r.estado === "activo" && r.precio && r.precio > 0 ? Math.round(r.precio) : null,
                http_status: r.http_status ?? null,
                motivo: `PC de casa (mobile.de)${r.motivo ? `: ${r.motivo}` : ""}`,
            }, settings, now, "local"))
            await saveReviews(client, reviews)
            return json({ guardados: reviews.length, desconocidos: items.filter(r => !byId.has(r.id)).map(r => r.id), cambios: reviews.map(r => ({ id: r.id, nombre: r.nombre, cambios: r.cambios })) })
        }
        if (path === "/api/anuncios/fin" && request.method === "POST") {
            const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
            const n = (k: string) => (typeof b[k] === "number" && Number.isFinite(b[k]) ? Math.max(0, Math.round(b[k] as number)) : 0)
            const inicio = typeof b.inicio === "string" && !Number.isNaN(Date.parse(b.inicio)) ? new Date(b.inicio) : now
            const row = {
                origen: "local" as const, inicio, completa: b.completa === true,
                revisados: n("revisados"), activos: n("activos"), retirados: n("retirados"), cambios_precio: n("cambios_precio"), errores: n("errores"),
                detalle: (b.detalle && typeof b.detalle === "object" ? b.detalle : {}) as Record<string, unknown>,
            }
            await saveSummary(client, row, now)
            await logCall(client, {
                herramienta: "revision_mobile", ok: row.completa,
                resumen: `PC de casa: ${row.revisados} revisados · ${row.activos} activos · ${row.retirados} retirados · ${row.cambios_precio} cambios de precio · ${row.errores} errores${row.completa ? "" : " · INCOMPLETA"}`,
                error: row.completa ? undefined : String(row.detalle.motivo ?? "revisión incompleta"),
            })
            return json({ ok: true })
        }
        return text("No encontrado", 404)
    } catch (e) {
        return text(e instanceof Error ? e.message : String(e), 500)
    }
}
