"use client"

import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { AddSpainCarModal } from "@/components/modals/add-spain-car-modal"
import { SpainCarCard } from "@/components/cards/spain-car-card"

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
    comparedWithImport?: string // ID del coche importado comparado
    notes?: string
}

export function CarsSpain() {
    const [cars, setCars] = useState<SpainCar[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [sortBy, setSortBy] = useState("price")
    const [editingCar, setEditingCar] = useState<SpainCar | null>(null)

    // Cargar datos del localStorage
    useEffect(() => {
        const saved = localStorage.getItem("spainCars")
        if (saved) {
            setCars(JSON.parse(saved))
        }
    }, [])

    const saveCars = (updatedCars: SpainCar[]) => {
        setCars(updatedCars)
        localStorage.setItem("spainCars", JSON.stringify(updatedCars))
    }

    const addCar = (newCar: any) => {
        if (editingCar) {
            // Update existing car
            const updatedCars = cars.map(c => c.id === editingCar.id ? { ...newCar, id: editingCar.id } : c)
            saveCars(updatedCars)
            setEditingCar(null)
        } else {
            // Add new car
            const car: SpainCar = {
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

    const handleEdit = (car: SpainCar) => {
        setEditingCar(car)
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setEditingCar(null)
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

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold mb-2">Coches España</h2>
                    <p className="text-muted-foreground">Coches de referencia para comparar ({cars.length})</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                    <Plus className="w-5 h-5" />
                    Añadir Referencia
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
                    <button onClick={() => setIsModalOpen(true)} className="text-primary hover:underline font-medium">
                        Añade tu primer coche de referencia
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedCars.map((car) => (
                        <SpainCarCard key={car.id} car={car} onDelete={() => deleteCar(car.id)} onEdit={() => handleEdit(car)} />
                    ))}
                </div>
            )}

            {/* Modal */}
            <AddSpainCarModal isOpen={isModalOpen} onClose={handleCloseModal} onSubmit={addCar} initialData={editingCar} />
        </div>
    )
}
