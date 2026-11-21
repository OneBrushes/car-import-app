"use client"

// Visor de fotos a pantalla completa (yet-another-react-lightbox): deslizar con el dedo, flechas ← → y teclado,
// miniaturas, zoom con doble clic o pellizco, cerrar con Esc, la X o deslizando hacia abajo, y precarga de las vecinas.
import { useEffect, useState } from "react"
import Lightbox from "yet-another-react-lightbox"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails"
import Counter from "yet-another-react-lightbox/plugins/counter"
import "yet-another-react-lightbox/styles.css"
import "yet-another-react-lightbox/plugins/thumbnails.css"
import "yet-another-react-lightbox/plugins/counter.css"
import { Loader2, Star } from "lucide-react"

/** Miniatura ligera: las fotos de mobile.de aún sin copiar se piden a 360 px */
export function thumbnailUrl(src: string): string {
  try {
    const url = new URL(src)
    if (url.hostname.endsWith("classistatic.de")) url.searchParams.set("rule", "mo-360.jpg")
    if (url.hostname.endsWith("pictures.autoscout24.net")) url.pathname = url.pathname.replace(/\/\d+x\d+\.webp$/, "/250x188.webp")
    return url.toString()
  } catch {
    return src
  }
}

interface PhotoViewerProps {
  photos: string[]
  open: boolean
  index: number
  onClose: () => void
  /** Foto que sale en la tarjeta */
  mainPhoto?: string | null
  /** "Fijar como principal": si no se da, no aparece el botón */
  onSetMain?: (src: string) => Promise<void> | void
  title?: string
}

export function PhotoViewer({ photos, open, index, onClose, mainPhoto, onSetMain, title }: PhotoViewerProps) {
  const [current, setCurrent] = useState(index)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setCurrent(index) }, [open, index])

  const currentSrc = photos[current]
  const isMain = !!currentSrc && currentSrc === (mainPhoto ?? photos[0])

  const setMainButton = onSetMain ? (
    <button
      key="set-main"
      type="button"
      className="yarl__button"
      title={isMain ? "Es la foto principal" : "Fijar como principal"}
      aria-label={isMain ? "Es la foto principal" : "Fijar como principal"}
      disabled={isMain || saving}
      onClick={async () => {
        if (!currentSrc) return
        setSaving(true)
        try { await onSetMain(currentSrc) } finally { setSaving(false) }
      }}
    >
      <span className="flex items-center gap-1.5 px-1 text-sm font-medium">
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Star className={isMain ? "h-5 w-5 fill-current" : "h-5 w-5"} />}
        <span className="hidden sm:inline">{isMain ? "Principal" : "Fijar como principal"}</span>
      </span>
    </button>
  ) : null

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={photos.map(src => ({ src, alt: title, thumbnail: thumbnailUrl(src) }))}
      plugins={[Zoom, Thumbnails, Counter]}
      on={{ view: ({ index: i }) => setCurrent(i) }}
      carousel={{ preload: 1, finite: photos.length <= 1 }}
      controller={{ closeOnPullDown: true, closeOnBackdropClick: true }}
      zoom={{ maxZoomPixelRatio: 3, doubleClickMaxStops: 2, scrollToZoom: true }}
      thumbnails={{ width: 96, height: 64, border: 0, borderRadius: 6, padding: 0, gap: 8, imageFit: "cover", vignette: false }}
      counter={{ container: { style: { top: "unset", bottom: 0 } } }}
      toolbar={{ buttons: [setMainButton, "zoom", "close"].filter(Boolean) as React.ReactNode[] }}
      labels={{ Close: "Cerrar", Next: "Siguiente", Previous: "Anterior", "Zoom in": "Acercar", "Zoom out": "Alejar", "Show thumbnails": "Mostrar miniaturas", "Hide thumbnails": "Ocultar miniaturas" }}
      styles={{ container: { backgroundColor: "#000" } }}
    />
  )
}
