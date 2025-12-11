// Cloudflare Pages Function para crear payment intent
// Este archivo debe estar en: functions/api/create-payment-intent.ts

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
        const { amount } = body as { amount: number }

        if (!amount || amount < 1) {
            return new Response(
                JSON.stringify({ error: 'Amount is required and must be at least 1' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Stripe espera el monto en céntimos
        const amountInCents = Math.round(amount * 100)

        // Crear Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'eur',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                integration_check: 'accept_a_payment',
            },
        })

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (error: any) {
        console.error('Error creating payment intent:', error)
        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
