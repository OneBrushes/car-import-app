"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Lock, Car } from "lucide-react"

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    useEffect(() => {
        // Verificar si tenemos sesión (el link de recuperación inicia sesión automáticamente)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error("Enlace inválido o expirado. Vuelve a solicitar el cambio.")
                router.push("/login")
            }
        }
        checkSession()
    }, [router])

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (password !== confirmPassword) {
            toast.error("Las contraseñas no coinciden")
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error

            toast.success("Contraseña actualizada correctamente")
            router.push("/") // Ir al dashboard
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black p-4">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-900/50 mb-4 p-2 transform rotate-3 hover:rotate-0 transition-all duration-300 cursor-pointer">
                        <img src="/NorDrive.png" alt="NorDrive Logo" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Nueva Contraseña</h1>
                    <p className="text-slate-400 mt-2 text-sm">Introduce tu nueva contraseña para acceder.</p>
                </div>

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-300">Nueva Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="pl-10 bg-black/20 border-white/10 text-white"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm" className="text-slate-300">Confirmar Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                <Input
                                    id="confirm"
                                    type="password"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="pl-10 bg-black/20 border-white/10 text-white"
                                />
                            </div>
                        </div>

                        <Button className="w-full bg-primary mt-4" type="submit" disabled={loading}>
                            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                            Actualizar Contraseña
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
