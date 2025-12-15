"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2 } from "lucide-react"
import { AddSpainCarModal } from "@/components/modals/add-spain-car-modal"
import { ShareSpainCarModal } from "@/components/modals/share-spain-car-modal"
import { SpainCarCard } from "@/components/cards/spain-car-card"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

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
}

interface CarsSpainProps {
    role?: string | null
}

export function CarsSpain({ role }: CarsSpainProps) {
    const { user } = useAuth()
    const [cars, setCars] = useState<SpainCar[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [shareModalOpen, setShareModalOpen] = useState(false)
    const [sharingCar, setSharingCar] = useState<SpainCar | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [sortBy, setSortBy] = useState("price")
    const [editingCar, setEditingCar] = useState<SpainCar | null>(null)
    const [sharedCarIds, setSharedCarIds] = useState<Set<string>>(new Set())

    // Cargar datos desde Supabase
    useEffect(() => {
        if (user) fetchCars()
    }, [user])

    const fetchCars = async () => {
        try {
            setLoading(true)
            // Obtener coches propios
            const { data, error } = await supabase
                .from('spain_cars')
                .select('*')
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false })

            if (error) throw error

            // Obtener coches compartidos conmigo
            const { data: sharedData, error: sharedError } = await supabase
                .from('spain_car_shares')
                .select(`
                    car_id,
                    spain_cars (*)
                `)
                .eq('shared_with_id', user?.id)

            if (sharedError) throw sharedError

            // Combinar coches propios y compartidos
            const sharedCars = (sharedData || []).map((share: any) => share.spain_cars)
            const allCars = [...(data || []), ...sharedCars]

            // Obtener IDs de coches compartidos (propios que he compartido)
            const { data: myShares } = await supabase
                .from('spain_car_shares')
                .select('car_id')
                .eq('owner_id', user?.id)

            const sharedIds = new Set((myShares || []).map((s: any) => s.car_id))
            setSharedCarIds(sharedIds)

            const formattedCars: SpainCar[] = allCars.map((car: any) => ({
                id: car.id,
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
                images: car.images || [],
                imageUrl: car.image_url,
                user_id: car.user_id // Importante para saber si es propietario
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
        if (!user) return

        try {
            const carData = {
                user_id: user.id,
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
                const { error } = await supabase
                    .from('spain_cars')
                    .insert(carData)

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
                    <h2 className="text-3xl font-bold mb-2">Coches España</h2>
                    <p className="text-muted-foreground">Coches de referencia para comparar ({cars.length})</p>
                </div>
                {role !== 'usuario' && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Añadir Referencia
                    </button>
                )}
            </div>

            {/* Búsqueda y Filtros */}
            <div className="flex flex-col gap-4 bg-card border border-border rounded-lg p-4">
                <input
                    type="text"
                    placeholder="Buscar por marca o modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                />

                <div className="flex gap-2">
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                        <option value="price">Precio menor</option>
                        <option value="mileage">Menor km</option>
                        <option value="year">Más reciente</option>
                    </select>
                </div>
            </div>

            {/* Lista de Coches */}
            {sortedCars.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                    <p className="text-muted-foreground mb-4">No hay coches de referencia en España</p>
                    {role !== 'usuario' && (
                        <button onClick={() => setIsModalOpen(true)} className="text-primary hover:underline font-medium">
                            Añade tu primer coche de referencia
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedCars.map((car: any) => (
                        <SpainCarCard
                            key={car.id}
                            car={car}
                            onDelete={() => deleteCar(car.id)}
                            onEdit={() => handleEdit(car)}
                            onShare={() => handleShare(car)}
                            isShared={sharedCarIds.has(car.id)}
                            isOwner={car.user_id === user?.id}
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
                    carName={`${sharingCar.brand} ${sharingCar.model}`}
                />
            )}
        </div>
    )
}
