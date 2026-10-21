"use client"

import { useEffect, useState } from "react"
import { ClipboardPaste, ExternalLink, LocateFixed, Loader2, MapPin, X } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { currentPosition, extractMapUrl, googleMapsUrl } from "@/lib/map-links"

interface RouteRow {
  id: string
  destination: string | null
  current_location: string | null
  location_url?: string | null
  location_updated_at: string | null
  customers?: { name: string } | null
}

const MISSING_COLUMNS = /current_location|location_updated_at|destination|location_url/
const BASE_COLUMNS = "id, destination, current_location, location_updated_at, customers(name)"

/**
 * "Camino a … · Ahora en …" de un coche comprado que sigue un cliente en su área de la web, con el enlace del mapa
 * (pegado desde Google Maps / Apple Maps o creado con la ubicación del móvil).
 * Va en la tarjeta del coche (Comprados), debajo de los trámites de matriculación.
 */
export function ClientRouteUpdater({ carId }: { carId: string }) {
  const [row, setRow] = useState<RouteRow | null | undefined>(undefined)
  /** La columna location_url llega con supabase/2026-10_ubicacion_mapa.sql */
  const [hasMapColumn, setHasMapColumn] = useState(true)
  const [destination, setDestination] = useState("")
  const [location, setLocation] = useState("")
  const [mapUrl, setMapUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let res = await supabase.from("client_portal_cars").select(`${BASE_COLUMNS}, location_url`).eq("inventory_car_id", carId).maybeSingle()
      let mapColumn = true
      if (res.error && /location_url/.test(res.error.message)) {
        mapColumn = false
        res = await supabase.from("client_portal_cars").select(BASE_COLUMNS).eq("inventory_car_id", carId).maybeSingle()
      }
      if (cancelled) return
      setHasMapColumn(mapColumn)
      if (res.error) { setRow(null); return }
      const r = (res.data as unknown as RouteRow | null) ?? null
      setRow(r)
      setDestination(r?.destination ?? "")
      setLocation(r?.current_location ?? "")
      setMapUrl(r?.location_url ?? "")
    })()
    return () => { cancelled = true }
  }, [carId])

  if (row === undefined) return null

  if (row === null) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Por dónde va:</span> asigna el coche a un cliente con «Área cliente» y aquí podrás poner a dónde va y dónde está ahora para que lo vea.
      </div>
    )
  }

  const save = async (override?: { mapUrl?: string; location?: string }) => {
    const loc = (override?.location ?? location).trim()
    const url = (override?.mapUrl ?? mapUrl).trim()
    if (url && !extractMapUrl(url)) { toast.error("Ese enlace no es de Google Maps ni de Apple Maps"); return }
    setSaving(true)
    const hasPlace = Boolean(loc || url)
    const patch: Record<string, unknown> = {
      destination: destination.trim() || null,
      current_location: loc || null,
      location_updated_at: hasPlace ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    if (hasMapColumn) patch.location_url = url ? extractMapUrl(url) : null
    const { data, error } = await supabase
      .from("client_portal_cars")
      .update(patch)
      .eq("id", row.id)
      .select(hasMapColumn ? `${BASE_COLUMNS}, location_url` : BASE_COLUMNS)
      .single()
    setSaving(false)
    if (error) {
      toast.error(MISSING_COLUMNS.test(error.message) ? "Falta ejecutar supabase/2026-10_ubicacion_mapa.sql en Supabase" : "No se pudo guardar: " + error.message)
      return
    }
    setRow(data as unknown as RouteRow)
    toast.success(hasPlace ? `Actualizado: ${row.customers?.name?.split(" ")[0] ?? "el cliente"} ya ve por dónde va` : "Ubicación quitada")
  }

  /** Pega lo que has copiado al compartir la ubicación desde Google Maps / Apple Maps */
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const url = extractMapUrl(text)
      if (!url) { toast.error("Lo copiado no es un enlace de Google Maps ni de Apple Maps"); return }
      setMapUrl(url)
      toast.success("Enlace pegado. Pulsa Actualizar.")
    } catch {
      toast.info("Mantén pulsado el campo del enlace y elige «Pegar»")
    }
  }

  /** Ubicación del móvil → enlace de Google Maps, y se guarda al momento */
  const useMyLocation = async () => {
    setLocating(true)
    try {
      const { lat, lng } = await currentPosition()
      const url = googleMapsUrl(lat, lng)
      setMapUrl(url)
      await save({ mapUrl: url })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLocating(false)
    }
  }

  const changed = (destination.trim() || null) !== (row.destination || null)
    || (location.trim() || null) !== (row.current_location || null)
    || (mapUrl.trim() || null) !== (row.location_url || null)
  const inputClass = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="h-4 w-4 text-primary" /> Por dónde va
        {row.customers?.name && <span className="font-normal text-muted-foreground">· lo ve {row.customers.name}</span>}
      </h4>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Camino a</span>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Madrid" className={inputClass} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Ahora en</span>
          <input
            value={location}
            onChange={(e) => {
              // si pegan aquí el enlace del mapa, va a su sitio
              const url = extractMapUrl(e.target.value)
              if (url && hasMapColumn) { setMapUrl(url); setLocation(e.target.value.replace(url, "").trim()); return }
              setLocation(e.target.value)
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save() } }}
            placeholder="Lyon, Francia"
            className={inputClass}
          />
        </label>
      </div>

      {hasMapColumn ? (
        <div className="space-y-1 text-xs">
          <span className="text-muted-foreground">Enlace del mapa (Google Maps o Apple Maps)</span>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={mapUrl}
                onChange={(e) => setMapUrl(extractMapUrl(e.target.value) ?? e.target.value)}
                placeholder="Pega aquí el enlace al compartir tu ubicación"
                className={`${inputClass} pr-7`}
              />
              {mapUrl && (
                <button type="button" onClick={() => setMapUrl("")} title="Quitar enlace" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button type="button" onClick={pasteFromClipboard} title="Pegar lo copiado"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 text-xs hover:bg-accent">
              <ClipboardPaste className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pegar</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-warning">Para poder poner el enlace del mapa, ejecuta supabase/2026-10_ubicacion_mapa.sql en Supabase.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {hasMapColumn && (
          <button type="button" onClick={useMyLocation} disabled={locating || saving}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            title="Usa el GPS del móvil: crea el enlace de Google Maps y lo guarda">
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Usar mi ubicación
          </button>
        )}
        <button type="button" onClick={() => save()} disabled={saving || !changed}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Actualizar
        </button>
        {row.location_url && (
          <a href={row.location_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" /> Ver el mapa que ve el cliente
          </a>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {row.current_location || row.location_url
          ? <>El cliente ve: <b className="text-foreground">{row.destination ? `Camino a ${row.destination} · ` : ""}{row.current_location ? `Ahora en ${row.current_location}` : "Ubicación en el mapa"}</b>
            {row.location_url ? " · con botón «Ver en el mapa»" : ""}
            {row.location_updated_at && ` · ${new Date(row.location_updated_at).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}</>
          : "Se ve en su área mientras el coche está en la fase «De camino a España» del tablero."}
      </p>
    </div>
  )
}
