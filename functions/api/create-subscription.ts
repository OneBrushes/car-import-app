// Cloudflare Pages Function para crear suscripción
// Este archivo debe estar en: functions/api/create-subscription.ts

import Stripe from 'stripe'

interface Env {
    STRIPE_SECRET_KEY: string
}

export async function onRequestPost(context: { request: Request; env: Env }) {
    try {
        const { request, env } = context

        // Validar que existe la API key
        if (!env.STRIPE_SECRET_KEY) {
            return new Response(
                JSON.stringify({ error: 'Stripe API key not configured' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Inicializar Stripe
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            apiVersion: '2025-11-17.clover',
        })

        // Parsear el body
        const body = await request.json()
        const { amount, email, name } = body as { amount: number; email: string; name?: string }

        if (!amount || amount < 1 || !email) {
            return new Response(
                JSON.stringify({ error: 'Amount and email are required' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // 1. Crear o buscar cliente
        const customers = await stripe.customers.list({ email: email, limit: 1 })
        let customer
        if (customers.data.length > 0) {
            customer = customers.data[0]
        } else {
            customer = await stripe.customers.create({
                email,
                name: name || 'Donator',
            })
        }

        // 2. Crear un Precio para este monto específico (Recurring)
        const price = await stripe.prices.create({
            unit_amount: Math.round(amount * 100),
            currency: 'eur',
            recurring: {
                interval: 'month',
            },
            product_data: {
                name: 'Donación Mensual - Car Import App',
            },
        })

        // 3. Crear Subscription incompleta
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: price.id }],
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent'],
        })

        // 4. Obtener el PaymentIntent de la primera factura
        let clientSecret: string | null = null

        // Intentar obtener de la expansión primero
        const latestInvoice: any = subscription.latest_invoice
        if (latestInvoice && typeof latestInvoice === 'object') {
            const paymentIntent: any = latestInvoice.payment_intent
            if (paymentIntent && typeof paymentIntent === 'object' && paymentIntent.client_secret) {
                clientSecret = paymentIntent.client_secret
            } else if (typeof latestInvoice.payment_intent === 'string') {
                // Si payment_intent es solo un ID, obtenerlo manualmente
                const pi = await stripe.paymentIntents.retrieve(latestInvoice.payment_intent)
                clientSecret = pi.client_secret
            }
        }

        if (!clientSecret) {
            console.error('Subscription structure:', JSON.stringify({
                subscription_id: subscription.id,
                latest_invoice_type: typeof subscription.latest_invoice,
                latest_invoice: subscription.latest_invoice
            }, null, 2))
            throw new Error('No se pudo obtener el client_secret de la suscripción')
        }

        return new Response(
            JSON.stringify({
                subscriptionId: subscription.id,
                clientSecret: clientSecret,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (error: any) {
        console.error('Error creating subscription:', error)
        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
