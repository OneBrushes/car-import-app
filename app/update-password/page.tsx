"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Lock } from "lucide-react"

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
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
            />
            <div className="relative z-10 w-full max-w-sm animate-in fade-in duration-300">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white p-1.5 shadow-xs">
                        <img
                            src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/NorDrive.png`}
                            alt="NorDrive Logo"
                            className="h-full w-full object-contain"
                        />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight mb-1">Nueva contraseña</h1>
                    <p className="text-sm text-muted-foreground">Introduce tu nueva contraseña para acceder.</p>
                </div>

                <div className="rounded-xl border bg-card p-6 shadow-xs">
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-[13px]">Nueva contraseña</Label>
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
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm" className="text-[13px]">Confirmar contraseña</Label>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="confirm"
                                    type="password"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        <Button className="w-full mt-2" type="submit" disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Actualizar contraseña
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
