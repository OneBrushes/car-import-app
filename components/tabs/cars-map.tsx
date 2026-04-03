"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import { MapPin, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// Dynamically import the map component to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("@/components/map/map-view"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] flex items-center justify-center p-12 bg-card border border-border rounded-lg">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  )
})

export function CarsMap() {
  const { user } = useAuth()
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
      const filteredData = importedData.filter((car: any) =>
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
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Mapa de Coches
          </h2>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Visualiza la ubicación de los coches de importación listados en tus tablas.
          </p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          {(["all", "imported", "bought"] as const).map((mode) => (
            <Button
              key={mode}
              variant={filterMode === mode ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode(mode)}
              className={filterMode === mode && mode === "bought" ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}
            >
              {mode === "all" ? "Todos" : mode === "imported" ? "Solo Importación" : "Comprados"}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={fetchCars} disabled={loading} className="shrink-0 gap-2 ml-auto sm:ml-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="bg-card w-full rounded-xl overflow-hidden shadow-sm">
        <MapView cars={cars} filterMode={filterMode} />
      </div>
    </div>
  )
}
