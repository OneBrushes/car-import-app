"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Loader2, Shield } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

export default function ProfilePage() {
    const { user, loading } = useAuth()
    const router = useRouter()
    const [role, setRole] = useState<string>("usuario")
    const [isLoadingRole, setIsLoadingRole] = useState(true)

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login")
        }
    }, [user, loading, router])

    useEffect(() => {
        async function getProfile() {
            if (!user) return
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()

                if (data) {
                    setRole(data.role)
                }
            } catch (error) {
                console.error('Error fetching profile:', error)
            } finally {
                setIsLoadingRole(false)
            }
        }

        getProfile()
    }, [user])

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <Button
                    variant="ghost"
                    className="gap-2 pl-0 hover:bg-transparent hover:text-primary"
                    onClick={() => router.push("/")}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al Dashboard
                </Button>

                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">Mi Perfil</h1>
                    <p className="text-muted-foreground">Gestiona tu información personal y preferencias.</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Información de la Cuenta</CardTitle>
                        <CardDescription>Detalles de tu cuenta en NorDrive</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input value={user.email} disabled />
                        </div>

                        <div className="space-y-2">
                            <Label>ID de Usuario</Label>
                            <Input value={user.id} disabled className="font-mono text-xs" />
                        </div>

                        <div className="pt-4 flex items-center gap-2">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Shield className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Rol actual</p>
                                <p className="text-sm text-muted-foreground capitalize">
                                    {isLoadingRole ? "Cargando..." : role || "Usuario Estándar"}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
