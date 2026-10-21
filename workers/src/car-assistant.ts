// Worker de Cloudflare "car-assistant": redacta con Claude la siguiente respuesta al vendedor de un coche,
// a partir de la conversación que el usuario ha pegado en la app.
//
// POST /   Header: Authorization: Bearer <access_token de Supabase>
// Body: { car, language, messages: [{ from: "me" | "seller", text }], instruction?, offer?, name? }
// Respuesta: { reply, translation_es, seller_summary_es, advice_es }
//
// Se compila a workers/car-assistant.js con `npm run build:workers` y se pega en el editor del Worker.
// Variables del Worker: SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY (como secreto) y, opcional, ALLOWED_ORIGINS.
import Anthropic from '@anthropic-ai/sdk'
import { cors, isSignedIn, type CorsEnv } from './cors'

interface Env extends CorsEnv {
    SUPABASE_URL?: string
    SUPABASE_ANON_KEY?: string
    ANTHROPIC_API_KEY?: string
}

interface AssistantRequest {
    car?: Record<string, unknown>
    language?: string
    messages?: { from: 'me' | 'seller'; text: string }[]
    instruction?: string
    offer?: number | null
    name?: string
}

const LANGUAGES: Record<string, string> = {
    de: 'German', en: 'English', fr: 'French', nl: 'Dutch', it: 'Italian', es: 'Spanish',
}

const MAX_CHARS = 30_000

const SYSTEM = `You help a private buyer from Spain who imports used cars from other European countries. They are talking to the seller (often a dealer) of one specific car, and you draft their next message.

How the message should read:
- Written in the seller's language, the way a real person writes in a private message: short, polite, natural, and specific to what the seller just said. No bullet lists unless the seller asked several questions.
- Reply first to whatever the seller asked or said. If the reply needs a fact you don't have (for example a date the buyer can come by), put a short placeholder in square brackets in the buyer's own language, Spanish, e.g. [día de recogida].
- Dealers often ignore buyers who look like export scammers. Avoid phrases such as "for export, so no risk or warranty for you" and avoid pressure. Don't promise payment methods or dates the buyer hasn't given.
- When the buyer wants to negotiate, give one plausible, friendly reason (they collect the car themselves, pay quickly, something the seller mentioned) and name the price they gave. Never invent defects to push the price down.
- Sign with the buyer's name when you have it.

Also return, in Spanish: a faithful translation of your reply, a one-or-two-sentence summary of what the seller's latest message says, and one short piece of advice on the next step.`

const SCHEMA = {
    type: 'object',
    properties: {
        reply: { type: 'string', description: "The message to send, in the seller's language" },
        translation_es: { type: 'string', description: 'Spanish translation of the reply' },
        seller_summary_es: { type: 'string', description: "Spanish summary of the seller's latest message (empty if there is none)" },
        advice_es: { type: 'string', description: 'One short piece of advice in Spanish on the next step' },
    },
    required: ['reply', 'translation_es', 'seller_summary_es', 'advice_es'],
    additionalProperties: false,
}

function json(body: unknown, status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

function describeCar(car: Record<string, unknown>) {
    const keys = ['brand', 'model', 'year', 'month', 'mileage', 'price', 'location', 'url']
    return keys.filter((k) => car[k] != null && car[k] !== '').map((k) => `${k}: ${String(car[k]).slice(0, 300)}`).join('\n')
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const headers = cors(request, env, 'POST')
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
        if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405, headers)
        if (!env.ANTHROPIC_API_KEY) return json({ error: 'Falta ANTHROPIC_API_KEY en el Worker' }, 500, headers)
        if (!(await isSignedIn(request, env))) return json({ error: 'Sesión no válida' }, 401, headers)

        let body: AssistantRequest
        try {
            body = await request.json()
        } catch {
            return json({ error: 'Petición no válida' }, 400, headers)
        }
        const messages = (body.messages || []).filter((m) => m && typeof m.text === 'string' && m.text.trim())
        const transcript = messages.map((m) => `${m.from === 'seller' ? 'SELLER' : 'BUYER'}:\n${m.text.trim()}`).join('\n\n---\n\n')
        if (transcript.length > MAX_CHARS) return json({ error: 'La conversación es demasiado larga' }, 400, headers)

        const language = LANGUAGES[body.language || ''] || 'German'
        const parts = [
            `The seller writes in ${language}. Write the reply in ${language}.`,
            `The car:\n${describeCar(body.car || {}) || '(no details)'}`,
            body.name ? `Buyer's name for the signature: ${body.name.slice(0, 80)}` : 'No buyer name given.',
            body.offer ? `The buyer wants to offer ${body.offer} €.` : '',
            body.instruction ? `What the buyer wants this message to do (in their words, Spanish):\n${body.instruction.slice(0, 2000)}` : '',
            transcript ? `Conversation so far, oldest first:\n\n${transcript}` : 'There is no conversation yet: write the first message to the seller.',
        ].filter(Boolean)

        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
        try {
            const response = await client.beta.messages.create({
                model: 'claude-opus-5-5',
                max_tokens: 16000,
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
                output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
                system: SYSTEM,
                messages: [{ role: 'user', content: parts.join('\n\n') }],
            })
            if (response.stop_reason === 'refusal') return json({ error: 'La IA no ha podido redactar esta respuesta. Escríbela a mano o cambia la instrucción.' }, 422, headers)
            if (response.stop_reason === 'max_tokens') return json({ error: 'La respuesta de la IA se ha cortado. Inténtalo otra vez.' }, 502, headers)
            const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
            return json(JSON.parse(text), 200, headers)
        } catch (error) {
            if (error instanceof Anthropic.RateLimitError) return json({ error: 'Demasiadas peticiones a la IA. Espera un momento.' }, 429, headers)
            if (error instanceof Anthropic.AuthenticationError) return json({ error: 'La clave de la IA (ANTHROPIC_API_KEY) no es válida' }, 500, headers)
            if (error instanceof Anthropic.APIError) return json({ error: `Error de la IA (${error.status})` }, 502, headers)
            if (error instanceof SyntaxError) return json({ error: 'La IA ha devuelto un formato inesperado. Inténtalo otra vez.' }, 502, headers)
            return json({ error: 'No se pudo contactar con la IA' }, 502, headers)
        }
    },
}
