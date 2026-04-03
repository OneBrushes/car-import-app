"use client"

import { useEffect, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { Car, MapPin, Map as MapIcon, Loader2 } from "lucide-react"

// Fix for default Leaflet icon in React
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

// Custom Icon matching brand colors
const brandIcon = (isBought: boolean) => L.divIcon({
  className: "custom-leaflet-icon",
  html: `<div style="background-color: ${isBought ? '#16a34a' : '#3b82f6'}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-1.2-1-2-2-2h-1l-3-4H8L5 11H4c-1.1 0-2 .8-2 2v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
})

L.Marker.prototype.options.icon = defaultIcon

interface CarData {
  id: string
  brand: string
  model: string
  year: number
  price: number
  image_url?: string
  images?: string[]
  origin?: string
  location?: string
  currency: string
  isBought?: boolean
}

interface MapViewProps {
  cars: CarData[]
  filterMode?: "all" | "imported" | "bought"
}

// Component to handle bounds
function MapBounds({ markers }: { markers: { lat: number; lng: number }[] }) {
  const map = useMap()

  useEffect(() => {
    if (markers.length === 0) return
    const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]))
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
  }, [markers, map])

  return null
}

const globalCachedCoords: Record<string, { lat: number; lng: number }> = {}

export default function MapView({ cars, filterMode = 'all' }: MapViewProps) {
  const [geocodedCars, setGeocodedCars] = useState<(CarData & { lat: number; lng: number })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const geocodeAddresses = async () => {
      setLoading(true)
      const results: (CarData & { lat: number; lng: number })[] = []

      // Combinar location y origin. Excluimos coches donde ambos están vacíos o dicen 'importado'.
      const hasValidAddress = (car: CarData) => {
        const l = car.location?.trim().toLowerCase() || '';
        const o = car.origin?.trim().toLowerCase() || '';
        return (l !== '' && l !== 'importado') || (o !== '' && o !== 'importado');
      };
      
      const carsWithOrigin = cars.filter(hasValidAddress);

      for (const car of carsWithOrigin) {
        // Construir la dirección completa uniendo location (ej: calle) y origin (ej: Alemania)
        const parts = [];
        if (car.location && car.location.trim().toLowerCase() !== 'importado') parts.push(car.location.trim());
        if (car.origin && car.origin.trim().toLowerCase() !== 'importado') parts.push(car.origin.trim());
        const originalAddress = parts.join(", ");

        if (!originalAddress) continue;

        if (globalCachedCoords[originalAddress]) {
          results.push({ ...car, ...globalCachedCoords[originalAddress] })
          setGeocodedCars([...results])
          continue
        }

        try {
          const cleanAddress = originalAddress.replace(/\b[A-Z]{1,3}-/gi, " ").trim();
          
          let countrySuffix = "";
          if (originalAddress.toUpperCase().includes("DE-") || /\b(BERLIN|MUNICH|FRANKFURT|HAMBURG|STUTTGART|KOLN|COLOGNE|NUREMBERG|NIEDER OLM)\b/i.test(originalAddress)) {
            countrySuffix = ", Germany";
          } else if (originalAddress.toUpperCase().includes("ES-") || /\b(MADRID|BARCELONA|VALENCIA|SEVILLA|ALICANTE|MALAGA)\b/i.test(originalAddress)) {
            countrySuffix = ", Spain";
          } else if (originalAddress.toUpperCase().includes("FR-") || /\b(PARIS|LYON|MARSEILLE)\b/i.test(originalAddress)) {
            countrySuffix = ", France";
          } else if (/\b(ITALIA|ITALY|ROMA|MILAN|NAPOLI)\b/i.test(originalAddress)) {
            countrySuffix = ", Italy";
          }

          let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddress + countrySuffix)}&limit=1&email=admin@carimportapp.com`)
          let data = await response.json()

          // Si falla, probar sin countrySuffix
          if (!data || data.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddress)}&limit=1&email=admin@carimportapp.com`)
            data = await response.json()
          }

          // Fallback final: intentamos buscar solo por Código Postal + Ciudad
          if ((!data || data.length === 0) && cleanAddress.match(/\b\d{4,5}\b/)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const zipAndCity = cleanAddress.substring(cleanAddress.search(/\b\d{4,5}\b/));
            response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(zipAndCity + countrySuffix)}&limit=1&email=admin@carimportapp.com`);
            data = await response.json();
          }

          if (data && data.length > 0) {
            const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
            globalCachedCoords[originalAddress] = coords
            results.push({ ...car, ...coords })
          } else {
            console.warn(`No se encontraron coordenadas para: ${originalAddress}`)
          }

          // Always wait 1s after a successful geocoding iteration to avoid getting banned by Nominatim
          await new Promise(resolve => setTimeout(resolve, 1200));
        } catch (err) {
          console.error(`Error geocoding ${originalAddress}:`, err)
        }
        
        // Update incrementally!
        setGeocodedCars([...results])
      }

      setGeocodedCars([...results])
      setLoading(false)
    }

    if (cars.length > 0) {
      geocodeAddresses()
    } else {
      setLoading(false)
    }
  }, [cars])

  // Aplicar el filtro visualmente SIN destruir la lista cacheada
  const filteredCarsToShow = geocodedCars.filter(c => 
    filterMode === 'all' || 
    (filterMode === 'bought' ? c.isBought : !c.isBought)
  )

  // Contar los coches que quedaron excluidos por no tener ninguna dirección válida
  const carsWithoutValidOrigin = cars.filter(c => {
     const l = c.location?.trim().toLowerCase() || '';
     const o = c.origin?.trim().toLowerCase() || '';
     return (l === '' || l === 'importado') && (o === '' || o === 'importado');
  }).length;

  if (!loading && filteredCarsToShow.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-12 bg-card border border-border rounded-lg min-h-[500px]">
        <MapIcon className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
        <p className="text-muted-foreground font-medium text-lg">No se encontraron coches con dirección de origen válida.</p>
        <p className="text-sm text-muted-foreground mt-2 text-center max-w-sm">
          Añade o edita tus coches e incluye una dirección real en el campo "Origen" para verlos en el mapa.
        </p>
        {carsWithoutValidOrigin > 0 && (
          <p className="text-sm font-semibold text-amber-500 mt-4 border border-amber-200 bg-amber-500/10 px-4 py-2 rounded-md">
            Tienes {carsWithoutValidOrigin} coches en tu lista que no aparecerán aquí porque tienen el Origen en blanco o puesto como "Importado".
          </p>
        )}
      </div>
    )
  }

  // Pequeña función para evitar que los coches con exactamente la misma dirección se tapen unos a otros en el mapa
  const disperseOverlappingMarkers = (carsArray: typeof filteredCarsToShow) => {
    const registry: Record<string, number> = {};
    return carsArray.map(car => {
      const coordKey = `${car.lat},${car.lng}`;
      if (registry[coordKey]) {
        registry[coordKey]++;
        // Aplicar una pequeñísima dispersión aleatoria concéntrica según cuantas superposiciones haya
        const scatterRange = 0.005 * registry[coordKey];
        return {
          ...car,
          lat: car.lat + (Math.random() - 0.5) * scatterRange,
          lng: car.lng + (Math.random() - 0.5) * scatterRange
        };
      }
      registry[coordKey] = 1;
      return car;
    });
  }

  const scatteredCarsToShow = disperseOverlappingMarkers(filteredCarsToShow);

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border shadow-md relative z-0" style={{ isolation: 'isolate' }}>
      {carsWithoutValidOrigin > 0 && !loading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-amber-500/90 text-white backdrop-blur-sm px-4 py-2 rounded-full shadow-lg text-xs font-medium text-center">
          Ocultamos {carsWithoutValidOrigin} coches del mapa por falta de dirección (vacío o "Importado").
        </div>
      )}
      {loading && (
         <div className="absolute top-4 right-4 z-[1000] bg-background/90 backdrop-blur-sm border border-border px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Cargando poco a poco...</span>
         </div>
      )}
      <MapContainer
        center={[40.4168, -3.7038]} // Madrid as default
        zoom={5}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBounds markers={scatteredCarsToShow.map((c: CarData & {lat: number; lng: number}) => ({ lat: c.lat, lng: c.lng }))} />

        {scatteredCarsToShow.map((car: CarData & {lat: number; lng: number}) => {
          const mainImage = car.image_url || (car.images && car.images.length > 0 ? car.images[0] : null)
          
          return (
            <Marker key={car.id} position={[car.lat, car.lng]} icon={brandIcon(!!car.isBought)}>
              <Popup className="car-popup">
                <div className="flex flex-col gap-2 min-w-[200px]">
                  {mainImage ? (
                    <div className="w-full h-32 rounded-md overflow-hidden bg-muted relative">
                      <img src={mainImage} alt={car.model} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full h-32 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                      <Car className="w-8 h-8 opacity-50" />
                    </div>
                  )}
                  
                  <div className="flex flex-col">
                    <span className="font-bold text-base text-foreground leading-tight">
                      {car.brand} {car.model}
                    </span>
                    <span className="text-xs font-semibold mt-1" style={{color: car.isBought ? '#16a34a' : '#3b82f6'}}>
                      {car.isBought ? 'Adquirido / En Inventario' : 'De importación'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate" title={[car.location, car.origin].filter(Boolean).join(", ")}>
                        {[car.location, car.origin].filter(Boolean).join(", ") || "Ubicación desconocida"}
                      </span>
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t border-border mt-1">
                    <span className="font-semibold text-primary">
                      {car.price.toLocaleString()} {car.currency}
                    </span>
                    <span className="text-xs bg-secondary px-2 py-1 rounded-md text-secondary-foreground font-medium">
                      {car.year}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
      
      {/* Custom styles to fix popup z-index issue */}
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container {
          z-index: 0 !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 0.5rem;
          padding: 0;
          overflow: hidden;
        }
        .leaflet-popup-content {
          margin: 12px;
          line-height: 1.4;
        }
        .car-popup p {
          margin: 0;
        }
      `}} />
    </div>
  )
}
