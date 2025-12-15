"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Share2, UserMinus, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"

interface ShareCarModalProps {
    isOpen: boolean
    onClose: () => void
    carId: string
    currentSharedWith: string[]
    onShare: () => void
}

export function ShareCarModal({ isOpen, onClose, carId, currentSharedWith, onShare }: ShareCarModalProps) {
    const [allUsers, setAllUsers] = useState<any[]>([])
    const [sharedUsers, setSharedUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedUser, setSelectedUser] = useState<string>("")

    // Cargar usuarios cuando se abre el modal
    useEffect(() => {
        const loadUsers = async () => {
            if (!isOpen) return

            try {
                const { data: { user } } = await supabase.auth.getUser()

                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, email, first_name, last_name')
                    .order('first_name', { ascending: true, nullsFirst: false })

                if (!error && data) {
                    const shared = data.filter(u => currentSharedWith.includes(u.id))
                    const available = data.filter(u =>
                        u.id !== user?.id && !currentSharedWith.includes(u.id)
                    )

                    setSharedUsers(shared)
                    setAllUsers(available)
                }
            } catch (error) {
                console.error(error)
            }
        }

        loadUsers()
        setSelectedUser("")
    }, [isOpen, currentSharedWith])

    const handleShare = async () => {
        if (!selectedUser) {
            toast.error("Selecciona un usuario")
            return
        }

        setLoading(true)

        try {
            const newSharedWith = [...currentSharedWith, selectedUser]

            const { error } = await supabase
                .from('imported_cars')
                .update({ shared_with: newSharedWith })
                .eq('id', carId)

            if (error) throw error

            // Obtener datos del coche y del propietario
            const { data: carData } = await supabase
                .from('imported_cars')
                .select('brand, model, year, user_id')
                .eq('id', carId)
                .single()

            const { data: { user: currentUser } } = await supabase.auth.getUser()

            const { data: ownerData } = await supabase
                .from('profiles')
                .select('first_name, last_name, email')
                .eq('id', currentUser?.id)
                .single()

            const ownerName = ownerData?.first_name && ownerData?.last_name
                ? `${ownerData.first_name} ${ownerData.last_name}`
                : ownerData?.email || 'Alguien'

            // Crear notificación para el usuario con quien se compartió
            if (carData) {
                await supabase
                    .from('notifications')
                    .insert({
                        user_id: selectedUser,
                        type: 'car_shared',
                        title: 'Coche compartido contigo',
                        message: `${ownerName} ha compartido ${carData.brand} ${carData.model} (${carData.year}) contigo`,
                        link: '/car-import',
                        metadata: {
                            car_id: carId,
                            shared_by: currentUser?.id,
                            owner_name: ownerName
                        }
                    })
            }

            toast.success("Coche compartido correctamente")

            // Cerrar modal ANTES de recargar
            onClose()
            setSelectedUser("")

            // Recargar en segundo plano
            onShare()
        } catch (error) {
            console.error(error)
            toast.error("Error al compartir")
        } finally {
            setLoading(false)
        }
    }

    const handleUnshare = async (userId: string) => {
        setLoading(true)

        try {
            const newSharedWith = currentSharedWith.filter(id => id !== userId)

            const { error } = await supabase
                .from('imported_cars')
                .update({ shared_with: newSharedWith })
                .eq('id', carId)

            if (error) throw error

            toast.success("Compartido eliminado")

            // Cerrar modal ANTES de recargar
            onClose()

            // Recargar en segundo plano
            onShare()
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar compartido")
        } finally {
            setLoading(false)
        }
    }

    const formatName = (user: any) => {
        if (user.first_name && user.last_name) {
            return `${user.first_name} ${user.last_name.charAt(0).toUpperCase()}.`
        }
        return user.email.split('@')[0]
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5" /> Gestionar Compartidos
                    </DialogTitle>
                    <DialogDescription>
                        Comparte o deja de compartir este coche con otros usuarios.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Usuarios compartidos actualmente */}
                    {sharedUsers.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Compartido con ({sharedUsers.length})</Label>
                            <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                {sharedUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20"
                                    >
                                        <div>
                                            <p className="font-medium text-sm">{formatName(user)}</p>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleUnshare(user.id)}
                                            disabled={loading}
                                            className="text-destructive hover:text-destructive/80"
                                        >
                                            <UserMinus className="w-4 h-4 mr-1" />
                                            Quitar
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Añadir nuevo usuario */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                            <UserPlus className="w-4 h-4" /> Compartir con
                        </Label>
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        >
                            <option value="">Selecciona un usuario...</option>
                            {allUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {formatName(user)} ({user.email})
                                </option>
                            ))}
                        </select>
                        {allUsers.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                                {sharedUsers.length > 0
                                    ? "No hay más usuarios disponibles para compartir."
                                    : "No hay usuarios disponibles para compartir."}
                            </p>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={onClose}>Cerrar</Button>
                        <Button onClick={handleShare} disabled={!selectedUser || loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <UserPlus className="mr-2 h-4 w-4" />
                            Compartir
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
