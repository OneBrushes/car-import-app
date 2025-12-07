"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Share2 } from "lucide-react"
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
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedUser, setSelectedUser] = useState<string>("")
    const [currentUserId, setCurrentUserId] = useState<string>("")

    // Cargar usuarios cuando se abre el modal
    useEffect(() => {
        const loadUsers = async () => {
            if (!isOpen) return

            try {
                // Obtener el ID del usuario actual
                const { data: { user } } = await supabase.auth.getUser()
                if (user) setCurrentUserId(user.id)

                // Cargar todos los usuarios
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, email, first_name, last_name')
                    .order('first_name', { ascending: true, nullsFirst: false })

                if (!error && data) {
                    // Filtrar: excluir al usuario actual y los que ya tienen el coche compartido
                    const filtered = data.filter(u =>
                        u.id !== user?.id && !currentSharedWith.includes(u.id)
                    )
                    setUsers(filtered)
                }
            } catch (error) {
                console.error(error)
            }
        }

        loadUsers()
        // Resetear selección al abrir
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

            toast.success("Coche compartido correctamente")
            onShare()
            onClose()
            setSelectedUser("")
        } catch (error) {
            console.error(error)
            toast.error("Error al compartir")
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
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5" /> Compartir Coche
                    </DialogTitle>
                    <DialogDescription>
                        Selecciona un usuario para darle acceso de lectura.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Usuario</Label>
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        >
                            <option value="">Selecciona un usuario...</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {formatName(user)} ({user.email})
                                </option>
                            ))}
                        </select>
                        {users.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                                No hay usuarios disponibles para compartir.
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleShare} disabled={!selectedUser || loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Compartir
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
