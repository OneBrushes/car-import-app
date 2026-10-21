// Lee un anuncio de coche y devuelve sus datos básicos.
// GET /api/scrape?url=<anuncio>   Header: Authorization: Bearer <access_token de Supabase>
//
// Solo acepta portales de coches conocidos (evita que se use como proxy abierto) y
// exige una sesión válida de Supabase.
//
// Se usa de dos formas:
//  - como Cloudflare Pages Function (si la web se aloja en Cloudflare Pages), y
//  - como Worker independiente (workers/car-scrape.js, generado con `npm run build:workers`),
//    que es lo que usa la web alojada en GitHub Pages.
// Variables de entorno: SUPABASE_URL, SUPABASE_ANON_KEY

import { parseListing } from '../../lib/listing-parser'
export type { ScrapedCar } from '../../lib/listing-parser'

interface Env {
    SUPABASE_URL?: string
    SUPABASE_ANON_KEY?: string
}


const ALLOWED_HOSTS = [
    'autoscout24.', 'mobile.de', 'kleinanzeigen.de', 'leboncoin.fr', 'lacentrale.fr',
    'marktplaats.nl', '2dehands.be', 'gaspedaal.nl', 'autotrader.co.uk', 'subito.it',
    'autohero.com', 'carvago.com', 'coches.net', 'wallapop.com', 'milanuncios.com',
    'willhaben.at', 'otomoto.pl', 'bytbil.com', 'blocket.se', 'finn.no',
]

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })

export async function onRequestGet(context: { request: Request; env: Env }) {
    return handleScrape(context.request, context.env)
}

export async function handleScrape(request: Request, env: Env): Promise<Response> {
    const target = new URL(request.url).searchParams.get('url')

    if (!target) return json({ error: 'Falta el parámetro url' }, 400)

    let listing: URL
    try {
        listing = new URL(target)
    } catch {
        return json({ error: 'URL no válida' }, 400)
    }
    if (listing.protocol !== 'https:' && listing.protocol !== 'http:') {
        return json({ error: 'Solo se admiten enlaces http(s)' }, 400)
    }
    const host = listing.hostname.toLowerCase()
    const platform = ALLOWED_HOSTS.find(h => host === h || host.endsWith('.' + h) || host.includes(h))
    if (!platform) {
        return json({ error: 'Portal no soportado todavía', supported: ALLOWED_HOSTS }, 400)
    }

    // Exigir sesión válida
    const authHeader = request.headers.get('Authorization') || ''
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return json({ error: 'Faltan SUPABASE_URL / SUPABASE_ANON_KEY en Cloudflare' }, 500)
    }
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader },
    })
    if (!userRes.ok) return json({ error: 'Sesión no válida' }, 401)

    let html: string
    try {
        const res = await fetch(listing.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8,de;q=0.7,fr;q=0.6',
                Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        })
        if (!res.ok) return json({ error: `El portal respondió ${res.status}. Puede estar bloqueando lecturas automáticas.` }, 502)
        html = (await res.text()).slice(0, 3_000_000)
    } catch {
        return json({ error: 'No se pudo descargar el anuncio' }, 502)
    }

    const car = parseListing(html, listing.toString())
    car.platform = platform.replace(/\.$/, '')
    return json(car)
}
