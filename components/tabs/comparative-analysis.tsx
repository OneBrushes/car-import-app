"use client"

import { useState, useEffect } from "react"
import { Plus, X, Loader2, LayoutList, LayoutGrid, AlignJustify, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ComparativeCard } from "@/components/cards/comparative-card"
import { ComparativeCardGrid } from "@/components/cards/comparative-card-grid"
import { ComparativeCardMinimal } from "@/components/cards/comparative-card-minimal"
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
  const { user, isGodMode } = useAuth()
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [importedCars, setImportedCars] = useState<ImportedCar[]>([])
  const [spainCars, setSpainCars] = useState<SpainCar[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<"detailed" | "grid" | "minimal">("detailed")
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

      // Formatear comparativas y apalancar el Modo Dios
      const myCompsData = isGodMode ? compsData : (compsData || []).filter((c: any) => c.user_id === user?.id)

      const formattedComps: Comparison[] = myCompsData.map((c: any) => ({
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
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Análisis comparativo</h2>
          <p className="text-muted-foreground">
            Compara coches importados con coches de España (<span className="tabular">{comparisons.length}</span>)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="inline-flex h-9 items-center rounded-md border bg-muted p-0.5">
            {([
              { mode: "detailed", icon: LayoutList, title: "Vista detallada" },
              { mode: "grid", icon: LayoutGrid, title: "Vista compacta" },
              { mode: "minimal", icon: AlignJustify, title: "Vista minimalista" },
            ] as const).map(({ mode, icon: Icon, title }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-[5px] transition-colors ${
                  viewMode === mode ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
                title={title}
                aria-pressed={viewMode === mode}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva comparación</span>
          </Button>
        </div>
      </div>

      {/* Formulario de nueva comparación */}
      {showForm && (
        <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Scale className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold">Nueva comparación</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setShowForm(false)}
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Coche importado</Label>
              <Select
                value={newComparison.importedCarId}
                onValueChange={(value) => setNewComparison({ ...newComparison, importedCarId: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un coche importado" />
                </SelectTrigger>
                <SelectContent>
                  {importedCars.map((car) => (
                    <SelectItem key={car.id} value={car.id}>
                      {car.brand} {car.model} ({car.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">Coche España</Label>
              <Select
                value={newComparison.spainCarId}
                onValueChange={(value) => setNewComparison({ ...newComparison, spainCarId: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un coche de España" />
                </SelectTrigger>
                <SelectContent>
                  {spainCars.map((car) => (
                    <SelectItem key={car.id} value={car.id}>
                      {car.brand} {car.model} ({car.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={addComparison}>
              Crear comparación
            </Button>
          </div>
        </div>
      )}

      {/* Comparativas */}
      {comparisons.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Scale className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No hay comparativas aún</p>
          <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Crea tu primera comparación
          </Button>
        </div>
      ) : (
        <div className={
           viewMode === "grid" 
             ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
             : viewMode === "minimal" ? "space-y-2" : "space-y-4"
        }>
          {comparisons.map((comp) => {
            if (!comp.importedCar || !comp.spainCar) return null

            if (viewMode === "minimal") {
              return (
                <ComparativeCardMinimal
                  key={comp.id}
                  id={comp.id}
                  importedCar={comp.importedCar}
                  spainCar={comp.spainCar}
                  steringAdjustment={comp.steringAdjustment}
                  onDelete={() => removeComparison(comp.id)}
                />
              )
            }

            if (viewMode === "grid") {
              return (
                <ComparativeCardGrid
                  key={comp.id}
                  id={comp.id}
                  importedCar={comp.importedCar}
                  spainCar={comp.spainCar}
                  steringAdjustment={comp.steringAdjustment}
                  onDelete={() => removeComparison(comp.id)}
                />
              )
            }

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
