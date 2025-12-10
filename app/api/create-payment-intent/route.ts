
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(req: Request) {
    try {
        // Validar que existe la API key
        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json(
                { error: 'Stripe API key not configured' },
                { status: 500 }
            )
        }

        // Inicializar Stripe dentro del handler
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

        const body = await req.json()
        const { amount } = body

        if (!amount || amount < 1) { // Mínimo 1 euro/dólar
            return NextResponse.json(
                { error: 'Amount is required and must be at least 1' },
                { status: 400 }
            )
        }

        // Stripe espera el monto en céntimos (ej: 10.00€ = 1000)
        const amountInCents = Math.round(amount * 100)

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

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
        })
    } catch (error: any) {
        console.error('Error creating payment intent:', error)
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        )
    }
}
