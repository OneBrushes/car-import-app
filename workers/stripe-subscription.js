// Worker de Cloudflare para crear suscripción
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
            const body = await request.json()
            const { amount, email, name } = body

            if (!amount || amount < 1 || !email) {
                return new Response(
                    JSON.stringify({ error: 'Amount and email are required' }),
                    { status: 400, headers: corsHeaders }
                )
            }

            // 1. Buscar o crear cliente
            const customersResponse = await fetch(
                `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                    },
                }
            )
            const customersData = await customersResponse.json()

            let customerId
            if (customersData.data && customersData.data.length > 0) {
                customerId = customersData.data[0].id
            } else {
                // Crear nuevo cliente
                const createCustomerResponse = await fetch('https://api.stripe.com/v1/customers', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        email: email,
                        name: name || 'Donator',
                    }),
                })
                const newCustomer = await createCustomerResponse.json()
                customerId = newCustomer.id
            }

            // 2. Crear precio
            const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    unit_amount: Math.round(amount * 100).toString(),
                    currency: 'eur',
                    'recurring[interval]': 'month',
                    'product_data[name]': 'Donación Mensual - Car Import App',
                }),
            })
            const price = await priceResponse.json()

            // 3. Crear suscripción con payment intent
            const subscriptionResponse = await fetch('https://api.stripe.com/v1/subscriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    customer: customerId,
                    'items[0][price]': price.id,
                    payment_behavior: 'default_incomplete',
                    'payment_settings[save_default_payment_method]': 'on_subscription',
                    'payment_settings[payment_method_types][]': 'card',
                    'expand[]': 'latest_invoice.payment_intent',
                }),
            })
            const subscription = await subscriptionResponse.json()

            // 4. Obtener client_secret
            let clientSecret = null

            // Intentar obtener de la expansión
            if (subscription.latest_invoice && typeof subscription.latest_invoice === 'object') {
                const invoice = subscription.latest_invoice
                if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
                    clientSecret = invoice.payment_intent.client_secret
                } else if (typeof invoice.payment_intent === 'string') {
                    // Si payment_intent es solo un ID, obtenerlo manualmente
                    const piResponse = await fetch(
                        `https://api.stripe.com/v1/payment_intents/${invoice.payment_intent}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                            },
                        }
                    )
                    const paymentIntent = await piResponse.json()
                    clientSecret = paymentIntent.client_secret
                }
            }

            if (!clientSecret) {
                console.error('Subscription structure:', JSON.stringify(subscription))
                return new Response(
                    JSON.stringify({ error: 'No se pudo obtener el client_secret' }),
                    { status: 500, headers: corsHeaders }
                )
            }

            return new Response(
                JSON.stringify({
                    subscriptionId: subscription.id,
                    clientSecret: clientSecret,
                }),
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
