
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

        // Inicializar Stripe dentro del handler con versión de API
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2025-11-17.clover',
        })

        const body = await req.json()
        const { amount, email, name } = body

        if (!amount || amount < 1 || !email) {
            return NextResponse.json(
                { error: 'Amount and email are required' },
                { status: 400 }
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

        // 4. Devolver el clientSecret del PaymentIntent asociado a la primera factura
        // @ts-ignore
        const clientSecret = subscription.latest_invoice.payment_intent.client_secret

        return NextResponse.json({
            subscriptionId: subscription.id,
            clientSecret: clientSecret,
        })
    } catch (error: any) {
        console.error('Error creating subscription:', error)
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        )
    }
}
