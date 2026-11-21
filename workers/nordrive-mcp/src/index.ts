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
import { handleMcp } from "./mcp"
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
} satisfies ExportedHandler<Env>

// --- Pantalla de autorización ---------------------------------------------------------------------------------------

async function defaultHandler(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/" && request.method === "GET") return text("NorDrive MCP · el servidor está en /mcp")
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
