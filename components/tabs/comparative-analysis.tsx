"use client"

import { useState, useEffect } from "react"
import { Plus, X } from "lucide-react"
import { ComparativeCard } from "@/components/cards/comparative-card"

interface ImportedCar {
  id: string
  brand: string
  model: string
  year: number
  price: number
  totalExpenses?: number
  finalPrice?: number
  steering?: string
  cv?: number
  mileage?: number
  url?: string
}

interface SpainCar {
  id: string
  brand: string
  model: string
  year: number
  price: number
  cv?: number
  mileage?: number
  url?: string
}

interface Comparison {
  id: string
  importedCarId: string
  spainCarId: string
  steringAdjustment: number
}

export function ComparativeAnalysis() {
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [importedCars, setImportedCars] = useState<ImportedCar[]>([])
  const [spainCars, setSpainCars] = useState<SpainCar[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newComparison, setNewComparison] = useState({
    importedCarId: "",
    spainCarId: "",
  })

  // Cargar datos
  useEffect(() => {
    const imported = localStorage.getItem("importedCars")
    const spain = localStorage.getItem("spainCars")
    const comps = localStorage.getItem("comparisons")

    if (imported) setImportedCars(JSON.parse(imported))
    if (spain) setSpainCars(JSON.parse(spain))
    if (comps) setComparisons(JSON.parse(comps))
  }, [])

  const saveComparisons = (updated: Comparison[]) => {
    setComparisons(updated)
    localStorage.setItem("comparisons", JSON.stringify(updated))
  }

  const addComparison = () => {
    if (newComparison.importedCarId && newComparison.spainCarId) {
      const comparison: Comparison = {
        id: `COMP-${(comparisons.length + 1).toString().padStart(3, "0")}`,
        importedCarId: newComparison.importedCarId,
        spainCarId: newComparison.spainCarId,
        steringAdjustment: 4000, // Ajuste por defecto para volante derecha
      }
      saveComparisons([...comparisons, comparison])
      setNewComparison({ importedCarId: "", spainCarId: "" })
      setShowForm(false)
    }
  }

  const removeComparison = (id: string) => {
    saveComparisons(comparisons.filter((c) => c.id !== id))
  }

  const getImportedCar = (id: string) => importedCars.find((c) => c.id === id)
  const getSpainCar = (id: string) => spainCars.find((c) => c.id === id)

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2">Análisis Comparativo</h2>
          <p className="text-muted-foreground">Compara coches importados vs coches de España ({comparisons.length})</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Nueva Comparación
        </button>
      </div>

      {/* Formulario de nueva comparación */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Nueva Comparación</h3>
            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-secondary rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Coche Importado</label>
              <select
                value={newComparison.importedCarId}
                onChange={(e) => setNewComparison({ ...newComparison, importedCarId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Selecciona un coche importado</option>
                {importedCars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.brand} {car.model} ({car.year})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Coche España</label>
              <select
                value={newComparison.spainCarId}
                onChange={(e) => setNewComparison({ ...newComparison, spainCarId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Selecciona un coche de España</option>
                {spainCars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.brand} {car.model} ({car.year})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={addComparison}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Crear Comparación
            </button>
          </div>
        </div>
      )}

      {/* Comparativas */}
      {comparisons.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No hay comparativas aún</p>
          <button onClick={() => setShowForm(true)} className="text-primary hover:underline font-medium">
            Crea tu primera comparación
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {comparisons.map((comp) => {
            const imported = getImportedCar(comp.importedCarId)
            const spain = getSpainCar(comp.spainCarId)

            if (!imported || !spain) return null

            return (
              <ComparativeCard
                key={comp.id}
                id={comp.id}
                importedCar={imported}
                spainCar={spain}
                steringAdjustment={comp.steringAdjustment}
                onDelete={() => removeComparison(comp.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
