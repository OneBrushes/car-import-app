"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Bookmark, ClipboardPaste, Link2, Loader2, Sparkles } from "lucide-react"
import { describeDuplicates, findDuplicateImportedCars } from "@/lib/duplicates"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { parseListing, type ScrapedCar } from "@/lib/listing-parser"
export type { ScrapedCar } from "@/lib/listing-parser"

/** Portales que bloquean cualquier lectura desde un servidor: se leen desde el navegador del usuario */
const BLOCKING_HOSTS = ["mobile.de"]
const PAYLOAD_PREFIX = "NORDRIVE1:"

/**
 * Marcador ("bookmarklet") para la barra del navegador: en la página del anuncio copia lo que hace falta
 * para leerlo (JSON-LD, metadatos, título, texto visible y fotos grandes) y la app lo lee al pegarlo.
 */
const BOOKMARKLET = `javascript:(()=>{const q=s=>[...document.querySelectorAll(s)];const h=[...q('script[type="application/ld+json"]').map(e=>e.outerHTML),...q('meta[property],meta[name]').map(e=>e.outerHTML),'<title>'+document.title.replace(/</g,' ')+'</title>','<main>'+document.body.innerText.slice(0,200000).replace(/</g,' ')+'</main>'].join('\\n');const i=[...document.images].filter(e=>e.naturalWidth>=500).map(e=>e.currentSrc||e.src).slice(0,20);const t='${PAYLOAD_PREFIX}'+JSON.stringify({u:location.href,h,i});const ok=()=>alert('Copiado para NorDrive. Vuelve a la app y pégalo (Ctrl+V) en el recuadro.');navigator.clipboard.writeText(t).then(ok,()=>prompt('Copia esto (Ctrl+C) y pégalo en NorDrive:',t))})()`

/** Lee lo pegado: el contenido del marcador o, si no, el texto del anuncio copiado a mano */
function parsePasted(text: string, fallbackUrl: string): ScrapedCar | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(PAYLOAD_PREFIX)) {
    try {
      const data = JSON.parse(trimmed.slice(PAYLOAD_PREFIX.length)) as { u: string; h: string; i?: string[] }
      const car = parseListing(data.h, data.u)
      car.images = Array.from(new Set([...car.images, ...(data.i ?? [])])).slice(0, 20)
      car.platform = hostLabel(data.u)
      return car
    } catch {
      return null
    }
  }
  const car = parseListing(`<main>${trimmed.replace(/</g, " ")}</main>`, fallbackUrl)
  car.platform = fallbackUrl ? hostLabel(fallbackUrl) : undefined
  return car
}

function hostLabel(url: string) {
  try { return new URL(url).hostname.replace(/^(www|suchen|m)\./, "") } catch { return undefined }
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
  /** Panel "copiar desde el navegador": para portales que bloquean la lectura automática */
  const [browserMode, setBrowserMode] = useState(false)
  const bookmarkRef = useRef<HTMLAnchorElement>(null)
  // React no deja poner javascript: en href; se pone a mano cuando el enlace aparece
  useEffect(() => { bookmarkRef.current?.setAttribute("href", BOOKMARKLET) }, [browserMode])

  /** Rellena el formulario con lo leído y avisa si el coche ya está guardado */
  const applyCar = async (car: ScrapedCar, sourceUrl: string) => {
    const found = [car.brand, car.model, car.year, car.price, car.mileage].filter(Boolean).length
    if (found === 0 && car.images.length === 0) {
      toast.warning("No se han encontrado datos legibles. Rellena el formulario a mano.")
      return
    }
    toast.success(`Anuncio leído${car.platform ? ` de ${car.platform}` : ""}. Revisa los datos antes de guardar.`)
    onImported(car)
    const duplicates = await findDuplicateImportedCars({
      url: car.url || sourceUrl, brand: car.brand, model: car.model, year: car.year, mileage: car.mileage,
    })
    if (duplicates.length > 0) setDuplicateWarning(describeDuplicates(duplicates))
  }

  const onPaste = async (text: string) => {
    const car = parsePasted(text, url.trim())
    if (!car) { toast.error("No se ha podido leer lo pegado. Usa el botón «Copiar para NorDrive» en la página del anuncio."); return }
    setDuplicateWarning(null)
    await applyCar(car, url.trim())
  }

  const run = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setDuplicateWarning(null)
    // Portales que bloquean siempre: directamente al modo navegador
    if (BLOCKING_HOSTS.some(h => (hostLabel(trimmed) ?? "").includes(h))) {
      setBrowserMode(true)
      toast.info("Este portal bloquea las lecturas automáticas. Cópialo desde tu navegador con el botón «Copiar para NorDrive».")
      return
    }
    setLoading(true)
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
      if (res.status === 502 && /bloque|403|401|429/i.test(String(body.error))) {
        setBrowserMode(true)
        throw new Error("El portal bloquea las lecturas automáticas. Cópialo desde tu navegador con el botón «Copiar para NorDrive».")
      }
      if (!res.ok) throw new Error(body.error || "No se pudo leer el anuncio")

      await applyCar(body as ScrapedCar, trimmed)
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
      {!browserMode ? (
        <button type="button" onClick={() => setBrowserMode(true)} className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          ¿El portal bloquea la lectura (p. ej. mobile.de)? Cópialo desde tu navegador
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-md border bg-background p-2.5 text-xs">
          <p className="font-medium">Leer el anuncio desde tu navegador</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
            <li>
              Arrastra este botón a tu barra de marcadores (solo la primera vez):{" "}
              <a ref={bookmarkRef} onClick={e => { e.preventDefault(); toast.info("Arrástralo a la barra de marcadores; no se usa desde aquí.") }}
                className="ml-1 inline-flex cursor-grab items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground no-underline">
                <Bookmark className="h-3 w-3" /> Copiar para NorDrive
              </a>
            </li>
            <li>Abre el anuncio en otra pestaña y pulsa ese marcador.</li>
            <li>Vuelve aquí y pega (Ctrl+V) en el recuadro. También vale pegar el texto del anuncio copiado a mano.</li>
          </ol>
          <div className="relative">
            <ClipboardPaste className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <textarea
              rows={2}
              placeholder="Pega aquí (Ctrl+V)…"
              className="w-full resize-none rounded-md border bg-muted/30 py-2 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              onPaste={e => { e.preventDefault(); onPaste(e.clipboardData.getData("text")) }}
              onChange={e => { if (e.target.value.length > 40) { onPaste(e.target.value); e.target.value = "" } }}
            />
          </div>
        </div>
      )}
      {duplicateWarning && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {duplicateWarning}
        </p>
      )}
    </div>
  )
}
