// Modelo de luz del día del garaje (puro), portado de LOOSES & WINS (weather.ts).
// Sin servicio meteorológico: amanecer 07:30 y anochecer 19:30 hora local, como hace el original sin ubicación.

export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm"

/**
 * Posición del sol / la luna. f = 0 al amanecer … 1 al anochecer (día) o del anochecer al siguiente amanecer (noche).
 */
export function daylight(now: Date) {
    const d = new Date(now); d.setHours(7, 30, 0, 0); const rise = d.getTime()
    const e = new Date(now); e.setHours(19, 30, 0, 0); const set = e.getTime()
    const t = now.getTime()
    const isDay = t >= rise && t <= set
    let f: number
    if (isDay) f = (t - rise) / (set - rise)
    else {
        const nightStart = t > set ? set : set - 86_400_000
        const nightEnd = t > set ? rise + 86_400_000 : rise
        f = (t - nightStart) / (nightEnd - nightStart)
    }
    f = Math.min(1, Math.max(0, f))
    const altitude = Math.sin(Math.PI * f)
    // oscuridad interior: 0 a pleno día, hasta 0,25 al atardecer / amanecer, 0,55 en plena noche
    let darkness: number
    if (isDay) darkness = Math.max(0, 1 - Math.min(t - rise, set - t) / 60_000 / 45) * 0.25
    else {
        const prevSet = t > set ? set : set - 86_400_000
        const nextRise = t > set ? rise + 86_400_000 : rise
        darkness = 0.25 + Math.min(1, Math.min(t - prevSet, nextRise - t) / 60_000 / 45) * 0.3
    }
    return { isDay, f, altitude, darkness }
}

/** Colores del cielo (arriba, horizonte). */
export function skyColors(isDay: boolean, altitude: number, sky: Sky): [string, string] {
    const grey = sky === "cloudy" || sky === "rain" || sky === "storm" || sky === "fog" || sky === "drizzle" || sky === "snow"
    if (!isDay) return grey ? ["#141a26", "#262e3d"] : ["#0b1330", "#22305c"]
    if (altitude < 0.18) return grey ? ["#6b7280", "#b8a89a"] : ["#5b7fc7", "#f6b26b"]
    return grey ? ["#8b97a8", "#c7cfd9"] : ["#3b8fe0", "#bfe3fb"]
}
