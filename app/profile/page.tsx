"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowLeft, Loader2, Shield, Camera, Upload } from "lucide-react"
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
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const firstName = user.user_metadata?.first_name || ""
    const lastName = user.user_metadata?.last_name || ""
    const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "Mi Perfil"
    const initials = firstName || lastName
        ? `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
        : user.email?.substring(0, 2).toUpperCase()

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <Button
                    variant="ghost"
                    className="gap-2 pl-0 hover:bg-transparent hover:text-primary"
                    onClick={() => router.push("/")}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al Dashboard
                </Button>

                <div className="flex items-center gap-6">
                    <div className="relative group">
                        <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                            <AvatarImage src={avatarUrl || ""} />
                            <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors"
                            disabled={isUploading}
                        >
                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                        />
                    </div>

                    <div>
                        <h1 className="text-3xl font-bold">{fullName}</h1>
                        <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="capitalize gap-1">
                                <Shield className="h-3 w-3" />
                                {isLoadingData ? "..." : role}
                            </Badge>
                            <span className="text-muted-foreground text-sm">{user.email}</span>
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="general" className="w-full">
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="security">Seguridad</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general">
                        <div className="grid gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Información Personal</CardTitle>
                                    <CardDescription>Actualiza tu nombre y apellido.</CardDescription>
                                </CardHeader>
                                <form onSubmit={handleUpdateName}>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>Nombre</Label>
                                                <Input
                                                    value={profileFirstName}
                                                    onChange={(e) => setProfileFirstName(e.target.value)}
                                                    placeholder="Tu nombre"
                                                    required
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Apellido</Label>
                                                <Input
                                                    value={profileLastName}
                                                    onChange={(e) => setProfileLastName(e.target.value)}
                                                    placeholder="Tu apellido"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Email Actual</Label>
                                            <Input value={user.email} disabled />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Rol</Label>
                                            <Input value={role} disabled className="capitalize" />
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        <Button type="submit" disabled={isUpdatingName}>
                                            {isUpdatingName ? "Actualizando..." : "Actualizar Nombre"}
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="security">
                        <div className="grid gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Cambiar Email</CardTitle>
                                    <CardDescription>Actualiza tu dirección de correo electrónico.</CardDescription>
                                </CardHeader>
                                <form onSubmit={handleUpdateEmail}>
                                    <CardContent className="space-y-4">
                                        <div className="grid gap-2">
                                            <Label>Nuevo Email</Label>
                                            <Input
                                                type="email"
                                                placeholder="nuevo@email.com"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        <Button type="submit">Actualizar Email</Button>
                                    </CardFooter>
                                </form>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Cambiar Contraseña</CardTitle>
                                    <CardDescription>Asegura tu cuenta con una contraseña fuerte.</CardDescription>
                                </CardHeader>
                                <form onSubmit={handleUpdatePassword}>
                                    <CardContent className="space-y-4">
                                        <div className="grid gap-2">
                                            <Label>Nueva Contraseña</Label>
                                            <Input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Confirmar Contraseña</Label>
                                            <Input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        <Button type="submit">Actualizar Contraseña</Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
