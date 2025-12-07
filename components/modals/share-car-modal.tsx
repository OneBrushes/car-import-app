"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Share2, UserPlus } from "lucide-react"
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
    const [searchTerm, setSearchTerm] = useState("")
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedUser, setSelectedUser] = useState<string | null>(null)

    // Buscar usuarios cuando cambia el término
    useEffect(() => {
        const searchUsers = async () => {
            if (searchTerm.length < 2) {
                setUsers([])
                return
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('id, email, first_name, last_name')
                .or(`email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
                .limit(5)

            if (!error && data) {
                // Filtrar los que ya tienen el coche compartido
                const filtered = data.filter(u => !currentSharedWith.includes(u.id))
                setUsers(filtered)
            }
        }

        const timeoutId = setTimeout(searchUsers, 300)
        return () => clearTimeout(timeoutId)
    }, [searchTerm, currentSharedWith])

    const handleShare = async () => {
        if (!selectedUser) return
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
            setSearchTerm("")
            setSelectedUser(null)
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
        return user.email.split('@')[0] // Fallback si no hay nombre
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5" /> Compartir Coche
                    </DialogTitle>
                    <DialogDescription>
                        Busca un usuario para darle acceso de lectura.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Buscar Usuario</Label>
                        <div className="relative">
                            <UserPlus className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Nombre o Email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {/* Lista de resultados */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                onClick={() => setSelectedUser(user.id)}
                                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedUser === user.id
                                        ? "bg-primary/10 border-primary"
                                        : "bg-card border-border hover:bg-accent"
                                    }`}
                            >
                                <div>
                                    <p className="font-medium text-sm">{formatName(user)}</p>
                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                                {selectedUser === user.id && (
                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                )}
                            </div>
                        ))}
                        {searchTerm.length >= 2 && users.length === 0 && (
                            <p className="text-sm text-center text-muted-foreground py-2">
                                No se encontraron usuarios.
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
