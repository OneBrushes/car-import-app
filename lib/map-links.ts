// Enlaces de mapa para "por dónde va": Google Maps o Apple Maps (lo que se pega al compartir desde el móvil)

const MAP_URL = /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com)(\/|\?|$)/i

/**
 * Saca el enlace del texto que copia la app de mapas al compartir
 * (p. ej. "Mi ubicación https://maps.app.goo.gl/abc123"). Devuelve null si no hay un enlace de mapa válido.
 */
export function extractMapUrl(text: string): string | null {
  const candidates = text.match(/https:\/\/[^\s"'<>]+/gi) ?? []
  for (const raw of candidates) {
    const url = raw.replace(/[),.;]+$/, "")
    if (MAP_URL.test(url)) return url
  }
  return null
}

/** Enlace de Google Maps para unas coordenadas (lo usa el botón "Usar mi ubicación") */
export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}`
}

/** Ubicación actual del móvil (pide permiso al navegador la primera vez) */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Este navegador no puede dar la ubicación"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED
        ? "Has bloqueado la ubicación. Actívala para esta web en los ajustes del navegador."
        : "No se ha podido obtener la ubicación. Inténtalo de nuevo con buena cobertura.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}
