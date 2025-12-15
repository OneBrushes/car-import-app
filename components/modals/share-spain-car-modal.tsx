"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Share2, UserMinus, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"

interface ShareSpainCarModalProps {
    isOpen: boolean
    onClose: () => void
    carId: string
    currentSharedWith: string[]
    onShare: () => void
}

export function ShareSpainCarModal({ isOpen, onClose, carId, currentSharedWith, onShare }: ShareSpainCarModalProps) {
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
                .from('spain_cars')
                .update({ shared_with: newSharedWith })
                .eq('id', carId)

            if (error) throw error

            // Obtener datos del coche y del propietario
            const { data: carData } = await supabase
                .from('spain_cars')
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
                        type: 'spain_car_shared',
                        title: 'Coche de España compartido contigo',
                        message: `${ownerName} ha compartido contigo el coche: ${carData.brand} ${carData.model} (${carData.year})`,
                        metadata: {
                            car_id: carId,
                            owner_id: currentUser?.id,
                            car_brand: carData.brand,
                            car_model: carData.model
                        }
                    })
            }

            toast.success("Coche compartido correctamente")
            onShare()
            setSelectedUser("")
        } catch (error: any) {
            console.error(error)
            toast.error("Error al compartir el coche")
        } finally {
            setLoading(false)
        }
    }

    const handleUnshare = async (userId: string) => {
        setLoading(true)

        try {
            const newSharedWith = currentSharedWith.filter(id => id !== userId)

            const { error } = await supabase
                .from('spain_cars')
                .update({ shared_with: newSharedWith })
                .eq('id', carId)

            if (error) throw error

            toast.success("Acceso eliminado")
            onShare()
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar acceso")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5" />
                        Compartir Coche de España
                    </DialogTitle>
                    <DialogDescription>
                        Comparte este coche con otros usuarios para que puedan verlo y compararlo.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Compartir con nuevo usuario */}
                    <div className="space-y-2">
                        <Label htmlFor="user-select">Compartir con:</Label>
                        <div className="flex gap-2">
                            <select
                                id="user-select"
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                                disabled={loading}
                            >
                                <option value="">Selecciona un usuario...</option>
                                {allUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.first_name && user.last_name
                                            ? `${user.first_name} ${user.last_name} (${user.email})`
                                            : user.email}
                                    </option>
                                ))}
                            </select>
                            <Button
                                onClick={handleShare}
                                disabled={loading || !selectedUser}
                                size="sm"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <UserPlus className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Lista de usuarios con acceso */}
                    <div className="space-y-2">
                        <Label>Usuarios con acceso:</Label>
                        {sharedUsers.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic py-2">
                                No has compartido este coche con nadie aún
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                                {sharedUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg"
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">
                                                {user.first_name && user.last_name
                                                    ? `${user.first_name} ${user.last_name}`
                                                    : user.email}
                                            </p>
                                            {user.first_name && user.last_name && (
                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                            )}
                                        </div>
                                        <Button
                                            onClick={() => handleUnshare(user.id)}
                                            variant="ghost"
                                            size="sm"
                                            disabled={loading}
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <UserMinus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={onClose} variant="outline">
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
