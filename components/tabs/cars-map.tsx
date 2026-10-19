"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// Dynamically import the map component to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("@/components/map/map-view"), { 
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] w-full items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando mapa…
    </div>
  )
})

export function CarsMap() {
  const { user, isGodMode } = useAuth()
  const [cars, setCars] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [filterMode, setFilterMode] = useState<"all" | "imported" | "bought">("all")

  const fetchCars = async () => {
    try {
      setLoading(true)
      // 1. Fetch imported cars
      const { data: importedData, error: copyError } = await supabase
        .from('imported_cars')
        .select('*')
        .order('created_at', { ascending: false })

      if (copyError) throw copyError

      // 2. Fetch inventory cars to see which ones are 'bought'
      const { data: inventoryData, error: invError } = await supabase
        .from('inventory_cars')
        .select('brand, model, year, status')
        
      if (invError) throw invError

      // Filter cars: show only user's cars OR cars shared with user
      const filteredData = isGodMode ? importedData : importedData.filter((car: any) =>
        car.user_id === user?.id ||
        (car.shared_with && car.shared_with.includes(user?.id))
      )

      // Transform for the map view, checking if it exists in inventory
      const mapCars = filteredData.map((car: any) => {
        // Simple heuristic to detect if this car was bought
        const isBought = inventoryData.some((invCar: any) => 
            invCar.brand?.toLowerCase() === car.brand?.toLowerCase() && 
            invCar.model?.toLowerCase() === car.model?.toLowerCase() && 
            invCar.year === car.year
        );

        return {
          id: car.id,
          brand: car.brand,
          model: car.model,
          year: car.year,
          price: Number(car.price),
          currency: "EUR",
          image_url: car.image_url,
          images: car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : []),
          origin: car.origin,
          location: car.location,
          isBought: isBought
        }
      })

      setCars(mapCars)
    } catch (error) {
      console.error("Error fetching map cars:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchCars()
    }
  }, [user])

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Mapa de coches</h2>
          <p className="text-muted-foreground">
            Visualiza la ubicación de los coches de importación guardados.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="inline-flex h-8 items-center rounded-lg border bg-card p-0.5 shadow-xs overflow-x-auto" role="tablist" aria-label="Filtrar coches">
            {(["all", "imported", "bought"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={filterMode === mode}
                onClick={() => setFilterMode(mode)}
                className={`h-full whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors ${filterMode === mode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                {mode === "all" ? "Todos" : mode === "imported" ? "Solo importación" : "Comprados"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon-sm" onClick={fetchCars} disabled={loading} className="ml-auto shrink-0 sm:ml-0" aria-label="Actualizar" title="Actualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
        <MapView cars={cars} filterMode={filterMode} />
      </div>
    </div>
  )
}
