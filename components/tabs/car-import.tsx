"use client"

import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { AddCarModal } from "@/components/modals/add-car-modal"
import { CarCard } from "@/components/cards/car-card"

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
}

export function CarImport() {
  const [cars, setCars] = useState<Car[]>([])
  const [editingCar, setEditingCar] = useState<Car | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState("date")

  // Cargar datos del localStorage
  useEffect(() => {
    const saved = localStorage.getItem("importedCars")
    if (saved) {
      setCars(JSON.parse(saved))
    }
  }, [])

  // Guardar datos
  const saveCars = (updatedCars: Car[]) => {
    setCars(updatedCars)
    localStorage.setItem("importedCars", JSON.stringify(updatedCars))
  }

  const addCar = (newCar: any) => {
    if (editingCar) {
      const updatedCars = cars.map((c) => (c.id === editingCar.id ? { ...newCar, id: editingCar.id } : c))
      saveCars(updatedCars)
      setEditingCar(null)
    } else {
      const car: Car = {
        id: Date.now().toString(),
        ...newCar,
        tags: newCar.tags || [],
      }
      saveCars([...cars, car])
    }
    setIsModalOpen(false)
  }

  const deleteCar = (id: string) => {
    saveCars(cars.filter((c) => c.id !== id))
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
    const matchesSearch =
      car.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.model.toLowerCase().includes(searchTerm.toLowerCase())

    return matchesSearch
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
