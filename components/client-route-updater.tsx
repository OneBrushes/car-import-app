"use client"

import { useEffect, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"

interface RouteRow {
  id: string
  destination: string | null
  current_location: string | null
  location_updated_at: string | null
  customers?: { name: string } | null
}

const MISSING_COLUMNS = /current_location|location_updated_at|destination/

/**
 * "Camino a … · Ahora en …" de un coche comprado que sigue un cliente en su área de la web.
 * Va en la tarjeta del coche (Comprados), debajo de los trámites de matriculación.
 */
export function ClientRouteUpdater({ carId }: { carId: string }) {
  const [row, setRow] = useState<RouteRow | null | undefined>(undefined)
  const [destination, setDestination] = useState("")
  const [location, setLocation] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from("client_portal_cars")
      .select("id, destination, current_location, location_updated_at, customers(name)")
      .eq("inventory_car_id", carId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setRow(null); return }
        const r = (data as RouteRow | null) ?? null
        setRow(r)
        setDestination(r?.destination ?? "")
        setLocation(r?.current_location ?? "")
      })
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

  const save = async () => {
    setSaving(true)
    const hasLocation = location.trim().length > 0
    const { data, error } = await supabase
      .from("client_portal_cars")
      .update({
        destination: destination.trim() || null,
        current_location: location.trim() || null,
        location_updated_at: hasLocation ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("id, destination, current_location, location_updated_at, customers(name)")
      .single()
    setSaving(false)
    if (error) {
      toast.error(MISSING_COLUMNS.test(error.message) ? "Falta ejecutar supabase/2026-10_resenas_ubicacion.sql en Supabase" : "No se pudo guardar: " + error.message)
      return
    }
    setRow(data as unknown as RouteRow)
    toast.success(hasLocation ? `Actualizado: ${row.customers?.name?.split(" ")[0] ?? "el cliente"} ya ve por dónde va` : "Ubicación quitada")
  }

  const changed = (destination.trim() || null) !== (row.destination || null) || (location.trim() || null) !== (row.current_location || null)

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="h-4 w-4 text-primary" /> Por dónde va
        {row.customers?.name && <span className="font-normal text-muted-foreground">· lo ve {row.customers.name}</span>}
      </h4>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Camino a</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Madrid"
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Ahora en</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save() } }}
            placeholder="Lyon, Francia"
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || !changed}
          className="inline-flex items-center justify-center gap-1.5 self-end rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Actualizar
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {row.current_location
          ? <>El cliente ve: <b className="text-foreground">{row.destination ? `Camino a ${row.destination} · ` : ""}Ahora en {row.current_location}</b>
            {row.location_updated_at && ` · ${new Date(row.location_updated_at).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}</>
          : "Se ve en su área mientras el coche está en la fase «De camino a España» del tablero."}
      </p>
    </div>
  )
}
