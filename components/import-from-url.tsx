"use client"

import { useState } from "react"
import { AlertTriangle, Link2, Loader2, Sparkles } from "lucide-react"
import { describeDuplicates, findDuplicateImportedCars } from "@/lib/duplicates"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Datos que devuelve /api/scrape (functions/api/scrape.ts). Todos opcionales salvo url e images. */
export interface ScrapedCar {
  url: string
  platform?: string
  title?: string
  brand?: string
  model?: string
  year?: number
  month?: number
  price?: number
  currency?: string
  mileage?: number
  cv?: number
  fuelType?: string
  transmission?: string
  color?: string
  co2?: number
  location?: string
  images: string[]
}

interface ImportFromUrlProps {
  onImported: (car: ScrapedCar) => void
  className?: string
}

/**
 * Pega el enlace de un anuncio (AutoScout24, mobile.de, leboncoin…) y rellena el formulario.
 * Usa el Worker de Cloudflare car-scrape (NEXT_PUBLIC_SCRAPE_WORKER), porque la web está en GitHub Pages
 * y allí no hay funciones /api. Sin esa variable prueba /api/scrape (por si se aloja en Cloudflare Pages).
 */
export function ImportFromUrl({ onImported, className }: ImportFromUrlProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  const run = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setDuplicateWarning(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const endpoint = process.env.NEXT_PUBLIC_SCRAPE_WORKER || "/api/scrape"
      const res = await fetch(`${endpoint}?url=${encodeURIComponent(trimmed)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      })
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        throw new Error(process.env.NEXT_PUBLIC_SCRAPE_WORKER
          ? "El servicio de importación no responde bien. Revisa el Worker car-scrape en Cloudflare."
          : "Falta configurar el servicio de importación (NEXT_PUBLIC_SCRAPE_WORKER).")
      }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "No se pudo leer el anuncio")

      const car = body as ScrapedCar
      const found = [car.brand, car.model, car.year, car.price, car.mileage].filter(Boolean).length
      if (found === 0 && car.images.length === 0) {
        toast.warning("El portal no ha dado datos legibles. Rellena el formulario a mano.")
      } else {
        toast.success(`Anuncio leído${car.platform ? ` de ${car.platform}` : ""}. Revisa los datos antes de guardar.`)
      }
      onImported(car)

      const duplicates = await findDuplicateImportedCars({
        url: car.url || trimmed, brand: car.brand, model: car.model, year: car.year, mileage: car.mileage,
      })
      if (duplicates.length > 0) setDuplicateWarning(describeDuplicates(duplicates))
    } catch (error: any) {
      toast.error(error.message || "No se pudo leer el anuncio")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-lg border border-dashed bg-muted/40 p-3 ${className ?? ""}`}>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" /> Rellenar desde un anuncio
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); run() } }}
            placeholder="https://www.autoscout24.de/angebote/…"
            className="pl-8 bg-background"
          />
        </div>
        <Button type="button" onClick={run} disabled={loading || !url.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar"}
        </Button>
      </div>
      {duplicateWarning && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {duplicateWarning}
        </p>
      )}
    </div>
  )
}
