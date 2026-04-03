"use client"

import { useEffect, useState, useMemo } from "react"
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
const brandIcon = (status: 'bought' | 'imported' | 'approximate') => {
  let bgColor = '#3b82f6'; // imported (blue)
  if (status === 'bought') bgColor = '#16a34a'; // bought (green)
  if (status === 'approximate') bgColor = '#eab308'; // approximate (yellow)

  return L.divIcon({
    className: "custom-leaflet-icon",
    html: `<div style="background-color: ${bgColor}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-1.2-1-2-2-2h-1l-3-4H8L5 11H4c-1.1 0-2 .8-2 2v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  })
}

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
  isApproximated?: boolean
}

interface MapViewProps {
  cars: CarData[]
  filterMode?: "all" | "imported" | "bought"
}

// Component to handle bounds safely
function MapBounds({ markers }: { markers: { lat: number; lng: number }[] }) {
  const map = useMap()

  useEffect(() => {
    // Filter out any NaN coordinates just in case to prevent Leaflet from crashing (gray map)
    const validMarkers = markers.filter(m => typeof m.lat === 'number' && typeof m.lng === 'number' && !isNaN(m.lat) && !isNaN(m.lng));
    if (validMarkers.length === 0) return;

    try {
      const bounds = L.latLngBounds(validMarkers.map(m => [m.lat, m.lng]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    } catch(e) {
      console.warn("Error setting map bounds", e);
    }
  }, [markers, map])

  return null
}

// FIX FOR TABS: Leaflet map glitches if rendered while hidden. Opening F12 resizes the window and fixes it.
// This component forces Leaflet to recalculate its size using a ResizeObserver on the map's container.
function MapResizer() {
  const map = useMap()
  
  useEffect(() => {
    const container = map.getContainer()
    
    // Si el ancho/alto cambia de 0 a un valor (al abrir la pestaña), forzamos invalidateSize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
    })
    
    resizeObserver.observe(container)
    
    // Trigger initial just in case
    setTimeout(() => map.invalidateSize(), 150)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [map])

  return null
}

const globalCachedCoords: Record<string, { lat: number; lng: number }> = {}
const LOCAL_STORAGE_CACHE_KEY = 'car_map_geocode_arcgis_cache_v3'
let isCacheLoaded = false;

// Promisified timeout
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export default function MapView({ cars, filterMode = 'all' }: MapViewProps) {
  const [geocodedCars, setGeocodedCars] = useState<(CarData & { lat: number; lng: number })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isCacheLoaded && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
        if (cached) Object.assign(globalCachedCoords, JSON.parse(cached));
      } catch(e) {}
      isCacheLoaded = true;
    }

    const geocodeAddresses = async () => {
      setLoading(true)
      
      const hasValidAddress = (car: CarData) => {
        const l = car.location?.trim().toLowerCase() || '';
        const o = car.origin?.trim().toLowerCase() || '';
        return (l !== '' && l !== 'importado') || (o !== '' && o !== 'importado');
      };

      let allResults: (CarData & { lat: number; lng: number })[] = [];

      // Procesamiento por lotes paralelos para máxima velocidad
      const CHUNK_SIZE = 10;
      
      for (let i = 0; i < cars.length; i += CHUNK_SIZE) {
        const chunk = cars.slice(i, i + CHUNK_SIZE);
        
        // Ejecutamos el chunk entero a la vez
        const chunkPromises = chunk.map(async (car) => {
          if (!hasValidAddress(car)) {
            return { ...car, lat: 51.1657, lng: 10.4515, isApproximated: true };
          }

          const parts = [];
          if (car.location && car.location.trim().toLowerCase() !== 'importado') parts.push(car.location.trim());
          if (car.origin && car.origin.trim().toLowerCase() !== 'importado') parts.push(car.origin.trim());
          const originalAddress = parts.join(", ");

          if (!originalAddress) {
             return { ...car, lat: 51.1657, lng: 10.4515, isApproximated: true };
          }

          if (globalCachedCoords[originalAddress]) {
            return { ...car, ...globalCachedCoords[originalAddress], isApproximated: false };
          }

          try {
            // Limpieza básica
            const cleanAddress = originalAddress.replace(/\b[A-Z]{1,3}-/gi, " ").trim();
            
            // ArcGIS Geocoding Service (Muy permisivo, sin problemas CORS fuertes y acepta búsquedas globales rápidamente)
            const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(cleanAddress)}&maxLocations=1`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.candidates && data.candidates.length > 0) {
              const location = data.candidates[0].location; // {x: lon, y: lat}
              const coords = { lat: location.y, lng: location.x };
              
              if (typeof coords.lat === 'number' && typeof coords.lng === 'number' && !isNaN(coords.lat)) {
                globalCachedCoords[originalAddress] = coords;
                return { ...car, ...coords, isApproximated: false };
              }
            } 
            
            // Fallback si no encuentra nada
            console.warn(`No se encontró dirección para: ${originalAddress}`);
            return { ...car, lat: 51.1657, lng: 10.4515, isApproximated: true };

          } catch (err) {
            console.error(`Error geocoding ${originalAddress}:`, err);
            return { ...car, lat: 51.1657, lng: 10.4515, isApproximated: true };
          }
        });

        const resolvedChunk = await Promise.all(chunkPromises);
        allResults = [...allResults, ...resolvedChunk];
        
        // Guardar cache tras cada chunk por seguridad
        try { localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(globalCachedCoords)); } catch(e) {}
        
        // Actualizar UI progresivamente (muy rápido)
        setGeocodedCars([...allResults]);
        
        // Micro-pausa entre chunks para evitar asfixiar la cola del navegador
        if (i + CHUNK_SIZE < cars.length) await delay(100);
      }

      setGeocodedCars(allResults);
      setLoading(false);
    }

    if (cars.length > 0) {
      geocodeAddresses()
    } else {
      setLoading(false)
    }
  }, [cars])

  const filteredCarsToShow = geocodedCars.filter(c => 
    filterMode === 'all' || 
    (filterMode === 'bought' ? c.isBought : !c.isBought)
  )

  const carsWithoutValidOrigin = cars.filter(c => {
     const l = c.location?.trim().toLowerCase() || '';
     const o = c.origin?.trim().toLowerCase() || '';
     return (l === '' || l === 'importado') && (o === '' || o === 'importado');
  }).length;

  const scatteredCarsToShow = useMemo(() => {
    const carsArray = filteredCarsToShow;
    const registry: Record<string, number> = {};
    return carsArray.map(car => {
      // Garantizar que la coordenada es válida antes de esparcir
      if (typeof car.lat !== 'number' || isNaN(car.lat) || typeof car.lng !== 'number' || isNaN(car.lng)) {
         return { ...car, lat: 51.1657, lng: 10.4515 }; // Default fallback for entirely broken coords
      }
      
      // Precision key para identificar solapamientos 
      const coordKey = `${car.lat.toFixed(5)},${car.lng.toFixed(5)}`;
      if (registry[coordKey]) {
        registry[coordKey]++;
        // Aplicar dispersión aleatoria concéntrica si hay varios en el mismo sitio exacto
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
  }, [filteredCarsToShow]);

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
            Tienes {carsWithoutValidOrigin} coches sin dirección. Se muestran aproximados en el centro de Alemania (color amarillo).
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border shadow-md relative z-0" style={{ isolation: 'isolate' }}>
      {carsWithoutValidOrigin > 0 && !loading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-amber-500/90 text-white backdrop-blur-sm px-4 py-2 rounded-full shadow-lg text-xs font-medium text-center">
          {carsWithoutValidOrigin} coches sin dirección ubicados aproximadamente en Alemania (amarillo).
        </div>
      )}
      {loading && (
         <div className="absolute top-4 right-4 z-[1000] bg-background/90 backdrop-blur-sm border border-border px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Cargando ubicaciones...</span>
         </div>
      )}
      <MapContainer
        center={[51.1657, 10.4515]} // Germany center instead of Madrid as default to avoid big jumps
        zoom={5}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        />

        <MapResizer />
        <MapBounds markers={scatteredCarsToShow.map(c => ({ lat: c.lat, lng: c.lng }))} />

        {scatteredCarsToShow.map((car) => {
          const mainImage = car.image_url || (car.images && car.images.length > 0 ? car.images[0] : null)
          
          return (
            <Marker key={`${car.id}-${car.lat}-${car.lng}`} position={[car.lat, car.lng]} icon={brandIcon(car.isBought ? 'bought' : (car.isApproximated ? 'approximate' : 'imported'))}>
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
                    <span className="text-xs font-semibold mt-1" style={{color: car.isBought ? '#16a34a' : (car.isApproximated ? '#eab308' : '#3b82f6')}}>
                      {car.isBought ? 'Adquirido / En Inventario' : (car.isApproximated ? 'Falta dirección - Ubicación Aproximada País' : 'De importación')}
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
