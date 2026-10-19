"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Loader2, Shield, Users, Trash2, Database, Lock, Ban, Info, HardDrive, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ExportImportTools } from "@/components/export-import-tools"
import { StorageCleanup } from "@/components/storage-cleanup"

interface Profile {
    id: string
    email: string
    role: string
    created_at: string
    last_sign_in_at?: string
    can_manage_expenses?: boolean
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
    const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false)
    const [blockedEmails, setBlockedEmails] = useState<string[]>([])
    const [newBlockedEmail, setNewBlockedEmail] = useState("")

    // Bandwidth State (Supabase doesn't provide API, so this is informational)
    const BANDWIDTH_LIMIT_GB = 5 // Free tier limit
    const [estimatedBandwidthGB, setEstimatedBandwidthGB] = useState<number>(0)

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

        const { data: donationsData, error: donationsError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'donations_enabled')
            .single()

        if (!donationsError && donationsData) {
            setDonationsEnabled(donationsData.value)
        }

        // Load subscriptions setting
        const { data: subscriptionsData, error: subscriptionsError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'subscriptions_enabled')
            .single()

        if (!subscriptionsError && subscriptionsData) {
            setSubscriptionsEnabled(subscriptionsData.value)
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

    const toggleManageExpenses = async (userId: string, currentValue: boolean | undefined) => {
        try {
            const newValue = !currentValue;
            const { error } = await supabase
                .from('profiles')
                .update({ can_manage_expenses: newValue })
                .eq('id', userId)

            if (error) throw error

            setUsers(users.map(u => u.id === userId ? { ...u, can_manage_expenses: newValue } : u))
            toast.success(`Permisos de gastos ${newValue ? 'concedidos' : 'revocados'}`)
            
            await supabase.from('activity_logs').insert({
                action: 'PERMISSION_CHANGE',
                details: `Permisos de gastos ${newValue ? 'concedidos' : 'revocados'} al usuario ${userId}`
            })
        } catch (error) {
            toast.error("Error al actualizar permisos")
        }
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
            toast.success(`Donaciones ${newValue ? 'activadas' : 'desactivadas'}`)
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar configuración")
            setDonationsEnabled(!newValue)
        }
    }

    const toggleSubscriptions = async () => {
        const newValue = !subscriptionsEnabled
        setSubscriptionsEnabled(newValue)

        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: 'subscriptions_enabled', value: newValue })

            if (error) throw error
            toast.success(`Suscripciones ${newValue ? 'activadas' : 'desactivadas'}`)
        } catch (error) {
            toast.error('Error al actualizar configuración')
            setSubscriptionsEnabled(!newValue)
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
        return (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
            </div>
        )
    }

    const bandwidthPercentage = (estimatedBandwidthGB / BANDWIDTH_LIMIT_GB) * 100

    return (
        <div className="space-y-6 animate-in">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight mb-1">Administración</h2>
                    <p className="text-muted-foreground">Usuarios, almacenamiento, seguridad y actividad de la plataforma.</p>
                </div>
                {/* Export/Import Tools */}
                <ExportImportTools />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Usuarios" icon={Users} value={String(usersCountReal > 0 ? usersCountReal : users.length)} />
                <StatCard
                    label="Almacenamiento"
                    icon={HardDrive}
                    value={`${storageUsageMB.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`}
                    sub={`de ${STORAGE_LIMIT_MB.toLocaleString('es-ES')} MB (imágenes)`}
                    percentage={storagePercentage}
                />
                <StatCard
                    label="Base de datos"
                    icon={Database}
                    value={`${dbUsageMB.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`}
                    sub={`de ${DB_LIMIT_MB} MB (texto)`}
                    percentage={dbPercentage}
                />
                <StatCard
                    label="Ancho de banda"
                    icon={RefreshCw}
                    value={`${estimatedBandwidthGB.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`}
                    sub={`de ${BANDWIDTH_LIMIT_GB} GB/mes · estimado`}
                    percentage={bandwidthPercentage}
                />
                <div className="rounded-xl border bg-card p-5 shadow-xs">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Seguridad</p>
                        <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${registrationsEnabled ? 'bg-success' : 'bg-destructive'}`} />
                        <span className="text-sm font-semibold">{registrationsEnabled ? 'Registro abierto' : 'Registro cerrado'}</span>
                    </div>
                    <p className="tabular mt-1 text-xs text-muted-foreground">{blockedEmails.length} {blockedEmails.length === 1 ? 'email bloqueado' : 'emails bloqueados'}</p>
                </div>
            </div>

            <Tabs defaultValue="users" className="space-y-4">
                <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
                    <TabsTrigger value="users">Usuarios</TabsTrigger>
                    <TabsTrigger value="storage">Almacenamiento y BD</TabsTrigger>
                    <TabsTrigger value="security">Seguridad</TabsTrigger>
                    <TabsTrigger value="logs">Actividad</TabsTrigger>
                </TabsList>

                {/* --- USERS TAB --- */}
                <TabsContent value="users">
                    <Panel title="Usuarios registrados" description="Gestiona roles y permisos.">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="pl-5">Email</TableHead>
                                        <TableHead>Rol</TableHead>
                                        <TableHead>Gastos globales</TableHead>
                                        <TableHead>Registro</TableHead>
                                        <TableHead>Última conexión</TableHead>
                                        <TableHead className="pr-5 text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id} className={user.role === 'banned' ? 'bg-destructive/5' : ''}>
                                            <TableCell className="whitespace-nowrap pl-5 font-medium">
                                                {user.email}
                                                {user.role === 'banned' && (
                                                    <Badge variant="outline" className="ml-2 border-transparent bg-destructive/10 text-destructive">Bloqueado</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    defaultValue={user.role}
                                                    onValueChange={(val) => handleRoleChange(user.id, val)}
                                                    disabled={user.role === 'banned'}
                                                >
                                                    <SelectTrigger size="sm" className="w-[150px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="usuario">Usuario</SelectItem>
                                                        <SelectItem value="gestor">Gestor</SelectItem>
                                                        <SelectItem value="importador">Importador</SelectItem>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                        {user.role === 'super_admin' && <SelectItem value="super_admin">Super Admin (God Level)</SelectItem>}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={!!user.can_manage_expenses}
                                                    onCheckedChange={() => toggleManageExpenses(user.id, user.can_manage_expenses)}
                                                    aria-label="Permitir gestionar gastos globales"
                                                />
                                            </TableCell>
                                            <TableCell className="tabular whitespace-nowrap text-muted-foreground">{new Date(user.created_at).toLocaleDateString('es-ES')}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {user.last_sign_in_at ? (
                                                    <div className="flex flex-col">
                                                        <span className="tabular text-sm">{new Date(user.last_sign_in_at).toLocaleDateString('es-ES')}</span>
                                                        <span className="tabular text-xs text-muted-foreground">{new Date(user.last_sign_in_at).toLocaleTimeString('es-ES')}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Nunca</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="pr-5 text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleBanUser(user.id, user.role)}
                                                    className={user.role === 'banned' ? '' : 'text-destructive hover:bg-destructive/10 hover:text-destructive'}
                                                >
                                                    {user.role === 'banned' ? <Shield className="h-4 w-4 text-success" /> : <Ban className="h-4 w-4" />}
                                                    {user.role === 'banned' ? "Desbloquear" : "Bloquear"}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Panel>
                </TabsContent>

                {/* --- STORAGE TAB --- */}
                <TabsContent value="storage" className="space-y-6">
                    <StorageCleanup />
                    <div className="grid gap-6 md:grid-cols-2">
                        <section className="rounded-xl border bg-card p-5 shadow-xs">
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                        <HardDrive className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold">Almacenamiento (archivos)</h3>
                                        <p className="text-xs text-muted-foreground">Espacio usado por imágenes y documentos.</p>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={calculateRealStorage}
                                    disabled={calculatingStorage}
                                >
                                    {calculatingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    {calculatingStorage ? "Calculando…" : "Calcular real"}
                                </Button>
                            </div>
                            <div className="mb-3 flex items-baseline gap-2">
                                <span className="tabular text-2xl font-semibold tracking-tight">
                                    {storageUsageMB.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB
                                </span>
                                {realStorageMB !== null && (
                                    <Badge variant="outline" className="border-transparent bg-success/10 text-success">Real</Badge>
                                )}
                            </div>
                            <UsageBar percentage={storagePercentage} />
                            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                <span>Usado</span>
                                <span className="tabular">Límite: {STORAGE_LIMIT_MB.toLocaleString('es-ES')} MB</span>
                            </div>
                            <p className="mt-4 text-xs text-muted-foreground">
                                {realStorageMB !== null
                                    ? "Dato calculado escaneando el tamaño real de las imágenes."
                                    : `*Estimación basada en ${EST_MB_PER_CAR_IMAGES.toLocaleString('es-ES')} MB por coche importado.`}
                            </p>
                        </section>

                        <section className="rounded-xl border bg-card p-5 shadow-xs">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                    <Database className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold">Base de datos (texto)</h3>
                                    <p className="text-xs text-muted-foreground">Espacio usado por registros de texto.</p>
                                </div>
                            </div>
                            <div className="mb-3">
                                <span className="tabular text-2xl font-semibold tracking-tight">
                                    {dbUsageMB.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB
                                </span>
                            </div>
                            <UsageBar percentage={dbPercentage} />
                            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                <span>Usado</span>
                                <span className="tabular">Límite: {DB_LIMIT_MB} MB</span>
                            </div>
                            <p className="mt-4 text-xs text-muted-foreground">
                                *Estimación basada en el volumen de registros de texto.
                            </p>
                        </section>
                    </div>

                    <Panel title="Gestión por usuario" description="Visualiza y libera espacio ocupado por los usuarios.">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="pl-5">Usuario</TableHead>
                                        <TableHead className="text-right">Coches</TableHead>
                                        <TableHead className="text-right">Almacenamiento (est.)</TableHead>
                                        <TableHead className="pr-5 text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="whitespace-nowrap pl-5 font-medium">{user.email}</TableCell>
                                            <TableCell className="tabular text-right">{carsCount[user.id] || 0}</TableCell>
                                            <TableCell className="tabular whitespace-nowrap text-right">{calculateUserStorage(user.id)} MB</TableCell>
                                            <TableCell className="pr-5 text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleDeleteData(user.id)}
                                                    disabled={!carsCount[user.id]}
                                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Eliminar datos
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Panel>
                </TabsContent>

                {/* --- SECURITY TAB --- */}
                <TabsContent value="security">
                    <div className="grid gap-6">
                        <Panel title="Control de acceso" description="Gestiona quién puede registrarse en la plataforma.">
                            <div className="p-5">
                                <SettingRow
                                    id="setting-registrations"
                                    title="Permitir nuevos registros"
                                    description="Si se desactiva, nadie nuevo podrá crear una cuenta."
                                    checked={registrationsEnabled}
                                    onToggle={toggleRegistrations}
                                />
                            </div>
                        </Panel>

                        <Panel title="Lista negra de emails" description="Bloquea direcciones de correo específicas para impedir su acceso o registro.">
                            <div className="space-y-4 p-5">
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        value={newBlockedEmail}
                                        onChange={(e) => setNewBlockedEmail(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Button onClick={addBlockedEmail} className="w-full sm:w-auto">
                                        <Ban className="h-4 w-4" /> Bloquear
                                    </Button>
                                </div>

                                {blockedEmails.length === 0 ? (
                                    <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                                        No hay emails bloqueados.
                                    </div>
                                ) : (
                                    <div className="divide-y rounded-lg border">
                                        {blockedEmails.map((email) => (
                                            <div key={email} className="flex items-center justify-between gap-2 px-3 py-2">
                                                <span className="flex-1 truncate text-sm font-medium">{email}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => removeBlockedEmail(email)}
                                                    aria-label={`Desbloquear ${email}`}
                                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Panel>

                        <Panel title="Configuración general" description="Opciones globales de la aplicación.">
                            <div className="divide-y">
                                <div className="p-5">
                                    <SettingRow
                                        id="setting-donations"
                                        title="Pestaña de donaciones"
                                        description={'Muestra u oculta la pestaña de "Donaciones" en el menú de navegación para todos los usuarios.'}
                                        checked={donationsEnabled}
                                        onToggle={toggleDonations}
                                    />
                                </div>
                                <div className="p-5">
                                    <SettingRow
                                        id="setting-subscriptions"
                                        title="Suscripciones mensuales"
                                        description="Habilita o deshabilita las suscripciones mensuales en la pestaña de donaciones."
                                        checked={subscriptionsEnabled}
                                        onToggle={toggleSubscriptions}
                                    />
                                </div>
                            </div>
                        </Panel>
                    </div>
                </TabsContent>


                {/* --- LOGS TAB --- */}
                <TabsContent value="logs">
                    <Panel title="Registro de actividad" description="Auditoría de acciones importantes.">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="pl-5">Usuario</TableHead>
                                        <TableHead>Acción</TableHead>
                                        <TableHead>Detalles</TableHead>
                                        <TableHead className="pr-5">Fecha</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                                                No hay actividad registrada
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="whitespace-nowrap pl-5 font-medium">{log.profiles?.email || 'Desconocido'}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="whitespace-nowrap font-mono text-[11px]">{log.action}</Badge>
                                                </TableCell>
                                                <TableCell className="min-w-[200px] whitespace-normal text-muted-foreground">{log.details}</TableCell>
                                                <TableCell className="tabular whitespace-nowrap pr-5 text-sm text-muted-foreground">
                                                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Panel>
                </TabsContent>
            </Tabs>
        </div>
    )
}

// --- Presentational helpers ---

function UsageBar({ percentage }: { percentage: number }) {
    const tone = percentage > 90 ? 'bg-destructive' : percentage > 75 ? 'bg-warning' : 'bg-primary'
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
                className={`h-full rounded-full transition-all duration-500 ${tone}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
            />
        </div>
    )
}

function StatCard({ label, icon: Icon, value, sub, percentage }: {
    label: string
    icon: React.ComponentType<{ className?: string }>
    value: string
    sub?: string
    percentage?: number
}) {
    return (
        <div className="rounded-xl border bg-card p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
            {sub && <p className="tabular mt-0.5 text-xs text-muted-foreground">{sub}</p>}
            {percentage !== undefined && (
                <div className="mt-3">
                    <UsageBar percentage={percentage} />
                </div>
            )}
        </div>
    )
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="border-b px-5 py-4">
                <h3 className="text-sm font-semibold">{title}</h3>
                {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            {children}
        </section>
    )
}

function SettingRow({ id, title, description, checked, onToggle }: {
    id: string
    title: string
    description: string
    checked: boolean
    onToggle: () => void
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-0.5">
                <Label htmlFor={id} className="text-sm font-medium">{title}</Label>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={() => onToggle()} />
        </div>
    )
}
