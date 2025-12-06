"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2 } from "lucide-react"
import { AddCarModal } from "@/components/modals/add-car-modal"
import { CarCard } from "@/components/cards/car-card"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

interface Car {
  id: string
  brand: string
  model: string
  year: number
  price: number
  currency: string
  mileage: number
  cv: number
  photo?: string
  tags: string[]
  origin?: string
  totalExpenses?: number
  url?: string
  steering?: string
}

export function CarImport() {
  const { user } = useAuth()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCar, setEditingCar] = useState<Car | null>(null)
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
        brand: car.brand,
        model: car.model,
        year: car.year,
        price: Number(car.price),
        currency: "EUR", // Por defecto, o añadir columna currency a DB
        mileage: Number(car.mileage || 0),
        cv: Number(car.cv || 0),
        photo: car.image_url,
        tags: [], // Si quieres tags, añade columna array a DB
        origin: "Importado",
        totalExpenses: Number(car.total_cost),
        url: "", // Si quieres URL, añade columna a DB
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
      const carData = {
        user_id: user.id,
        brand: newCar.brand,
        model: newCar.model,
        year: newCar.year,
        price: newCar.price,
        mileage: newCar.mileage,
        cv: newCar.cv,
        steering: newCar.steering,
        image_url: newCar.photo,
        // Calcular costes totales (simplificado por ahora)
        total_cost: newCar.price + (newCar.expenses || 0)
      }

      if (editingCar) {
        // Actualizar
        const { error } = await supabase
          .from('imported_cars')
          .update(carData)
          .eq('id', editingCar.id)

        if (error) throw error
        toast.success("Coche actualizado")
      } else {
        // Crear
        const { error } = await supabase
          .from('imported_cars')
          .insert(carData)

        if (error) throw error
        toast.success("Coche añadido")
      }

      setIsModalOpen(false)
      setEditingCar(null)
      fetchCars()
    } catch (error: any) {
      toast.error("Error al guardar coche: " + error.message)
    }
  }

  const deleteCar = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este coche?")) return

    try {
      const { error } = await supabase
        .from('imported_cars')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success("Coche eliminado")
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2">Coches Importación</h2>
          <p className="text-muted-foreground">Gestiona tus vehículos importados ({cars.length})</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Añadir Coche
        </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedCars.map((car) => (
            <CarCard key={car.id} car={car} onDelete={() => deleteCar(car.id)} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {/* Modal */}
      <AddCarModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={addCar}
        initialData={editingCar}
      />
    </div>
  )
}
