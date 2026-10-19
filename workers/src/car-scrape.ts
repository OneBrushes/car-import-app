// Worker de Cloudflare "car-scrape": la importación por URL para la web alojada en GitHub Pages
// (allí no existen las funciones /api). Misma lógica que functions/api/scrape.ts, más CORS.
//
// Se compila a workers/car-scrape.js con `npm run build:scrape-worker`; ese archivo es el que
// se pega en el editor del Worker en https://dash.cloudflare.com/ (Workers & Pages).
// Variables del Worker: SUPABASE_URL, SUPABASE_ANON_KEY y, opcional, ALLOWED_ORIGINS (separados por comas).
import { handleScrape } from '../../functions/api/scrape'

interface Env {
    SUPABASE_URL?: string
    SUPABASE_ANON_KEY?: string
    ALLOWED_ORIGINS?: string
}

const DEFAULT_ORIGINS = ['https://app.nordrivecars.com', 'http://localhost:3000']

function cors(request: Request, env: Env): Record<string, string> {
    const origin = request.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : DEFAULT_ORIGINS).map((o) => o.trim())
    return {
        'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const headers = cors(request, env)
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
        if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } })
        const res = await handleScrape(request, env)
        const out = new Response(res.body, res)
        for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
        return out
    },
}
