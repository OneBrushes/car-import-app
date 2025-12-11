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
import { Loader2, Shield, Users, Trash2, Database, Lock, Ban, Info, HardDrive, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ExportImportTools } from "@/components/export-import-tools"

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
    const [dbSizeMB, setDbSizeMB] = useState<number>(0)
    const [usersCountReal, setUsersCountReal] = useState<number>(0)

    // Real Storage Calculation State
    const [realStorageMB, setRealStorageMB] = useState<number | null>(null)
    const [calculatingStorage, setCalculatingStorage] = useState(false)

    // Security State
    const [registrationsEnabled, setRegistrationsEnabled] = useState(true)
    const [donationsEnabled, setDonationsEnabled] = useState(false)
    const [blockedEmails, setBlockedEmails] = useState<string[]>([])
    const [newBlockedEmail, setNewBlockedEmail] = useState("")

    useEffect(() => {
        fetchData()
        loadSettings()

        // Subscribe to realtime changes in imported_cars for storage updates
        const carsChannel = supabase
            .channel('imported_cars_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'imported_cars'
                },
                () => {
                    // Refetch car counts when cars are added/deleted
                    supabase.from('imported_cars').select('user_id').then(({ data }) => {
                        const counts: Record<string, number> = {}
                        data?.forEach((car: any) => {
                            counts[car.user_id] = (counts[car.user_id] || 0) + 1
                        })
                        setCarsCount(counts)
                    })
                }
            )
            .subscribe()

        return () => {
            carsChannel.unsubscribe()
        }
    }, [])

    const loadSettings = async () => {
        // Cargar configuración global desde DB
        const { data } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'registrations_enabled')
            .single()

        if (data) {
            setRegistrationsEnabled(data.value)
        }

        const { data: donationsData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'donations_enabled')
            .single()

        if (donationsData) {
            setDonationsEnabled(donationsData.value)
        }

        const savedBlocked = localStorage.getItem('blockedEmails')
        if (savedBlocked) setBlockedEmails(JSON.parse(savedBlocked))

        // Get real storage size from Supabase Storage API
        getRealStorageSize()
    }

    const getRealStorageSize = async () => {
        try {
            const { data, error } = await supabase.storage.from('car-images').list()
            if (error) throw error

            let totalBytes = 0

            // Recursively get all files
            const getAllFiles = async (path = '') => {
                const { data: files } = await supabase.storage.from('car-images').list(path)
                if (!files) return

                for (const file of files) {
                    if (file.id) {
                        // It's a file
                        const { data: fileData } = await supabase.storage
                            .from('car-images')
                            .download(path ? `${path}/${file.name}` : file.name)

                        if (fileData) {
                            totalBytes += fileData.size
                        }
                    } else {
                        // It's a folder, recurse
                        await getAllFiles(path ? `${path}/${file.name}` : file.name)
                    }
                }
            }

            await getAllFiles()
            const mb = totalBytes / (1024 * 1024)
            setRealStorageMB(mb)
        } catch (error) {
            console.error('Error getting real storage size:', error)
        }
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

            // Cargar logs SIN JOIN (para evitar problemas de RLS)
            const { data: logsData, error: logsError } = await supabase
                .from('activity_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)

            console.log('Logs query result:', { logsData, logsError })

            if (logsError) {
                console.error('Error loading logs:', logsError)
                toast.error(`Error cargando logs: ${logsError.message}`)
                setLogs([])
            } else if (logsData) {
                // Obtener emails de usuarios manualmente
                const userIds = [...new Set(logsData.map(log => log.user_id).filter(Boolean))]
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, email')
                    .in('id', userIds)

                // Crear un mapa de user_id -> email
                const emailMap = new Map(profilesData?.map(p => [p.id, p.email]) || [])

                // Combinar logs con emails
                const logsWithEmails = logsData.map(log => ({
                    ...log,
                    profiles: { email: emailMap.get(log.user_id) || 'Desconocido' }
                }))

                setLogs(logsWithEmails as any)
                console.log('Logs loaded:', logsWithEmails.length)
            }

            // Contar coches por usuario
            const { data: carsData } = await supabase.from('imported_cars').select('user_id')
            const counts: Record<string, number> = {}
            carsData?.forEach((car: any) => {
                counts[car.user_id] = (counts[car.user_id] || 0) + 1
            })
            setCarsCount(counts)

            // Métricas Reales (RPC)
            try {
                const { data: dbBytes } = await supabase.rpc('get_database_size')
                if (dbBytes) setDbSizeMB(Number(dbBytes) / (1024 * 1024))

                const { data: usersReal } = await supabase.rpc('get_users_count')
                if (usersReal) setUsersCountReal(Number(usersReal))
            } catch (e) {
                console.warn("RPC metrics failed, using fallback", e)
            }

        } catch (error) {
            console.error("Error fetching admin data:", error)
            toast.error("Error cargando datos de administración")
        } finally {
            setLoading(false)
        }
    }

    const calculateRealStorage = async () => {
        setCalculatingStorage(true)
        try {
            // 1. Intentar RPC (Rápido y preciso)
            const { data: storageBytes, error: rpcError } = await supabase.rpc('get_storage_size')

            if (!rpcError && storageBytes !== null) {
                const mb = Number(storageBytes) / (1024 * 1024)
                setRealStorageMB(mb)
                toast.success(`Almacenamiento real (RPC): ${mb.toFixed(2)} MB`)
                return
            }

            console.warn("RPC storage failed, falling back to manual calculation", rpcError)

            // 2. Fallback: Iterar sobre archivos (Lento)
            let totalBytes = 0
            let allImageUrls: string[] = []
            const { data: allCars } = await supabase.from('imported_cars').select('image_url, images')

            if (allCars) {
                // Recopilar todas las URLs de imágenes (tanto image_url como images array)
                allCars.forEach(car => {
                    if (car.image_url) allImageUrls.push(car.image_url)
                    if (car.images && Array.isArray(car.images)) {
                        allImageUrls.push(...car.images)
                    }
                })

                // Limit concurrency to avoid browser limits
                const chunks = [];
                const chunkSize = 5;

                for (let i = 0; i < allImageUrls.length; i += chunkSize) {
                    chunks.push(allImageUrls.slice(i, i + chunkSize));
                }

                for (const chunk of chunks) {
                    const promises = chunk.map(async (url) => {
                        try {
                            const res = await fetch(url, { method: 'HEAD' })
                            const size = res.headers.get('content-length')
                            return size ? parseInt(size) : 0
                        } catch {
                            return 0
                        }
                    })
                    const sizes = await Promise.all(promises)
                    totalBytes += sizes.reduce((a, b) => a + b, 0)
                }
            }

            const mb = totalBytes / (1024 * 1024)
            setRealStorageMB(mb)
            toast.success(`Almacenamiento real calculado: ${mb.toFixed(2)} MB (${allImageUrls.length} imágenes)`)
        } catch (error) {
            console.error(error)
            toast.error("Error calculando almacenamiento real")
        } finally {
            setCalculatingStorage(false)
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

            // Si el admin cambió su propio rol, recargar la página
            const { data: { user: currentUser } } = await supabase.auth.getUser()
            if (currentUser?.id === userId) {
                toast.info("Recargando página para aplicar cambios...")
                setTimeout(() => window.location.reload(), 1500)
            }

        } catch (error) {
            toast.error("Error al actualizar el rol")
        }
    }

    const handleDeleteData = async (userId: string) => {
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
        handleRoleChange(userId, newRole)
    }

    // --- Security Functions ---

    const toggleRegistrations = async () => {
        const newValue = !registrationsEnabled
        setRegistrationsEnabled(newValue)

        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: 'registrations_enabled', value: newValue })

            if (error) throw error

            toast.success(`Registros ${newValue ? 'habilitados' : 'deshabilitados'}`)

            supabase.from('activity_logs').insert({
                action: 'SETTINGS_CHANGE',
                details: `Registros ${newValue ? 'habilitados' : 'deshabilitados'}`
            })
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar configuración")
            // Revertir cambio visual si falla
            setRegistrationsEnabled(!newValue)
        }
    }

    const toggleDonations = async () => {
        const newValue = !donationsEnabled
        setDonationsEnabled(newValue)

        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: 'donations_enabled', value: newValue })

            if (error) throw error
            toast.success(`Donaciones ${newValue ? 'visibles' : 'ocultas'}`)
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar configuración")
            setDonationsEnabled(!newValue)
        }
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

    // --- Storage & DB Calculations ---
    const totalCars = Object.values(carsCount).reduce((a, b) => a + b, 0)

    // 1. Almacenamiento (Archivos/Fotos) - Límite 1GB
    const STORAGE_LIMIT_MB = 1000
    const EST_MB_PER_CAR_IMAGES = 0.5 // 500KB images per car
    // Use real storage if calculated, otherwise estimate
    const storageUsageMB = realStorageMB !== null ? realStorageMB : (totalCars * EST_MB_PER_CAR_IMAGES)
    const storagePercentage = (storageUsageMB / STORAGE_LIMIT_MB) * 100

    // 2. Base de Datos (Texto) - Límite 500MB
    const DB_LIMIT_MB = 500
    const EST_BYTES_PER_USER = 2048 // 2KB per user profile
    const EST_BYTES_PER_CAR_DATA = 4096 // 4KB per car data (text fields)
    const EST_BYTES_PER_LOG = 512 // 0.5KB per log entry

    const dbUsageBytes = (users.length * EST_BYTES_PER_USER) + (totalCars * EST_BYTES_PER_CAR_DATA) + (logs.length * EST_BYTES_PER_LOG * 10)
    const dbUsageMB = dbSizeMB > 0 ? dbSizeMB : (dbUsageBytes / (1024 * 1024))
    const dbPercentage = (dbUsageMB / DB_LIMIT_MB) * 100


    const calculateUserStorage = (userId: string) => {
        const count = carsCount[userId] || 0
        return (count * EST_MB_PER_CAR_IMAGES).toFixed(2)
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6 animate-in">
            {/* Export/Import Tools */}
            <div className="flex justify-end">
                <ExportImportTools />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Usuarios</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{usersCountReal > 0 ? usersCountReal : users.length}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Almacenamiento</CardTitle>
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {storageUsageMB.toFixed(1)} MB
                            {realStorageMB === null && <span className="text-xs text-muted-foreground ml-1">(Est.)</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">de {STORAGE_LIMIT_MB} MB (Fotos)</p>
                        <div className="h-1.5 w-full bg-secondary mt-2 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${storagePercentage > 90 ? 'bg-destructive' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Base de Datos</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dbUsageMB.toFixed(2)} MB</div>
                        <p className="text-xs text-muted-foreground">de {DB_LIMIT_MB} MB (Texto)</p>
                        <div className="h-1.5 w-full bg-secondary mt-2 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${dbPercentage > 90 ? 'bg-destructive' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(dbPercentage, 100)}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Seguridad</CardTitle>
                        <Lock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${registrationsEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold text-sm">{registrationsEnabled ? 'Reg. Abierto' : 'Reg. Cerrado'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{blockedEmails.length} bloqueados</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="users" className="space-y-4">
                <TabsList className="flex flex-wrap h-auto w-full justify-start gap-2 bg-muted/50 p-1">
                    <TabsTrigger value="users" className="flex-1 min-w-[120px]">Gestión Usuarios</TabsTrigger>
                    <TabsTrigger value="storage" className="flex-1 min-w-[120px]">Almacenamiento & DB</TabsTrigger>
                    <TabsTrigger value="security" className="flex-1 min-w-[120px]">Seguridad</TabsTrigger>
                    <TabsTrigger value="logs" className="flex-1 min-w-[120px]">Logs Sistema</TabsTrigger>
                </TabsList>

                {/* --- USERS TAB --- */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usuarios Registrados</CardTitle>
                            <CardDescription>Gestiona roles y permisos.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
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
                                                <TableCell className="whitespace-nowrap">
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
                                                <TableCell className="whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</TableCell>
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
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- STORAGE TAB --- */}
                <TabsContent value="storage">
                    <div className="grid gap-6 md:grid-cols-2 mb-6">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2">
                                        <HardDrive className="w-5 h-5" /> Almacenamiento (Archivos)
                                    </CardTitle>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={calculateRealStorage}
                                        disabled={calculatingStorage}
                                    >
                                        {calculatingStorage ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                        {calculatingStorage ? "Calculando..." : "Calcular Real"}
                                    </Button>
                                </div>
                                <CardDescription>Espacio usado por imágenes y documentos.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold mb-2">
                                    {storageUsageMB.toFixed(1)} MB
                                    {realStorageMB !== null && <span className="text-sm font-normal text-green-600 ml-2">(Real)</span>}
                                </div>
                                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                                    <span>Usado</span>
                                    <span>Límite: {STORAGE_LIMIT_MB} MB</span>
                                </div>
                                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${storagePercentage > 90 ? 'bg-destructive' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-4">
                                    {realStorageMB !== null
                                        ? "Dato calculado escaneando el tamaño real de las imágenes."
                                        : `*Estimación basada en ${EST_MB_PER_CAR_IMAGES}MB por coche importado.`}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Database className="w-5 h-5" /> Base de Datos (Texto)
                                </CardTitle>
                                <CardDescription>Espacio usado por registros de texto.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold mb-2">{dbUsageMB.toFixed(2)} MB</div>
                                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                                    <span>Usado</span>
                                    <span>Límite: {DB_LIMIT_MB} MB</span>
                                </div>
                                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${dbPercentage > 90 ? 'bg-destructive' : 'bg-green-500'}`}
                                        style={{ width: `${Math.min(dbPercentage, 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-4">
                                    *Estimación basada en el volumen de registros de texto.
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión por Usuario</CardTitle>
                            <CardDescription>Visualiza y libera espacio ocupado por los usuarios.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Usuario</TableHead>
                                            <TableHead>Coches</TableHead>
                                            <TableHead>Almacenamiento (Est.)</TableHead>
                                            <TableHead>Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell className="whitespace-nowrap">{user.email}</TableCell>
                                                <TableCell>{carsCount[user.id] || 0}</TableCell>
                                                <TableCell className="whitespace-nowrap">{calculateUserStorage(user.id)} MB</TableCell>
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
                            </div>
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
                            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1 flex-1">
                                    <h4 className="font-medium">Permitir Nuevos Registros</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Si se desactiva, nadie nuevo podrá crear una cuenta.
                                    </p>
                                </div>
                                <div
                                    onClick={toggleRegistrations}
                                    className={`w-14 h-7 rounded-full p-1 cursor-pointer transition-colors flex-shrink-0 ${registrationsEnabled ? 'bg-primary' : 'bg-secondary'}`}
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
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        value={newBlockedEmail}
                                        onChange={(e) => setNewBlockedEmail(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border"
                                    />
                                    <Button onClick={addBlockedEmail} className="w-full sm:w-auto">
                                        <Ban className="w-4 h-4 mr-2" /> Bloquear
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {blockedEmails.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No hay emails bloqueados.</p>
                                    ) : (
                                        blockedEmails.map((email) => (
                                            <div key={email} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
                                                <span className="font-medium text-sm truncate flex-1 mr-2">{email}</span>
                                                <Button variant="ghost" size="sm" onClick={() => removeBlockedEmail(email)}>
                                                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Configuración General</CardTitle>
                                <CardDescription>Opciones globales de la aplicación.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-secondary/30 rounded-lg border">
                                    <div className="space-y-1 flex-1">
                                        <h4 className="font-semibold">Pestaña de Donaciones</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Muestra u oculta la pestaña de "Donaciones" en el menú de navegación para todos los usuarios.
                                        </p>
                                    </div>
                                    <div
                                        onClick={toggleDonations}
                                        className={`w-14 h-7 rounded-full p-1 cursor-pointer transition-colors flex-shrink-0 ${donationsEnabled ? 'bg-green-500 dark:bg-green-600' : 'bg-secondary'}`}
                                    >
                                        <div className={`bg-white dark:bg-slate-200 w-5 h-5 rounded-full shadow-md transform transition-transform ${donationsEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                                    </div>
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
                            <div className="overflow-x-auto">
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
                                        {logs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                    No hay logs de actividad registrados
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            logs.map((log) => (
                                                <TableRow key={log.id}>
                                                    <TableCell className="font-medium whitespace-nowrap">{log.profiles?.email || 'Desconocido'}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="whitespace-nowrap">{log.action}</Badge>
                                                    </TableCell>
                                                    <TableCell className="min-w-[200px]">{log.details}</TableCell>
                                                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div >
    )
}
