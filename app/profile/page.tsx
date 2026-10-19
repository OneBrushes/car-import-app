"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowLeft, Loader2, Shield, Camera, User, Mail, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { compressProfileImage } from "@/lib/image-compression"
import { Badge } from "@/components/ui/badge"

export default function ProfilePage() {
    const { user, loading } = useAuth()
    const router = useRouter()
    const [role, setRole] = useState<string>("usuario")
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [isLoadingData, setIsLoadingData] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Estados para formularios
    const [newEmail, setNewEmail] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [profileFirstName, setProfileFirstName] = useState("")
    const [profileLastName, setProfileLastName] = useState("")
    const [isUpdatingName, setIsUpdatingName] = useState(false)

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
                    .select('role, avatar_url, first_name, last_name')
                    .eq('id', user.id)
                    .single()

                if (data) {
                    setRole(data.role)
                    setAvatarUrl(data.avatar_url)
                    setProfileFirstName(data.first_name || "")
                    setProfileLastName(data.last_name || "")
                }
            } catch (error) {
                console.error('Error fetching profile:', error)
            } finally {
                setIsLoadingData(false)
            }
        }

        getProfile()
    }, [user])

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return

        const file = event.target.files[0]
        setIsUploading(true)

        try {
            // 1. Comprimir imagen
            const compressedFile = await compressProfileImage(file)

            // 1.5. Borrar avatar anterior si existe para no acumular basura
            const { data: oldFiles } = await supabase.storage.from('avatars').list('', { search: user?.id })
            if (oldFiles && oldFiles.length > 0) {
                const filesToRemove = oldFiles.map(f => f.name)
                await supabase.storage.from('avatars').remove(filesToRemove)
            }

            // 2. Subir a Supabase Storage
            const fileExt = compressedFile.name.split('.').pop()
            const fileName = `${user?.id}-${Math.random()}.${fileExt}`
            const filePath = `${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, compressedFile)

            if (uploadError) throw uploadError

            // 3. Obtener URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath)

            // 4. Actualizar perfil
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user?.id)

            if (updateError) throw updateError

            setAvatarUrl(publicUrl)
            toast.success("Foto de perfil actualizada")
        } catch (error: any) {
            toast.error("Error al subir la imagen: " + error.message)
        } finally {
            setIsUploading(false)
        }
    }

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const { error } = await supabase.auth.updateUser({ email: newEmail })
            if (error) throw error
            toast.success("Revisa tu nuevo email para confirmar el cambio")
            setNewEmail("")
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsUpdatingName(true)
        try {
            // Update profiles table
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    first_name: profileFirstName,
                    last_name: profileLastName
                })
                .eq('id', user?.id)

            if (profileError) throw profileError

            // Update auth.users raw_user_meta_data
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    first_name: profileFirstName,
                    last_name: profileLastName
                }
            })

            if (authError) throw authError

            toast.success("Nombre actualizado correctamente")
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsUpdatingName(false)
        }
    }

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            return toast.error("Las contraseñas no coinciden")
        }
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error
            toast.success("Contraseña actualizada correctamente")
            setNewPassword("")
            setConfirmPassword("")
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const firstName = user.user_metadata?.first_name || ""
    const lastName = user.user_metadata?.last_name || ""
    const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "Mi perfil"
    const initials = firstName || lastName
        ? `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
        : user.email?.substring(0, 2).toUpperCase()

    return (
        <div className="min-h-screen bg-background px-4 py-6 sm:px-8 sm:py-10">
            <div className="mx-auto max-w-3xl space-y-6">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => router.push("/")}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al panel
                </Button>

                {/* Cabecera del perfil */}
                <div className="rounded-xl border bg-card p-5 shadow-xs">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                        <div className="relative w-fit">
                            <Avatar className="h-20 w-20 border">
                                <AvatarImage src={avatarUrl || ""} />
                                <AvatarFallback className="bg-primary/10 text-xl font-medium text-primary">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-60"
                                disabled={isUploading}
                                aria-label="Cambiar foto de perfil"
                                title="Cambiar foto de perfil"
                            >
                                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleAvatarUpload}
                            />
                        </div>

                        <div className="min-w-0">
                            <h1 className="text-2xl font-semibold tracking-tight mb-1 truncate">{fullName}</h1>
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="capitalize gap-1 border-transparent bg-primary/10 text-primary">
                                    <Shield className="h-3 w-3" />
                                    {isLoadingData ? "..." : role}
                                </Badge>
                                <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="general" className="w-full gap-4">
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="security">Seguridad</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general">
                        <section className="rounded-xl border bg-card shadow-xs">
                            <div className="flex items-start gap-3 border-b p-5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                    <User className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">Información personal</h3>
                                    <p className="text-sm text-muted-foreground">Actualiza tu nombre y apellido.</p>
                                </div>
                            </div>
                            <form onSubmit={handleUpdateName}>
                                <div className="space-y-4 p-5">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="profile-first-name" className="text-[13px]">Nombre</Label>
                                            <Input
                                                id="profile-first-name"
                                                value={profileFirstName}
                                                onChange={(e) => setProfileFirstName(e.target.value)}
                                                placeholder="Tu nombre"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="profile-last-name" className="text-[13px]">Apellido</Label>
                                            <Input
                                                id="profile-last-name"
                                                value={profileLastName}
                                                onChange={(e) => setProfileLastName(e.target.value)}
                                                placeholder="Tu apellido"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="profile-email" className="text-[13px]">Email actual</Label>
                                            <Input id="profile-email" value={user.email} disabled />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="profile-role" className="text-[13px]">Rol</Label>
                                            <Input id="profile-role" value={role} disabled className="capitalize" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end rounded-b-xl border-t bg-muted/40 px-5 py-3">
                                    <Button type="submit" disabled={isUpdatingName}>
                                        {isUpdatingName && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {isUpdatingName ? "Actualizando..." : "Actualizar nombre"}
                                    </Button>
                                </div>
                            </form>
                        </section>
                    </TabsContent>

                    <TabsContent value="security">
                        <div className="grid gap-4">
                            <section className="rounded-xl border bg-card shadow-xs">
                                <div className="flex items-start gap-3 border-b p-5">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <Mail className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">Cambiar email</h3>
                                        <p className="text-sm text-muted-foreground">Actualiza tu dirección de correo electrónico.</p>
                                    </div>
                                </div>
                                <form onSubmit={handleUpdateEmail}>
                                    <div className="p-5">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="new-email" className="text-[13px]">Nuevo email</Label>
                                            <Input
                                                id="new-email"
                                                type="email"
                                                placeholder="nuevo@email.com"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end rounded-b-xl border-t bg-muted/40 px-5 py-3">
                                        <Button type="submit">Actualizar email</Button>
                                    </div>
                                </form>
                            </section>

                            <section className="rounded-xl border bg-card shadow-xs">
                                <div className="flex items-start gap-3 border-b p-5">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <Lock className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">Cambiar contraseña</h3>
                                        <p className="text-sm text-muted-foreground">Asegura tu cuenta con una contraseña fuerte.</p>
                                    </div>
                                </div>
                                <form onSubmit={handleUpdatePassword}>
                                    <div className="grid gap-4 p-5 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="new-password" className="text-[13px]">Nueva contraseña</Label>
                                            <Input
                                                id="new-password"
                                                type="password"
                                                placeholder="••••••••"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="confirm-password" className="text-[13px]">Confirmar contraseña</Label>
                                            <Input
                                                id="confirm-password"
                                                type="password"
                                                placeholder="••••••••"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end rounded-b-xl border-t bg-muted/40 px-5 py-3">
                                        <Button type="submit">Actualizar contraseña</Button>
                                    </div>
                                </form>
                            </section>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
