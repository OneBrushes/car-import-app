'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Heart, CreditCard, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import confetti from 'canvas-confetti'

// Initialize Stripe
// Fallback a clave hardcoded si las env vars no están disponibles (Cloudflare Pages issue)
const STRIPE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null

const AMOUNTS = [1, 2, 5, 10, 20, 50]

export function DonationsTab() {
    const [selectedAmount, setSelectedAmount] = useState<number | 'custom'>(5)
    const [customAmount, setCustomAmount] = useState<string>('')
    const [isMonthly, setIsMonthly] = useState(false)
    const [clientSecret, setClientSecret] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false)

    // Load subscriptions setting
    useEffect(() => {
        const loadSettings = async () => {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'subscriptions_enabled')
                .single()

            if (data) {
                setSubscriptionsEnabled(data.value)
                // Si las suscripciones están desactivadas, forzar modo pago único
                if (!data.value && isMonthly) {
                    setIsMonthly(false)
                }
            }
        }
        loadSettings()
    }, [])

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
            const endpoint = isMonthly
                ? 'https://stripe-subscription.onebrushes.workers.dev/'
                : 'https://stripe-payment-intent.onebrushes.workers.dev/'

            console.log('🚀 Using Cloudflare Worker:', endpoint)
            const body = isMonthly ? { amount, email, name } : { amount }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            // Verificar si la respuesta es OK
            if (!res.ok) {
                const errorText = await res.text()
                console.error('API Error:', res.status, errorText)
                throw new Error(`Error del servidor (${res.status}): ${errorText || 'Sin respuesta'}`)
            }

            // Verificar que hay contenido antes de parsear JSON
            const text = await res.text()
            if (!text) {
                throw new Error('La API no devolvió ninguna respuesta')
            }

            const data = JSON.parse(text)

            if (data.error) throw new Error(data.error)

            setClientSecret(data.clientSecret)
        } catch (error: any) {
            console.error('Payment error:', error)
            toast.error(error.message || 'Error al iniciar pago')
        } finally {
            setLoading(false)
        }
    }

    // Efecto de confeti cuando se completa el pago
    useEffect(() => {
        if (paymentSuccess) {
            console.log('🎉 Disparando confeti!')
            // Explosión inicial de confeti
            const count = 200
            const defaults = {
                origin: { y: 0.7 },
                zIndex: 9999
            }

            function fire(particleRatio: number, opts: any) {
                confetti({
                    ...defaults,
                    ...opts,
                    particleCount: Math.floor(count * particleRatio)
                })
            }

            // Explosión múltiple con diferentes configuraciones
            fire(0.25, {
                spread: 26,
                startVelocity: 55,
            })
            fire(0.2, {
                spread: 60,
            })
            fire(0.35, {
                spread: 100,
                decay: 0.91,
                scalar: 0.8
            })
            fire(0.1, {
                spread: 120,
                startVelocity: 25,
                decay: 0.92,
                scalar: 1.2
            })
            fire(0.1, {
                spread: 120,
                startVelocity: 45,
            })

            // Confeti continuo desde los lados
            const duration = 3000
            const animationEnd = Date.now() + duration

            function randomInRange(min: number, max: number) {
                return Math.random() * (max - min) + min
            }

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now()

                if (timeLeft <= 0) {
                    return clearInterval(interval)
                }

                const particleCount = 30 * (timeLeft / duration)

                // Desde la izquierda
                confetti({
                    particleCount,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0, y: 0.6 },
                    zIndex: 9999
                })
                // Desde la derecha
                confetti({
                    particleCount,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1, y: 0.6 },
                    zIndex: 9999
                })
            }, 250)

            return () => clearInterval(interval)
        }
    }, [paymentSuccess])

    if (paymentSuccess) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                className="mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border bg-card p-10 text-center shadow-xs"
            >
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success/10"
                >
                    <CheckCircle className="h-7 w-7 text-success" />
                </motion.div>

                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-2 text-2xl font-semibold tracking-tight"
                >
                    ¡Pago completado!
                </motion.h2>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mb-1 text-muted-foreground"
                >
                    Tu contribución ayuda a mantener y mejorar esta aplicación.
                </motion.p>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mb-6 font-medium text-success"
                >
                    ¡Muchas gracias!
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                >
                    <Button
                        variant="outline"
                        onClick={() => {
                            setPaymentSuccess(false)
                            setClientSecret('')
                            setSelectedAmount(5)
                        }}
                    >
                        <Heart className="h-4 w-4" />
                        Hacer otra donación
                    </Button>
                </motion.div>
            </motion.div>
        )
    }

    return (
        <div className="mx-auto max-w-4xl space-y-6 animate-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">Apoya el proyecto</h2>
                <p className="text-muted-foreground max-w-xl">
                    Si esta herramienta te es útil, considera hacer una pequeña donación para ayudar con los costes del servidor y el desarrollo continuo.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 items-start">
                <section className="rounded-xl border bg-card p-5 shadow-xs space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <Heart className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Selecciona cantidad</h3>
                            <p className="text-xs text-muted-foreground">Elige cuánto quieres aportar hoy</p>
                        </div>
                    </div>
                        {subscriptionsEnabled && (
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <Label htmlFor="monthly-mode" className="flex flex-col items-start gap-0.5 cursor-pointer">
                                    <span className="text-sm font-medium">Suscripción mensual</span>
                                    <span className="text-xs font-normal text-muted-foreground">Apoyo recurrente</span>
                                </Label>
                                <Switch
                                    id="monthly-mode"
                                    checked={isMonthly}
                                    onCheckedChange={(checked) => {
                                        setIsMonthly(checked)
                                        setClientSecret('')
                                    }}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                            {AMOUNTS.map((amount) => (
                                <button
                                    key={amount}
                                    type="button"
                                    aria-pressed={selectedAmount === amount}
                                    onClick={() => {
                                        setSelectedAmount(amount)
                                        setClientSecret('')
                                    }}
                                    className={`tabular h-10 rounded-lg border text-sm font-medium transition-colors ${selectedAmount === amount
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'bg-card hover:bg-accent'
                                        }`}
                                >
                                    {amount} €
                                </button>
                            ))}
                            <button
                                type="button"
                                aria-pressed={selectedAmount === 'custom'}
                                onClick={() => {
                                    setSelectedAmount('custom')
                                    setClientSecret('')
                                }}
                                className={`h-10 rounded-lg border text-sm font-medium transition-colors ${selectedAmount === 'custom'
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'bg-card hover:bg-accent'
                                    }`}
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
                                    className="space-y-1.5"
                                >
                                    <Label className="text-[13px]">Cantidad personalizada (€)</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        placeholder="Ej: 12,50"
                                        value={customAmount}
                                        onChange={(e) => {
                                            setCustomAmount(e.target.value)
                                            setClientSecret('')
                                        }}
                                        className="tabular"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {isMonthly && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="space-y-3"
                            >
                                <div className="space-y-1.5">
                                    <Label className="text-[13px]">Nombre</Label>
                                    <Input
                                        placeholder="Tu nombre"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[13px]">Email (para recibos)</Label>
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
                                className="w-full"
                                onClick={handleInitiatePayment}
                                disabled={loading || getFinalAmount() < 1 || (isMonthly && !email)}
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                {loading ? 'Procesando…' : `Donar ${getFinalAmount() > 0 ? getFinalAmount() + ' €' : ''} ${isMonthly ? '/ mes' : ''}`}
                            </Button>
                        )}
                </section>

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
                                <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
                                    <div className="flex items-center justify-between border-b px-5 py-3">
                                        <h3 className="text-sm font-semibold">Completar pago</h3>
                                        <Badge variant="secondary" className="text-[11px]">Seguro con Stripe</Badge>
                                    </div>
                                    <div className="p-5">
                                        <Elements stripe={stripePromise} options={{
                                            clientSecret,
                                            appearance: { theme: 'stripe' },
                                            locale: 'es'
                                        }}>
                                            <header className="mb-6 text-center">
                                                <div className="tabular text-3xl font-semibold tracking-tight">{getFinalAmount()} €</div>
                                                <div className="text-sm text-muted-foreground">{isMonthly ? 'cada mes' : 'pago único'}</div>
                                            </header>
                                            <CheckoutForm onSuccess={() => setPaymentSuccess(true)} />
                                        </Elements>
                                        <Button
                                            variant="ghost"
                                            className="w-full mt-3 text-muted-foreground"
                                            onClick={() => setClientSecret('')}
                                        >
                                            Cancelar / cambiar cantidad
                                        </Button>
                                    </div>
                                </section>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center"
                            >
                                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <p className="font-medium">Selecciona una cantidad para continuar</p>
                                <p className="mt-1 text-sm text-muted-foreground">El formulario de pago seguro aparecerá aquí</p>
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
    const [hasError, setHasError] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!stripe || !elements) return

        setIsProcessing(true)
        setHasError(false)
        setMessage(null)

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.origin,
            },
            redirect: 'if_required'
        })

        if (error) {
            setMessage(error.message || 'Error desconocido')
            setHasError(true)

            // Volver al estado normal después de 3 segundos
            setTimeout(() => {
                setHasError(false)
            }, 3000)
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            setMessage('¡Pago realizado con éxito!')
            onSuccess()
        } else {
            onSuccess()
        }

        setIsProcessing(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement />

            {message && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {message}
                </div>
            )}

            <Button
                disabled={isProcessing || !stripe || !elements}
                variant={hasError ? 'destructive' : 'default'}
                className="w-full"
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Procesando pago…
                    </>
                ) : !stripe || !elements ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando formulario…
                    </>
                ) : (
                    <>
                        <CreditCard className="h-4 w-4" />
                        Pagar ahora
                    </>
                )}
            </Button>
        </form>
    )
}
