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
