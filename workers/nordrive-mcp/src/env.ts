import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider"

export interface Env {
    /** URL pública del Worker, sin barra final (p. ej. https://nordrive-mcp.tu-cuenta.workers.dev) */
    PUBLIC_URL: string
    SUPABASE_URL: string
    /** Secreto: clave service_role de Supabase */
    SUPABASE_SERVICE_ROLE_KEY: string
    /** Secreto: contraseña para autorizar a claude.ai y Bearer para el MCP Inspector */
    MCP_SECRET: string
    /** Secreto: token del script del PC de casa que revisa mobile.de (tools/revision-mobile/.env) */
    LOCAL_REVIEW_TOKEN?: string
    /** Clave pública VAPID de las notificaciones push (base64url). Variable en wrangler.toml */
    VAPID_PUBLIC_KEY?: string
    /** Secreto: clave privada VAPID (base64url, "d"). Se genera con node scripts/generar-vapid.mjs */
    VAPID_PRIVATE_KEY?: string
    /** KV donde el proveedor OAuth guarda clientes, permisos y tokens (solo hashes) */
    OAUTH_KV: KVNamespace
    /** Lo inyecta OAuthProvider en el defaultHandler */
    OAUTH_PROVIDER: OAuthHelpers
}
