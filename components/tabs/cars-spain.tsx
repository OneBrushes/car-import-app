"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2, Search, Car } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AddSpainCarModal } from "@/components/modals/add-spain-car-modal"
import { ShareSpainCarModal } from "@/components/modals/share-spain-car-modal"
import { SpainCarCard } from "@/components/cards/spain-car-card"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import { OPEN_CAR_EVENT, type OpenCarDetail } from "@/components/command-palette"

interface SpainCar {
    id: string
    brand: string
    model: string
    year: number
    price: number
    mileage: number
    cv: number
    url?: string
    location?: string
    color?: string
    fuelType?: string
    transmission?: string
    tags: string[]
    notes?: string
    equipmentLevel?: string
    images?: string[]
    imageUrl?: string
    created_at?: string
}

interface CarsSpainProps {
    role?: string | null
}

export function CarsSpain({ role }: CarsSpainProps) {
    const { user, isGodMode } = useAuth()
    const [cars, setCars] = useState<SpainCar[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [shareModalOpen, setShareModalOpen] = useState(false)
    const [sharingCar, setSharingCar] = useState<SpainCar | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [sortBy, setSortBy] = useState("date")
    const [editingCar, setEditingCar] = useState<SpainCar | null>(null)

    // Cargar datos desde Supabase
    useEffect(() => {
        if (user) fetchCars()
    }, [user])

    // Abrir un coche concreto desde la búsqueda global (Ctrl+K)
    useEffect(() => {
        const onOpenCar = (event: Event) => {
            const { table, id } = (event as CustomEvent<OpenCarDetail>).detail
            if (table !== "spain_cars") return
            const car: any = cars.find(c => c.id === id)
            // Solo el propietario (o el Modo Dios) puede editar; el resto solo ve la pestaña
            if (car && (car.user_id === user?.id || isGodMode)) handleEdit(car)
        }
        window.addEventListener(OPEN_CAR_EVENT, onOpenCar)
        return () => window.removeEventListener(OPEN_CAR_EVENT, onOpenCar)
    }, [cars, user, isGodMode])

    const fetchCars = async () => {
        try {
            setLoading(true)

            // Obtener todos los coches de España
            const { data, error } = await supabase
                .from('spain_cars')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error

            // Filtrar: coches propios O compartidos conmigo (bypass por God Mode)
            const filteredData = isGodMode ? (data || []) : (data || []).filter((car: any) =>
                car.user_id === user?.id ||
                (car.shared_with && car.shared_with.includes(user?.id))
            )

            const formattedCars: SpainCar[] = filteredData.map((car: any) => ({
                id: car.id,
                user_id: car.user_id,
                shared_with: car.shared_with || [],
                brand: car.brand,
                model: car.model,
                year: car.year,
                price: Number(car.price),
                mileage: Number(car.mileage || 0),
                cv: Number(car.cv || 0),
                url: car.url,
                location: car.location,
                color: car.color,
                fuelType: car.fuel_type,
                transmission: car.transmission,
                tags: car.tags || [],
                notes: car.notes,
                equipmentLevel: car.equipment_level,
                images: car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : []),
                imageUrl: car.image_url,
                created_at: car.created_at
            }))

            setCars(formattedCars)
        } catch (error) {
            console.error("Error fetching spain cars:", error)
            toast.error("Error al cargar coches de España")
        } finally {
            setLoading(false)
        }
    }

    const addCar = async (newCar: any) => {
        if (!user) {
            toast.error("Tu sesión ha caducado. Por favor, recarga la página e inténtalo de nuevo.");
            return;
        }

        try {
            const carData = {
                brand: newCar.brand,
                model: newCar.model,
                year: newCar.year,
                price: newCar.price,
                mileage: newCar.mileage,
                cv: newCar.cv,
                url: newCar.url,
                location: newCar.location,
                color: newCar.color,
                fuel_type: newCar.fuelType,
                transmission: newCar.transmission,
                notes: newCar.notes,
                equipment_level: newCar.equipmentLevel || null,
                tags: newCar.tags || [],
                images: newCar.images || [],
                image_url: newCar.images && newCar.images.length > 0 ? newCar.images[0] : null
            }

            if (editingCar) {
                // Update
                const { error } = await supabase
                    .from('spain_cars')
                    .update(carData)
                    .eq('id', editingCar.id)

                if (error) throw error
                toast.success("Coche actualizado")
            } else {
                // Insert
                // El propietario solo se fija al crear (al editar en Modo Dios no debe cambiar)
                const { error } = await supabase
                    .from('spain_cars')
                    .insert({ ...carData, user_id: user.id })

                if (error) throw error
                toast.success("Coche de referencia añadido")
            }

            setIsModalOpen(false)
            setEditingCar(null)
            fetchCars()
        } catch (error: any) {
            toast.error("Error al guardar: " + error.message)
        }
    }

    const deleteCar = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este coche?")) return

        try {
            const { error } = await supabase
                .from('spain_cars')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success("Coche eliminado")
            fetchCars()
        } catch (error) {
            toast.error("Error al eliminar")
        }
    }

    const handleEdit = (car: SpainCar) => {
        setEditingCar(car)
        setIsModalOpen(true)
    }

    const handleShare = (car: SpainCar) => {
        setSharingCar(car)
        setShareModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setEditingCar(null)
    }

    const handleCloseShareModal = () => {
        setShareModalOpen(false)
        setSharingCar(null)
        fetchCars() // Recargar para actualizar estados compartidos
    }

    const filteredCars = cars.filter((car) => {
        return (
            car.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
            car.model.toLowerCase().includes(searchTerm.toLowerCase())
        )
    })

    const sortedCars = [...filteredCars].sort((a, b) => {
        switch (sortBy) {
            case "date":
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            case "price":
                return a.price - b.price
            case "mileage":
                return a.mileage - b.mileage
            case "year":
                return b.year - a.year
            default:
                return 0
        }
    })

    if (loading) {
        return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    }

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight mb-1">Coches España</h2>
                    <p className="text-muted-foreground">
                        Coches de referencia para comparar (<span className="tabular">{cars.length}</span>)
                    </p>
                </div>
                {role !== 'usuario' && (
                    <Button onClick={() => setIsModalOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Añadir referencia
                    </Button>
                )}
            </div>

            {/* Búsqueda y Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Buscar por marca o modelo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value)}>
                    <SelectTrigger className="w-full sm:w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="date">Últimos añadidos</SelectItem>
                        <SelectItem value="price">Precio menor</SelectItem>
                        <SelectItem value="mileage">Menos km</SelectItem>
                        <SelectItem value="year">Año del coche</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Lista de Coches */}
            {sortedCars.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Car className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {searchTerm ? "Ningún coche coincide con la búsqueda" : "No hay coches de referencia en España"}
                    </p>
                    {role !== 'usuario' && !searchTerm && (
                        <Button size="sm" className="mt-4" onClick={() => setIsModalOpen(true)}>
                            <Plus className="w-4 h-4" />
                            Añade tu primer coche de referencia
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {sortedCars.map((car: any) => (
                        <SpainCarCard
                            key={car.id}
                            car={car}
                            onDelete={() => deleteCar(car.id)}
                            onEdit={() => handleEdit(car)}
                            onShare={() => handleShare(car)}
                            isShared={car.shared_with && car.shared_with.length > 0}
                            isOwner={car.user_id === user?.id}
                            isGodMode={isGodMode}
                        />
                    ))}
                </div>
            )}

            {/* Modal Añadir/Editar */}
            <AddSpainCarModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSubmit={addCar}
                initialData={editingCar}
            />

            {/* Modal Compartir */}
            {sharingCar && (
                <ShareSpainCarModal
                    isOpen={shareModalOpen}
                    onClose={handleCloseShareModal}
                    carId={sharingCar.id}
                    currentSharedWith={(sharingCar as any).shared_with || []}
                    onShare={fetchCars}
                />
            )}
        </div>
    )
}
