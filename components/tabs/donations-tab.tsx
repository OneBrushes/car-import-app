'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Heart, CreditCard, Loader2, CheckCircle, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const AMOUNTS = [1, 2, 5, 10, 20, 50]

export function DonationsTab() {
    const [selectedAmount, setSelectedAmount] = useState<number | 'custom'>(5)
    const [customAmount, setCustomAmount] = useState<string>('')
    const [isMonthly, setIsMonthly] = useState(false)
    const [clientSecret, setClientSecret] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)
    // For subscriptions
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')

    const getFinalAmount = () => {
        if (selectedAmount === 'custom') {
            const val = parseFloat(customAmount.replace(',', '.'))
            return isNaN(val) ? 0 : val
        }
        return selectedAmount
    }

    const handleInitiatePayment = async () => {
        const amount = getFinalAmount()
        if (amount < 1) {
            toast.error('La cantidad mínima es 1€')
            return
        }
        if (isMonthly && !email) {
            toast.error('El email es necesario para la suscripción')
            return
        }

        setLoading(true)
        try {
            const endpoint = isMonthly ? '/api/create-subscription' : '/api/create-payment-intent'
            const body = isMonthly ? { amount, email, name } : { amount }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await res.json()

            if (data.error) throw new Error(data.error)

            setClientSecret(data.clientSecret)
        } catch (error: any) {
            toast.error(error.message || 'Error al iniciar pago')
        } finally {
            setLoading(false)
        }
    }

    if (paymentSuccess) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-4">¡Gracias por tu apoyo!</h2>
                <p className="text-lg text-slate-600 max-w-md">
                    Tu contribución ayuda a mantener y mejorar esta aplicación. Eres increíble.
                </p>
                <Button
                    variant="outline"
                    className="mt-8"
                    onClick={() => {
                        setPaymentSuccess(false)
                        setClientSecret('')
                        setSelectedAmount(5)
                    }}
                >
                    Hacer otra donación
                </Button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center justify-center gap-3">
                    <Heart className="w-8 h-8 text-red-500 fill-red-500 animate-pulse" />
                    Apoya el Proyecto
                </h2>
                <p className="text-slate-500 mt-2 max-w-xl mx-auto">
                    Si esta herramienta te es útil, considera hacer una pequeña donación para ayudar con los costes del servidor y el desarrollo continuo.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-start">
                <Card className="border-2 border-slate-100 shadow-xl">
                    <CardHeader>
                        <CardTitle>Selecciona cantidad</CardTitle>
                        <CardDescription>Elige cuánto quieres aportar hoy</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <Label htmlFor="monthly-mode" className="flex flex-col cursor-pointer">
                                <span className="font-medium text-slate-900">Suscripción Mensual</span>
                                <span className="text-xs text-slate-500">Apoyo recurrente</span>
                            </Label>
                            <Switch
                                id="monthly-mode"
                                checked={isMonthly}
                                onCheckedChange={(checked) => {
                                    setIsMonthly(checked)
                                    setClientSecret('') // Reset on mode change
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {AMOUNTS.map((amount) => (
                                <button
                                    key={amount}
                                    onClick={() => {
                                        setSelectedAmount(amount)
                                        setClientSecret('')
                                    }}
                                    className={`
                                        py-3 px-2 rounded-xl border-2 font-bold text-sm transition-all duration-200
                                        ${selectedAmount === amount
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm scale-105'
                                            : 'border-slate-100 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50'}
                                    `}
                                >
                                    {amount}€
                                </button>
                            ))}
                            <button
                                onClick={() => {
                                    setSelectedAmount('custom')
                                    setClientSecret('')
                                }}
                                className={`
                                    py-3 px-2 rounded-xl border-2 font-bold text-sm transition-all duration-200
                                    ${selectedAmount === 'custom'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm scale-105'
                                        : 'border-slate-100 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50'}
                                `}
                            >
                                Otro
                            </button>
                        </div>

                        <AnimatePresence>
                            {selectedAmount === 'custom' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-2"
                                >
                                    <Label>Cantidad personalizada (€)</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        placeholder="Ej: 12.50"
                                        value={customAmount}
                                        onChange={(e) => {
                                            setCustomAmount(e.target.value)
                                            setClientSecret('')
                                        }}
                                        className="mt-1 text-lg"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {isMonthly && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="space-y-3 pt-2"
                            >
                                <div>
                                    <Label>Nombre</Label>
                                    <Input
                                        placeholder="Tu nombre"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Email (para recibos)</Label>
                                    <Input
                                        type="email"
                                        placeholder="tu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </motion.div>
                        )}

                        {!clientSecret && (
                            <Button
                                className="w-full h-12 text-lg mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20"
                                onClick={handleInitiatePayment}
                                disabled={loading || getFinalAmount() < 1 || (isMonthly && !email)}
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                                {loading ? 'Procesando...' : `Donar ${getFinalAmount() > 0 ? getFinalAmount() + '€' : ''} ${isMonthly ? '/ mes' : ''}`}
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Payment Form Column */}
                <div className="relative">
                    <AnimatePresence mode="wait">
                        {clientSecret ? (
                            <motion.div
                                key="payment-form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                            >
                                <Card className="border-2 border-blue-100 shadow-2xl bg-white overflow-hidden">
                                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                                        <div className="font-semibold text-slate-700">Completar pago</div>
                                        <div className="text-xs font-mono bg-white px-2 py-1 rounded border">Seguro con Stripe</div>
                                    </div>
                                    <CardContent className="p-6">
                                        <Elements stripe={stripePromise} options={{
                                            clientSecret,
                                            appearance: { theme: 'stripe' },
                                            locale: 'es'
                                        }}>
                                            <header className="mb-6 text-center">
                                                <div className="text-3xl font-bold text-slate-900">{getFinalAmount()}€</div>
                                                <div className="text-sm text-slate-500">{isMonthly ? 'cada mes' : 'pago único'}</div>
                                            </header>
                                            <CheckoutForm onSuccess={() => setPaymentSuccess(true)} />
                                        </Elements>
                                        <Button
                                            variant="ghost"
                                            className="w-full mt-4 text-slate-400 hover:text-slate-600"
                                            onClick={() => setClientSecret('')}
                                        >
                                            Cancelar / Cambiar cantidad
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-8 text-center"
                            >
                                <CreditCard className="w-16 h-16 mb-4 opacity-20" />
                                <p className="text-lg font-medium">Selecciona una cantidad para continuar</p>
                                <p className="text-sm mt-2">El formulario de pago seguro aparecerá aquí</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
    const stripe = useStripe()
    const elements = useElements()
    const [message, setMessage] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!stripe || !elements) return

        setIsProcessing(true)

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Return URL is required usually, but with redirect: 'if_required' we can avoid full redirect sometimes
                return_url: window.location.origin,
            },
            redirect: 'if_required'
        })

        if (error) {
            setMessage(error.message || 'Error desconocido')
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            setMessage('¡Pago realizado con éxito!')
            onSuccess()
        } else {
            // For some payment methods (like iDEAL) it might redirect.
            // If we are here without error and without success immediate, it might be processing
            onSuccess() // Optimistic success or check status
        }

        setIsProcessing(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement />

            {message && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                    {message}
                </div>
            )}

            <Button
                disabled={isProcessing || !stripe || !elements}
                className="w-full h-12 text-lg font-semibold bg-slate-900 hover:bg-slate-800 text-white"
            >
                {isProcessing ? <Loader2 className="animate-spin" /> : 'Pagar ahora'}
            </Button>
        </form>
    )
}
