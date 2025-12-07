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
import { Loader2, Shield, ShieldAlert, Users, Activity, Trash2, Database, Lock, Save, AlertTriangle, Ban, Info } from "lucide-react"
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

    // Security State
    const [registrationsEnabled, setRegistrationsEnabled] = useState(true)
    const [blockedEmails, setBlockedEmails] = useState<string[]>([])
    const [newBlockedEmail, setNewBlockedEmail] = useState("")

    useEffect(() => {
        fetchData()
        loadSettings()
    }, [])

    const loadSettings = async () => {
        // Simular carga de configuración (Idealmente desde tabla 'app_settings')
        const savedReg = localStorage.getItem('registrationsEnabled')
        if (savedReg !== null) setRegistrationsEnabled(JSON.parse(savedReg))

        const savedBlocked = localStorage.getItem('blockedEmails')
        if (savedBlocked) setBlockedEmails(JSON.parse(savedBlocked))
    }

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

            // Contar coches por usuario
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
        // Eliminado confirmación a petición del usuario
        try {
            const { error } = await supabase
                .from('imported_cars')
                .delete()
                .eq('user_id', userId)

            if (error) throw error

            toast.success("Datos eliminados correctamente")
            fetchData()

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
        // Eliminado confirmación a petición del usuario
        handleRoleChange(userId, newRole)
    }

    // --- Security Functions ---

    const toggleRegistrations = () => {
        const newValue = !registrationsEnabled
        setRegistrationsEnabled(newValue)
        localStorage.setItem('registrationsEnabled', JSON.stringify(newValue))
        toast.success(`Registros ${newValue ? 'habilitados' : 'deshabilitados'}`)

        supabase.from('activity_logs').insert({
            action: 'SETTINGS_CHANGE',
            details: `Registros ${newValue ? 'habilitados' : 'deshabilitados'}`
        })
    }

    const addBlockedEmail = () => {
        if (!newBlockedEmail || blockedEmails.includes(newBlockedEmail)) return
        const newEmails = [...blockedEmails, newBlockedEmail]
        setBlockedEmails(newEmails)
        localStorage.setItem('blockedEmails', JSON.stringify(newEmails))
        setNewBlockedEmail("")
        toast.success("Email bloqueado")
    }

    const removeBlockedEmail = (email: string) => {
        const newEmails = blockedEmails.filter(e => e !== email)
        setBlockedEmails(newEmails)
        localStorage.setItem('blockedEmails', JSON.stringify(newEmails))
        toast.success("Email desbloqueado")
    }

    // --- Storage Calculations ---
    const ESTIMATED_MB_PER_CAR = 0.5 // 500KB per car (data + images approx)
    const TOTAL_STORAGE_LIMIT_MB = 1000 // 1GB Supabase Free Tier Storage

    const calculateUserStorage = (userId: string) => {
        const count = carsCount[userId] || 0
        return (count * ESTIMATED_MB_PER_CAR).toFixed(2)
    }

    const totalUsedStorage = Object.values(carsCount).reduce((acc, count) => acc + (count * ESTIMATED_MB_PER_CAR), 0)
    const storagePercentage = (totalUsedStorage / TOTAL_STORAGE_LIMIT_MB) * 100

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6 animate-in">
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
                        <CardTitle className="text-sm font-medium">Almacenamiento Usado</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalUsedStorage.toFixed(1)} MB</div>
                        <p className="text-xs text-muted-foreground">de {TOTAL_STORAGE_LIMIT_MB} MB ({storagePercentage.toFixed(1)}%)</p>
                        <div className="h-2 w-full bg-secondary mt-2 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${storagePercentage > 90 ? 'bg-destructive' : 'bg-primary'}`}
                                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Estado Seguridad</CardTitle>
                        <Lock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${registrationsEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold">{registrationsEnabled ? 'Registros Abiertos' : 'Registros Cerrados'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{blockedEmails.length} emails bloqueados</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="users" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="users">Gestión Usuarios</TabsTrigger>
                    <TabsTrigger value="storage">Almacenamiento</TabsTrigger>
                    <TabsTrigger value="security">Seguridad</TabsTrigger>
                    <TabsTrigger value="logs">Logs Sistema</TabsTrigger>
                </TabsList>

                {/* --- USERS TAB --- */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usuarios Registrados</CardTitle>
                            <CardDescription>Gestiona roles y permisos.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Rol</TableHead>
                                        <TableHead>Registro</TableHead>
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
                                            <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant={user.role === 'banned' ? "outline" : "secondary"}
                                                    size="sm"
                                                    onClick={() => handleBanUser(user.id, user.role)}
                                                >
                                                    {user.role === 'banned' ? <Shield className="w-4 h-4 text-green-600 mr-2" /> : <Ban className="w-4 h-4 text-destructive mr-2" />}
                                                    {user.role === 'banned' ? "Desbloquear" : "Bloquear"}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- STORAGE TAB --- */}
                <TabsContent value="storage">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión de Almacenamiento</CardTitle>
                            <CardDescription>Visualiza y libera espacio ocupado por los usuarios.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-6 p-4 bg-secondary/20 rounded-lg border border-border">
                                <div className="flex justify-between mb-2">
                                    <span className="font-medium">Espacio Total Usado</span>
                                    <span className="font-bold">{totalUsedStorage.toFixed(1)} MB / {TOTAL_STORAGE_LIMIT_MB} MB</span>
                                </div>
                                <div className="h-4 w-full bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${storagePercentage > 90 ? 'bg-destructive' : 'bg-primary'}`}
                                        style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                                    />
                                </div>
                                <div className="flex items-start gap-2 mt-4 text-xs text-muted-foreground p-3 bg-background rounded border border-border">
                                    <Info className="w-4 h-4 mt-0.5 text-primary" />
                                    <div>
                                        <p><strong>Nota sobre Supabase:</strong> El plan gratuito incluye <strong>1GB de Almacenamiento</strong> (fotos/archivos) y <strong>0.5GB de Base de Datos</strong> (texto).</p>
                                        <p className="mt-1">Los <strong>5GB</strong> que ves en el panel de Supabase se refieren al <strong>Ancho de Banda (Egress)</strong>, es decir, la cantidad de datos que se pueden descargar/ver al mes, no el espacio en disco.</p>
                                    </div>
                                </div>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Usuario</TableHead>
                                        <TableHead>Coches Guardados</TableHead>
                                        <TableHead>Espacio Ocupado (Est.)</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>{carsCount[user.id] || 0}</TableCell>
                                            <TableCell>{calculateUserStorage(user.id)} MB</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleDeleteData(user.id)}
                                                    disabled={!carsCount[user.id]}
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Eliminar Datos
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- SECURITY TAB --- */}
                <TabsContent value="security">
                    <div className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Control de Acceso</CardTitle>
                                <CardDescription>Gestiona quién puede registrarse en la plataforma.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h4 className="font-medium">Permitir Nuevos Registros</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Si se desactiva, nadie nuevo podrá crear una cuenta.
                                    </p>
                                </div>
                                <div
                                    onClick={toggleRegistrations}
                                    className={`w-14 h-7 rounded-full p-1 cursor-pointer transition-colors ${registrationsEnabled ? 'bg-primary' : 'bg-secondary'}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${registrationsEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Lista Negra de Emails</CardTitle>
                                <CardDescription>Bloquea direcciones de correo específicas para impedir su acceso o registro.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        value={newBlockedEmail}
                                        onChange={(e) => setNewBlockedEmail(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border"
                                    />
                                    <Button onClick={addBlockedEmail}>
                                        <Ban className="w-4 h-4 mr-2" /> Bloquear
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {blockedEmails.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No hay emails bloqueados.</p>
                                    ) : (
                                        blockedEmails.map((email) => (
                                            <div key={email} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
                                                <span className="font-medium text-sm">{email}</span>
                                                <Button variant="ghost" size="sm" onClick={() => removeBlockedEmail(email)}>
                                                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- LOGS TAB --- */}
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
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
