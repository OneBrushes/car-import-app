// Worker de Cloudflare para crear payment intent
// Desplegar en: https://dash.cloudflare.com/workers

export default {
    async fetch(request, env) {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json',
        }

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders })
        }

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: corsHeaders,
            })
        }

        try {
            // Obtener el body
            const body = await request.json()
            const { amount } = body

            if (!amount || amount < 1) {
                return new Response(
                    JSON.stringify({ error: 'Amount is required and must be at least 1' }),
                    { status: 400, headers: corsHeaders }
                )
            }

            // Crear Payment Intent usando Stripe API directamente
            const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    amount: Math.round(amount * 100).toString(),
                    currency: 'eur',
                    'automatic_payment_methods[enabled]': 'true',
                }),
            })

            const paymentIntent = await stripeResponse.json()

            if (!stripeResponse.ok) {
                console.error('Stripe error:', paymentIntent)
                return new Response(
                    JSON.stringify({ error: paymentIntent.error?.message || 'Stripe error' }),
                    { status: 500, headers: corsHeaders }
                )
            }

            return new Response(
                JSON.stringify({ clientSecret: paymentIntent.client_secret }),
                { status: 200, headers: corsHeaders }
            )
        } catch (error) {
            console.error('Error:', error)
            return new Response(
                JSON.stringify({ error: error.message || 'Internal server error' }),
                { status: 500, headers: corsHeaders }
            )
        }
    },
}
