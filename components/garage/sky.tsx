"use client"

// Exterior del garaje: cielo, sol / luna en su posición real, estrellas, nubes y la silueta de la ciudad.
// Portado de LOOSES & WINS (sky.tsx). En vez de una VIEW fija recibe los límites del dibujo y la línea del horizonte.

import { useMemo } from "react"
import { skyColors, type Sky } from "@/lib/garage/weather"

export interface SkyBounds { x: number; y: number; w: number; h: number }

const rnd = (i: number) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s) }

export function Outside({ isDay, f, altitude, sky, bounds, horizonAt }: {
    isDay: boolean; f: number; altitude: number; sky: Sky
    bounds: SkyBounds
    /** y del borde superior de lo construido en la x de pantalla dada (detrás asoma la ciudad) */
    horizonAt: (x: number) => number
}) {
    const [top, horizon] = skyColors(isDay, altitude, sky)
    const x = bounds.x + 90 + f * (bounds.w - 180)
    const base = horizonAt(x) - 10
    const y = base - altitude * (base - (bounds.y + 70))
    const clouds = Math.round(((sky === "clear" ? 10 : sky === "partly" ? 45 : 85) / 100) * 9)
    const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => ({ x: bounds.x - 800 + rnd(i) * (bounds.w + 1600), y: bounds.y - 300 + rnd(i + 99) * 820, r: 0.6 + rnd(i + 7) * 1.2, d: rnd(i + 3) * 4 })), [bounds.x, bounds.y, bounds.w])
    const skyline = useMemo(() => {
        const out: { x: number; w: number; h: number }[] = []
        let cx = bounds.x - 1600; let i = 0
        while (cx < bounds.x + bounds.w + 1600) { const w = 40 + rnd(i) * 70; out.push({ x: cx, w, h: 40 + rnd(i + 50) * 120 }); cx += w + 4; i++ }
        return out
    }, [bounds.x, bounds.w])
    return (
        <g aria-hidden="true">
            <defs>
                <linearGradient id="mhq-sky" gradientUnits="userSpaceOnUse" x1="0" y1={bounds.y} x2="0" y2={bounds.y + bounds.h * 0.62}><stop offset="0" stopColor={top} /><stop offset="1" stopColor={horizon} /></linearGradient>
                <radialGradient id="mhq-sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#fff7d6" /><stop offset="0.45" stopColor="#ffd56b" stopOpacity="0.9" /><stop offset="1" stopColor="#ffb347" stopOpacity="0" /></radialGradient>
            </defs>
            <rect x={bounds.x - 3000} y={bounds.y - 3000} width={bounds.w + 6000} height={bounds.h + 6000} fill="url(#mhq-sky)" />
            {!isDay && stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" className="mhq-twinkle" style={{ animationDelay: `${s.d}s` }} opacity={0.9} />)}
            {isDay ? (
                <g>
                    <circle cx={x} cy={y} r={70} fill="url(#mhq-sun)" />
                    <circle cx={x} cy={y} r={22} fill="#fff3b0" />
                </g>
            ) : (
                <g>
                    <circle cx={x} cy={y} r={30} fill="#f8fafc" opacity={0.08} />
                    <circle cx={x} cy={y} r={16} fill="#f1f5f9" />
                    <circle cx={x + 7} cy={y - 4} r={14} style={{ fill: top }} />
                </g>
            )}
            {/* ciudad al fondo */}
            <g fill={isDay ? "#94a3b8" : "#1e293b"} opacity={isDay ? 0.45 : 0.9}>
                {skyline.map((b, i) => {
                    const by = horizonAt(b.x + b.w / 2) + 30
                    return (
                        <g key={i}>
                            <rect x={b.x} y={by - b.h} width={b.w} height={b.h + 3000} />
                            {!isDay && Array.from({ length: Math.floor(b.h / 22) }, (_, r) => Array.from({ length: Math.floor(b.w / 16) }, (_, c) => (rnd(i * 31 + r * 7 + c) > 0.55
                                ? <rect key={`${r}-${c}`} x={b.x + 6 + c * 16} y={by - b.h + 8 + r * 22} width={6} height={8} fill="#fcd34d" opacity={0.75} /> : null)))}
                        </g>
                    )
                })}
            </g>
            {/* nubes */}
            {Array.from({ length: clouds }, (_, i) => {
                const cx = bounds.x - 600 + rnd(i + 5) * (bounds.w + 1200); const cy = bounds.y - 40 + rnd(i + 17) * 330; const s = 0.7 + rnd(i + 2) * 0.9
                const grey = isDay ? "#ffffff" : "#475569"
                return (
                    <g key={i} className="mhq-cloud" style={{ animationDuration: `${120 + rnd(i) * 140}s`, animationDelay: `-${rnd(i + 9) * 200}s` }}>
                        <g transform={`translate(${cx} ${cy}) scale(${s})`} fill={grey} opacity={0.92}>
                            <ellipse cx={0} cy={0} rx={60} ry={20} /><ellipse cx={-28} cy={-12} rx={30} ry={22} /><ellipse cx={18} cy={-18} rx={34} ry={26} />
                        </g>
                    </g>
                )
            })}
        </g>
    )
}
