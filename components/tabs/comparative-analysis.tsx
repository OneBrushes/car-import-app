"use client"

import { useState, useEffect } from "react"
import { Plus, X, Loader2 } from "lucide-react"
import { ComparativeCard } from "@/components/cards/comparative-card"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

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
  importedCar?: ImportedCar
  spainCar?: SpainCar
}

export function ComparativeAnalysis() {
  const { user } = useAuth()
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [importedCars, setImportedCars] = useState<ImportedCar[]>([])
  const [spainCars, setSpainCars] = useState<SpainCar[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newComparison, setNewComparison] = useState({
    importedCarId: "",
    spainCarId: "",
  })

  // Cargar datos
  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 1. Cargar Comparativas (con JOINs)
      const { data: compsData, error: compsError } = await supabase
        .from('comparisons')
        .select(`
          *,
          imported_cars (*),
          spain_cars (*)
        `)
        .order('created_at', { ascending: false })

      if (compsError) throw compsError

      // 2. Cargar listas para el select (solo ID y nombre)
      const { data: impData } = await supabase.from('imported_cars').select('id, brand, model, year')
      const { data: espData } = await supabase.from('spain_cars').select('id, brand, model, year')

      setImportedCars(impData as any || [])
      setSpainCars(espData as any || [])

      // Formatear comparativas
      const formattedComps: Comparison[] = compsData.map((c: any) => ({
        id: c.id,
        importedCarId: c.imported_car_id,
        spainCarId: c.spain_car_id,
        steringAdjustment: c.steering_adjustment,
        importedCar: c.imported_cars ? {
          id: c.imported_cars.id,
          brand: c.imported_cars.brand,
          model: c.imported_cars.model,
          year: c.imported_cars.year,
          price: Number(c.imported_cars.price),
          totalExpenses: Number(c.imported_cars.total_cost) - Number(c.imported_cars.price),
          steering: c.imported_cars.steering,
          cv: Number(c.imported_cars.cv),
          mileage: Number(c.imported_cars.mileage)
        } : undefined,
        spainCar: c.spain_cars ? {
          id: c.spain_cars.id,
          brand: c.spain_cars.brand,
          model: c.spain_cars.model,
          year: c.spain_cars.year,
          price: Number(c.spain_cars.price),
          cv: Number(c.spain_cars.cv),
          mileage: Number(c.spain_cars.mileage),
          url: c.spain_cars.url
        } : undefined
      }))

      setComparisons(formattedComps)

    } catch (error) {
      console.error("Error fetching comparisons:", error)
      toast.error("Error al cargar comparativas")
    } finally {
      setLoading(false)
    }
  }

  const addComparison = async () => {
    if (!user || !newComparison.importedCarId || !newComparison.spainCarId) return

    try {
      const { error } = await supabase
        .from('comparisons')
        .insert({
          user_id: user.id,
          imported_car_id: newComparison.importedCarId,
          spain_car_id: newComparison.spainCarId,
          steering_adjustment: 4000 // Valor por defecto
        })

      if (error) throw error

      toast.success("Comparativa creada")
      setNewComparison({ importedCarId: "", spainCarId: "" })
      setShowForm(false)
      fetchData() // Recargar todo
    } catch (error) {
      toast.error("Error al crear comparativa")
    }
  }

  const removeComparison = async (id: string) => {
    try {
      const { error } = await supabase
        .from('comparisons')
        .delete()
        .eq('id', id)

      if (error) throw error

      setComparisons(comparisons.filter(c => c.id !== id))
      toast.success("Comparativa eliminada")
    } catch (error) {
      toast.error("Error al eliminar")
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

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
            if (!comp.importedCar || !comp.spainCar) return null

            return (
              <ComparativeCard
                key={comp.id}
                id={comp.id}
                importedCar={comp.importedCar}
                spainCar={comp.spainCar}
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
