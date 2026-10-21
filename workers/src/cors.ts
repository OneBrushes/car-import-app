// CORS común de los Workers de NorDrive (la web está en GitHub Pages, en otro dominio)
export interface CorsEnv {
    ALLOWED_ORIGINS?: string
}

const DEFAULT_ORIGINS = ['https://app.nordrivecars.com', 'http://localhost:3000']

export function cors(request: Request, env: CorsEnv, methods: string): Record<string, string> {
    const origin = request.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : DEFAULT_ORIGINS).map((o) => o.trim())
    return {
        'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
        'Access-Control-Allow-Methods': `${methods}, OPTIONS`,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    }
}

/** Comprueba la sesión de Supabase del usuario (el token que manda la app) */
export async function isSignedIn(request: Request, env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string }) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: request.headers.get('Authorization') || '' },
    })
    return res.ok
}
