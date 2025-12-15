"use client"

import { useState, useEffect } from "react"
import { X, Users, Loader2, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

interface ShareSpainCarModalProps {
    isOpen: boolean
    onClose: () => void
    carId: string
    carName: string
}

interface User {
    id: string
    email: string
    first_name?: string
    last_name?: string
}

interface SharedUser extends User {
    shared_at: string
}

export function ShareSpainCarModal({ isOpen, onClose, carId, carName }: ShareSpainCarModalProps) {
    const { user } = useAuth()
    const [users, setUsers] = useState<User[]>([])
    const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([])
    const [selectedUserId, setSelectedUserId] = useState("")
    const [loading, setLoading] = useState(false)
    const [loadingShares, setLoadingShares] = useState(true)

    useEffect(() => {
        if (isOpen) {
            fetchUsers()
            fetchSharedUsers()
        }
    }, [isOpen, carId])

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, email, first_name, last_name")
                .neq("id", user?.id || "")

            if (error) throw error
            setUsers(data || [])
        } catch (error) {
            console.error("Error fetching users:", error)
        }
    }

    const fetchSharedUsers = async () => {
        setLoadingShares(true)
        try {
            const { data, error } = await supabase
                .from("spain_car_shares")
                .select(`
          shared_with_id,
          created_at,
          profiles:shared_with_id (
            id,
            email,
            first_name,
            last_name
          )
        `)
                .eq("car_id", carId)

            if (error) throw error

            const formatted = (data || []).map((share: any) => ({
                id: share.profiles.id,
                email: share.profiles.email,
                first_name: share.profiles.first_name,
                last_name: share.profiles.last_name,
                shared_at: share.created_at,
            }))

            setSharedUsers(formatted)
        } catch (error) {
            console.error("Error fetching shared users:", error)
        } finally {
            setLoadingShares(false)
        }
    }

    const handleShare = async () => {
        if (!selectedUserId) {
            toast.error("Selecciona un usuario")
            return
        }

        setLoading(true)
        try {
            // Insertar compartido
            const { error: shareError } = await supabase.from("spain_car_shares").insert({
                car_id: carId,
                owner_id: user?.id,
                shared_with_id: selectedUserId,
            })

            if (shareError) throw shareError

            // Obtener nombre del propietario
            const { data: ownerData } = await supabase
                .from("profiles")
                .select("first_name, last_name, email")
                .eq("id", user?.id)
                .single()

            const ownerName = ownerData?.first_name && ownerData?.last_name
                ? `${ownerData.first_name} ${ownerData.last_name}`
                : ownerData?.email || "Un usuario"

            // Enviar notificación
            await supabase.from("notifications").insert({
                user_id: selectedUserId,
                type: "spain_car_shared",
                title: "Coche de España compartido",
                message: `${ownerName} ha compartido contigo el coche: ${carName}`,
                data: { car_id: carId, owner_id: user?.id },
            })

            toast.success("Coche compartido correctamente")
            setSelectedUserId("")
            fetchSharedUsers()
        } catch (error: any) {
            if (error.code === "23505") {
                toast.error("Ya has compartido este coche con este usuario")
            } else {
                toast.error("Error al compartir coche")
            }
        } finally {
            setLoading(false)
        }
    }

    const handleUnshare = async (userId: string) => {
        try {
            const { error } = await supabase
                .from("spain_car_shares")
                .delete()
                .eq("car_id", carId)
                .eq("shared_with_id", userId)

            if (error) throw error

            toast.success("Compartido eliminado")
            fetchSharedUsers()
        } catch (error) {
            toast.error("Error al eliminar compartido")
        }
    }

    if (!isOpen) return null

    const availableUsers = users.filter(
        (u) => !sharedUsers.some((su) => su.id === u.id)
    )

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg w-full max-w-md shadow-xl border border-border">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold">Compartir Coche</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div>
                        <p className="text-sm text-muted-foreground mb-2">Coche:</p>
                        <p className="font-semibold">{carName}</p>
                    </div>

                    {/* Compartir con nuevo usuario */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Compartir con:</label>
                        <div className="flex gap-2">
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                                disabled={loading}
                            >
                                <option value="">Selecciona un usuario...</option>
                                {availableUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.first_name && user.last_name
                                            ? `${user.first_name} ${user.last_name} (${user.email})`
                                            : user.email}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleShare}
                                disabled={loading || !selectedUserId}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                Compartir
                            </button>
                        </div>
                    </div>

                    {/* Lista de usuarios con acceso */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Usuarios con acceso:</label>
                        {loadingShares ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : sharedUsers.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic py-2">
                                No has compartido este coche con nadie aún
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {sharedUsers.map((sharedUser) => (
                                    <div
                                        key={sharedUser.id}
                                        className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg"
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">
                                                {sharedUser.first_name && sharedUser.last_name
                                                    ? `${sharedUser.first_name} ${sharedUser.last_name}`
                                                    : sharedUser.email}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(sharedUser.shared_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleUnshare(sharedUser.id)}
                                            className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors"
                                            title="Dejar de compartir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    )
}
