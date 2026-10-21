"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Lock, Mail, ArrowRight, ArrowLeft, User } from "lucide-react"

function AuthBackground() {
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        />
    )
}

function BrandLogo() {
    return (
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white p-1.5 shadow-xs">
            <img
                src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/NorDrive.png`}
                alt="NorDrive Logo"
                className="h-full w-full object-contain"
            />
        </div>
    )
}

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [loading, setLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const [registrationsEnabled, setRegistrationsEnabled] = useState(true)
    const [isAnimating, setIsAnimating] = useState(false)
    const [resetMode, setResetMode] = useState(false)
    const router = useRouter()

    useEffect(() => {
        // Cargar configuración global desde Supabase
        const fetchSettings = async () => {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'registrations_enabled')
                .single()

            if (data) {
                setRegistrationsEnabled(data.value)
            }
        }
        fetchSettings()
    }, [])

    // Una cuenta del área de clientes ha intentado entrar en la app de gestión
    useEffect(() => {
        try {
            if (sessionStorage.getItem('nordrive-login-notice') === 'cliente') {
                sessionStorage.removeItem('nordrive-login-notice')
                toast.info("Esta cuenta es del área de clientes. Entra en www.nordrivecars.com/clientes para ver tu coche.", { duration: 10000 })
            }
        } catch { }
    }, [])

    const toggleMode = () => {
        setIsAnimating(true)
        setTimeout(() => {
            setIsSignUp(!isSignUp)
            setIsAnimating(false)
        }, 300)
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()

        // Evitar múltiples envíos
        if (isSubmitting) {
            toast.info("Por favor, espera un momento antes de intentar de nuevo")
            return
        }

        setIsSubmitting(true)
        setLoading(true)
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/update-password`,
            })
            if (error) throw error
            toast.success("Se ha enviado un correo para restablecer tu contraseña.")
            setResetMode(false)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
            // Cooldown de 3 segundos
            setTimeout(() => setIsSubmitting(false), 3000)
        }
    }

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()

        // Evitar múltiples envíos
        if (isSubmitting) {
            toast.info("Por favor, espera un momento antes de intentar de nuevo")
            return
        }

        setIsSubmitting(true)
        setLoading(true)

        try {
            // Check blocked emails
            const blockedEmails = JSON.parse(localStorage.getItem('blockedEmails') || '[]')
            if (blockedEmails.includes(email)) {
                throw new Error("El acceso para este email ha sido restringido.")
            }

            if (isSignUp) {
                if (!registrationsEnabled) {
                    throw new Error("El registro de nuevos usuarios está temporalmente deshabilitado.")
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            first_name: firstName,
                            last_name: lastName,
                        }
                    }
                })
                if (error) throw error

                // Intentar actualizar perfil si existe
                if (data.user) {
                    await supabase.from('profiles').update({
                        first_name: firstName,
                        last_name: lastName
                    }).eq('id', data.user.id)

                    // Log Signup
                    await supabase.from('activity_logs').insert({
                        user_id: data.user.id,
                        action: 'SIGNUP',
                        details: `Nuevo usuario registrado: ${email} (${firstName} ${lastName})`
                    })
                }

                toast.success("Cuenta creada. ¡Revisa tu email para confirmar!")
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error

                // Check if user is banned
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
                    if (profile?.role === 'banned') {
                        await supabase.auth.signOut()
                        throw new Error("Tu cuenta ha sido suspendida.")
                    }

                    // Log Login
                    await supabase.from('activity_logs').insert({
                        user_id: user.id,
                        action: 'LOGIN',
                        details: `Inicio de sesión exitoso`
                    })
                }

                toast.success("Has iniciado sesión correctamente")
                router.push("/")
                router.refresh()
            }
        } catch (error: any) {
            toast.error(error.message || "Ha ocurrido un error")
        } finally {
            setLoading(false)
            // Cooldown de 3 segundos antes de permitir otro envío
            setTimeout(() => setIsSubmitting(false), 3000)
        }
    }

    if (resetMode) {
        return (
            <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
                <AuthBackground />
                <div className="relative z-10 w-full max-w-sm animate-in fade-in duration-300">
                    <div className="flex flex-col items-center text-center mb-6">
                        <BrandLogo />
                        <h1 className="text-2xl font-semibold tracking-tight mb-1">Recuperar contraseña</h1>
                        <p className="text-sm text-muted-foreground">
                            Introduce tu email y te enviaremos un enlace para restablecerla.
                        </p>
                    </div>

                    <div className="rounded-xl border bg-card p-6 shadow-xs">
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="reset-email" className="text-[13px]">Email</Label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="reset-email"
                                        type="email"
                                        placeholder="nombre@empresa.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar enlace"}
                            </Button>
                        </form>
                    </div>

                    <button
                        type="button"
                        onClick={() => setResetMode(false)}
                        className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Volver al inicio de sesión
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            <AuthBackground />

            <div className="relative z-10 w-full max-w-sm animate-in fade-in duration-300">
                {/* Logo / Brand */}
                <div className="flex flex-col items-center text-center mb-6">
                    <BrandLogo />
                    <h1 className="text-2xl font-semibold tracking-tight mb-1">
                        {isSignUp ? "Crear cuenta nueva" : "Bienvenido de nuevo"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {isSignUp
                            ? "Introduce tus datos para registrarte en NorDrive Manager"
                            : "Accede a tu panel de NorDrive Manager"}
                    </p>
                </div>

                {/* Login Card */}
                <div className="rounded-xl border bg-card p-6 shadow-xs">
                    <div className={`transition-all duration-300 ease-in-out ${isAnimating ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}>
                        <form onSubmit={handleAuth} className="space-y-4">
                            {isSignUp && (
                                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="firstName" className="text-[13px]">Nombre</Label>
                                        <div className="relative">
                                            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                id="firstName"
                                                type="text"
                                                placeholder="Juan"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                required={isSignUp}
                                                className="pl-9"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="lastName" className="text-[13px]">Apellido</Label>
                                        <Input
                                            id="lastName"
                                            type="text"
                                            placeholder="Pérez"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            required={isSignUp}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-[13px]">Email</Label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="nombre@empresa.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-[13px]">Contraseña</Label>
                                    {!isSignUp && (
                                        <button
                                            type="button"
                                            onClick={() => setResetMode(true)}
                                            className="text-xs text-muted-foreground transition-colors hover:text-primary"
                                        >
                                            ¿Olvidaste tu contraseña?
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                            <Button className="w-full mt-2" type="submit" disabled={loading}>
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        {isSignUp ? "Registrarse" : "Iniciar sesión"}
                                        <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </div>
                </div>

                {(registrationsEnabled || isSignUp) && (
                    <div className="mt-5 text-center">
                        {registrationsEnabled && (
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {isSignUp ? (
                                    <>¿Ya tienes cuenta? <span className="font-medium text-primary">Inicia sesión</span></>
                                ) : (
                                    <>¿No tienes cuenta? <span className="font-medium text-primary">Regístrate</span></>
                                )}
                            </button>
                        )}
                        {isSignUp && !registrationsEnabled && (
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="mt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                Volver al inicio de sesión
                            </button>
                        )}
                    </div>
                )}

                <p className="mt-8 text-center text-xs text-muted-foreground/70">
                    &copy; {new Date().getFullYear()} NorDrive Manager · Gestión de importación de vehículos
                </p>
            </div>
        </div>
    )
}
