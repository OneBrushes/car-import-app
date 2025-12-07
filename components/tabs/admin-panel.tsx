"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Loader2, Shield, ShieldAlert, Users, Activity, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

interface Profile {
    id: string
    email: string
    role: string
    created_at: string
    last_sign_in_at?: string
}

interface Log {
    id: string
    user_id: string
    action: string
    details: string
    created_at: string
    profiles: { email: string }
}

export function AdminPanel() {
    const [users, setUsers] = useState<Profile[]>([])
    const [logs, setLogs] = useState<Log[]>([])
    const [loading, setLoading] = useState(true)
    const [carsCount, setCarsCount] = useState<Record<string, number>>({})

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            // Cargar usuarios
            const { data: usersData, error: usersError } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false })

            if (usersError) throw usersError
            setUsers(usersData || [])

            // Cargar logs
            const { data: logsData, error: logsError } = await supabase
                .from('activity_logs')
                .select('*, profiles(email)')
                .order('created_at', { ascending: false })
                .limit(50)

            if (!logsError && logsData) {
                setLogs(logsData as any)
            }

            // Contar coches por usuario (ineficiente pero funcional sin backend)
            const { data: carsData } = await supabase.from('imported_cars').select('user_id')
            const counts: Record<string, number> = {}
            carsData?.forEach((car: any) => {
                counts[car.user_id] = (counts[car.user_id] || 0) + 1
            })
            setCarsCount(counts)

        } catch (error) {
            console.error("Error fetching admin data:", error)
            toast.error("Error cargando datos de administración")
        } finally {
            setLoading(false)
        }
    }

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId)

            if (error) throw error

            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
            toast.success(`Rol actualizado a ${newRole}`)

            await supabase.from('activity_logs').insert({
                action: 'ROLE_CHANGE',
                details: `Rol cambiado a ${newRole} para el usuario ${userId}`
            })

        } catch (error) {
            toast.error("Error al actualizar el rol")
        }
    }

    const handleDeleteData = async (userId: string) => {
        if (!confirm("¿ESTÁS SEGURO? Esto eliminará TODOS los coches importados de este usuario. Esta acción no se puede deshacer.")) return

        try {
            const { error } = await supabase
                .from('imported_cars')
                .delete()
                .eq('user_id', userId)

            if (error) throw error

            toast.success("Datos eliminados correctamente")
            fetchData() // Recargar contadores

            await supabase.from('activity_logs').insert({
                action: 'DATA_WIPE',
                details: `Datos eliminados para el usuario ${userId}`
            })
        } catch (error) {
            toast.error("Error al eliminar datos")
        }
    }

    const handleBanUser = async (userId: string, currentRole: string) => {
        const newRole = currentRole === 'banned' ? 'usuario' : 'banned'
        const action = currentRole === 'banned' ? 'Desbloquear' : 'Bloquear'

        if (!confirm(`¿Estás seguro de ${action} a este usuario?`)) return

        handleRoleChange(userId, newRole)
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Usuarios Totales</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{users.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Admins</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {users.filter(u => u.role === 'admin').length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Actividad Reciente</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{logs.length}</div>
                        <p className="text-xs text-muted-foreground">Últimos eventos</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="users">
                <TabsList>
                    <TabsTrigger value="users">Gestión de Usuarios</TabsTrigger>
                    <TabsTrigger value="logs">Logs del Sistema</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usuarios Registrados</CardTitle>
                            <CardDescription>Gestiona los roles, permisos y datos de los usuarios.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Rol</TableHead>
                                        <TableHead>Datos (Coches)</TableHead>
                                        <TableHead>Fecha Registro</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id} className={user.role === 'banned' ? 'bg-destructive/10' : ''}>
                                            <TableCell>
                                                {user.email}
                                                {user.role === 'banned' && <span className="ml-2 text-xs text-destructive font-bold">(BANEADO)</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    defaultValue={user.role}
                                                    onValueChange={(val) => handleRoleChange(user.id, val)}
                                                    disabled={user.role === 'banned'}
                                                >
                                                    <SelectTrigger className="w-[130px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="usuario">Usuario</SelectItem>
                                                        <SelectItem value="gestor">Gestor</SelectItem>
                                                        <SelectItem value="importador">Importador</SelectItem>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{carsCount[user.id] || 0} coches</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => handleDeleteData(user.id)}
                                                        title="Borrar todos los coches de este usuario"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant={user.role === 'banned' ? "outline" : "secondary"}
                                                        size="sm"
                                                        onClick={() => handleBanUser(user.id, user.role)}
                                                        title={user.role === 'banned' ? "Desbloquear usuario" : "Bloquear usuario"}
                                                    >
                                                        {user.role === 'banned' ? <Shield className="w-4 h-4 text-green-600" /> : <ShieldAlert className="w-4 h-4 text-destructive" />}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="logs">
                    <Card>
                        <CardHeader>
                            <CardTitle>Registro de Actividad</CardTitle>
                            <CardDescription>Auditoría de acciones importantes.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Usuario</TableHead>
                                        <TableHead>Acción</TableHead>
                                        <TableHead>Detalles</TableHead>
                                        <TableHead>Fecha</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-medium">{log.profiles?.email || 'Desconocido'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{log.action}</Badge>
                                            </TableCell>
                                            <TableCell>{log.details}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {logs.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                No hay logs registrados aún
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
