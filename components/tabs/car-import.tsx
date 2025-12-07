"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Filter, Trash2, Edit, ChevronDown, ChevronUp, Image as ImageIcon, Loader2 } from "lucide-react"
import { AddCarModal } from "@/components/modals/add-car-modal"
import { Button } from "@/components/ui/button"
import { CarCard } from "@/components/cards/car-card"
import { ShareCarModal } from "@/components/modals/share-car-modal"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

interface Car {
  id: string
  user_id?: string
  shared_with?: string[]
  brand: string
  model: string
  year: number
  price: number
  currency: string
  mileage: number
  cv: number
  photo?: string
  image_url?: string
  images?: string[]
  tags: string[]
  origin?: string
  totalExpenses?: number
  url?: string
  steering?: string
}

interface CarImportProps {
  role?: string | null
}

export function CarImport({ role }: CarImportProps) {
  const { user } = useAuth()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCar, setEditingCar] = useState<Car | null>(null)
  // Share State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [carToShare, setCarToShare] = useState<any>(null)

  const handleShareClick = (car: any) => {
    setCarToShare(car)
    setIsShareModalOpen(true)
  }
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState("date")

  // Cargar datos desde Supabase
  useEffect(() => {
    if (user) fetchCars()
  }, [user])

  const fetchCars = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('imported_cars')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedCars: Car[] = data.map((car: any) => ({
        id: car.id,
        user_id: car.user_id, // IMPORTANTE: Para saber quién es el dueño
        shared_with: car.shared_with || [], // IMPORTANTE: Para saber con quién está compartido
        brand: car.brand,
        model: car.model,
        year: car.year,
        price: Number(car.price),
        currency: "EUR",
        mileage: Number(car.mileage || 0),
        cv: Number(car.cv || 0),
        photo: car.image_url,
        image_url: car.image_url, // Para compatibilidad con CarCard
        images: car.image_url ? [car.image_url] : [], // Para compatibilidad
        tags: [],
        origin: "Importado",
        totalExpenses: Number(car.total_cost) - Number(car.price),
        url: car.url || "",
        steering: car.steering
      }))

      setCars(formattedCars)
    } catch (error) {
      console.error("Error fetching imported cars:", error)
      toast.error("Error al cargar coches importados")
    } finally {
      setLoading(false)
    }
  }

  const addCar = async (newCar: any) => {
    if (!user) return

    try {
      // Datos completos del coche
      const baseCarData = {
        // Básicos
        brand: newCar.brand,
        model: newCar.model,
        year: newCar.year,
        month: newCar.month,
        vehicle_type: newCar.vehicleType,

        // Ubicación y origen
        url: newCar.url || null,
        location: newCar.location || null,
        origin: newCar.origin || null,
        platform: newCar.platform || null,

        // Apariencia
        color: newCar.color || null,
        doors: newCar.doors || null,

        // Especificaciones técnicas
        price: Number(newCar.price),
        mileage: newCar.mileage,
        cv: newCar.cv,
        motor_type: newCar.motorType || null,
        displacement: newCar.displacement || null,
        co2: newCar.co2 || null,
        fuel_type: newCar.fuelType || null,
        transmission: newCar.transmission || null,
        traction: newCar.traction || null,
        steering: newCar.steering,

        // ITV/Inspección
        inspection_name: newCar.inspectionName || null,
        inspection_status: newCar.inspectionStatus || null,
        inspection_expiry: newCar.inspectionExpiry || null,

        // Costes
        transfer_cost: newCar.transferCost ? Number(newCar.transferCost) : null,
        total_cost: Number(newCar.finalPrice) || (Number(newCar.price) + Number(newCar.totalExpenses || 0)),
        expenses: newCar.expenses || null,

        // Multimedia y notas
        image_url: newCar.images && newCar.images.length > 0 ? newCar.images[0] : null,
        defects: newCar.defects || null,
        notes: newCar.notes || null,
        tags: newCar.tags || [],
        equipment: newCar.equipment || []
      }

      if (editingCar) {
        // Actualizar (SIN user_id, no se puede cambiar el propietario)
        const { error } = await supabase
          .from('imported_cars')
          .update(baseCarData)
          .eq('id', editingCar.id)

        if (error) throw error
        toast.success("Coche actualizado")

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'UPDATE_CAR',
          details: `Actualizado coche: ${newCar.brand} ${newCar.model}`
        })
      } else {
        // Crear (CON user_id)
        const { error } = await supabase
          .from('imported_cars')
          .insert({
            ...baseCarData,
            user_id: user.id // Solo al crear
          })

        if (error) throw error
        toast.success("Coche añadido")

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'ADD_CAR',
          details: `Añadido coche: ${newCar.brand} ${newCar.model} (${newCar.year})`
        })
      }

      setIsModalOpen(false)
      setEditingCar(null)
      fetchCars()
    } catch (error: any) {
      toast.error("Error al guardar coche: " + error.message)
    }
  }

  const deleteCar = async (id: string) => {
    // Eliminado confirmación nativa a petición del usuario
    try {
      const carToDelete = cars.find(c => c.id === id)
      const { error } = await supabase
        .from('imported_cars')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success("Coche eliminado correctamente")

      if (user && carToDelete) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'DELETE_CAR',
          details: `Eliminado coche: ${carToDelete.brand} ${carToDelete.model}`
        })
      }

      fetchCars()
    } catch (error) {
      toast.error("Error al eliminar coche")
    }
  }

  const handleEdit = (car: Car) => {
    setEditingCar(car)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCar(null)
  }

  // Filtrar y buscar
  const filteredCars = cars.filter((car) => {
    return (
      car.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.model.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  // Ordenar
  const sortedCars = [...filteredCars].sort((a, b) => {
    switch (sortBy) {
      case "price":
        return a.price - b.price
      case "mileage":
        return a.mileage - b.mileage
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Importación de Coches</h2>
          <p className="text-muted-foreground">Gestiona y calcula costes de importación</p>
        </div>
        {role !== 'usuario' && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Añadir Coche
          </Button>
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
            <option value="date">Más reciente</option>
            <option value="price">Precio menor</option>
            <option value="mileage">Menor km</option>
          </select>
        </div>
      </div>

      {/* Lista de Coches */}
      {sortedCars.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No hay coches registrados aún</p>
          <button onClick={() => setIsModalOpen(true)} className="text-primary hover:underline font-medium">
            Añade tu primer coche
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedCars.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              onDelete={() => deleteCar(car.id)}
              onEdit={() => handleEdit(car)}
              onShare={() => handleShareClick(car)}
              currentUserId={user?.id}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <AddCarModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingCar(null)
        }}
        onSubmit={addCar}
        initialData={editingCar}
      />

      {carToShare && (
        <ShareCarModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false)
            setCarToShare(null)
          }}
          carId={carToShare.id}
          currentSharedWith={carToShare.shared_with || []}
          onShare={fetchCars}
        />
      )}
    </div>
  )
}
