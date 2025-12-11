"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Car, Lock, Mail, ArrowRight, User } from "lucide-react"

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
            <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black p-4 overflow-hidden relative">
                <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in duration-500">
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                        <h2 className="text-xl font-semibold text-white mb-4">Recuperar Contraseña</h2>
                        <p className="text-sm text-slate-400 mb-6">Introduce tu email y te enviaremos un enlace para restablecerla.</p>

                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="reset-email" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Email</Label>
                                <Input
                                    id="reset-email"
                                    type="email"
                                    placeholder="nombre@empresa.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <Button className="w-full bg-primary" type="submit" disabled={loading}>
                                {loading ? <Loader2 className="animate-spin" /> : "Enviar enlace"}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full text-slate-400 hover:text-white"
                                onClick={() => setResetMode(false)}
                            >
                                Volver al login
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black p-4 overflow-hidden relative">

            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[100px]" />
            </div>

            <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in duration-500">
                {/* Logo / Brand */}
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-900/50 mb-4 p-2">
                        <img src="/NorDrive.png" alt="NorDrive Logo" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">NorDrive Manager</h1>
                    <p className="text-slate-400 mt-2 text-sm">Gestión profesional de importación de vehículos</p>
                </div>

                {/* Login Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl transition-all duration-300 ease-in-out" style={{ minHeight: '400px' }}>
                    <div className={`transition-all duration-300 ease-in-out ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold text-white mb-1">
                                {isSignUp ? "Crear cuenta nueva" : "Bienvenido de nuevo"}
                            </h2>
                            <p className="text-sm text-slate-400">
                                {isSignUp ? "Introduce tus datos para registrarte" : "Accede a tu panel de control"}
                            </p>
                        </div>

                        <form onSubmit={handleAuth} className="space-y-4">
                            {isSignUp && (
                                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Nombre</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                            <Input
                                                id="firstName"
                                                type="text"
                                                placeholder="Juan"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                required={isSignUp}
                                                className="pl-10 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Apellido</Label>
                                        <Input
                                            id="lastName"
                                            type="text"
                                            placeholder="Pérez"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            required={isSignUp}
                                            className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="email" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Email</Label>
                                </div>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="nombre@empresa.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="pl-10 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Contraseña</Label>
                                    {!isSignUp && (
                                        <button
                                            type="button"
                                            onClick={() => setResetMode(true)}
                                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            ¿Olvidaste tu contraseña?
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="pl-10 bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all"
                                    />
                                </div>
                            </div>

                            <Button
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-5 shadow-lg shadow-blue-900/20 border-0 mt-2 transition-all hover:scale-[1.02]"
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        {isSignUp ? "Registrarse" : "Iniciar Sesión"} <ArrowRight className="w-4 h-4" />
                                    </span>
                                )}
                            </Button>
                        </form>

                        {(registrationsEnabled || isSignUp) && (
                            <div className="mt-6 pt-6 border-t border-white/5 text-center">
                                {registrationsEnabled && (
                                    <button
                                        type="button"
                                        onClick={toggleMode}
                                        className="text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto group"
                                    >
                                        {isSignUp
                                            ? "¿Ya tienes cuenta? Inicia sesión"
                                            : "¿No tienes cuenta? Regístrate gratis"}
                                    </button>
                                )}
                                {isSignUp && !registrationsEnabled && (
                                    <button
                                        type="button"
                                        onClick={toggleMode}
                                        className="text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto group mt-2"
                                    >
                                        Volver al inicio de sesión
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <p className="text-center text-xs text-slate-600 mt-8">
                    &copy; {new Date().getFullYear()} NorDrive Manager. Todos los derechos reservados.
                </p>
            </div>
        </div>
    )
}
