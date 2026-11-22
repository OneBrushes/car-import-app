// Precio de venta en España y facilidad de venta a partir de anuncios comparables (Wallapop y AutoScout24.es)
import type { Comparable } from "./tipos"
import { mediana } from "./filtro"

/** Comparables mínimos para fiarse del precio */
export const MIN_COMPARABLES = 3

/** Percentil p (0–100) con interpolación lineal */
export function percentil(nums: number[], p: number): number | null {
    const s = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b)
    if (!s.length) return null
    const pos = (s.length - 1) * (p / 100)
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** Facilidad de venta por la mediana de días publicados: ≤20 → 1, 20–35 → 2, 35–60 → 3, >60 → 4 */
export function facilidadPorDias(dias: number | null): number | null {
    if (dias == null) return null
    if (dias <= 20) return 1
    if (dias <= 35) return 2
    if (dias <= 60) return 3
    return 4
}

/** ¿Se parece al coche? Año ±1 y km ±40 % (si se sabe) */
export function esComparable(c: Comparable, objetivo: { anio: number | null; km: number | null }): boolean {
    if (objetivo.anio && c.anio && Math.abs(c.anio - objetivo.anio) > 1) return false
    if (objetivo.km && c.km != null) {
        const margen = Math.max(objetivo.km * 0.4, 10_000)
        if (Math.abs(c.km - objetivo.km) > margen) return false
    }
    return true
}

export interface EstudioMercado {
    ok: boolean
    motivo: string | null
    comparables: Comparable[]
    precio_venta: number | null
    facilidad: number | null
    dias_mediana: number | null
    base: "particulares" | "todos" | null
}

/**
 * Precio de venta = percentil 25 de los particulares con km parecidos (si hay menos de 3 particulares, de todos).
 * Con menos de 3 comparables → "pocos datos" (no se guarda el coche).
 */
export function estudiarMercado(todos: Comparable[], objetivo: { anio: number | null; km: number | null }): EstudioMercado {
    const comparables = todos.filter(c => esComparable(c, objetivo))
    const particulares = comparables.filter(c => c.particular)
    const dias = mediana(comparables.map(c => c.dias_publicado).filter((d): d is number => d != null))
    if (comparables.length < MIN_COMPARABLES) {
        return { ok: false, motivo: `pocos datos: ${comparables.length} comparable(s) en España`, comparables, precio_venta: null, facilidad: null, dias_mediana: dias, base: null }
    }
    const base = particulares.length >= MIN_COMPARABLES ? "particulares" : "todos"
    const precios = (base === "particulares" ? particulares : comparables).map(c => c.precio)
    const p25 = percentil(precios, 25)
    return {
        ok: true, motivo: null, comparables,
        precio_venta: p25 != null ? Math.round(p25 / 100) * 100 : null,
        facilidad: facilidadPorDias(dias), dias_mediana: dias, base,
    }
}
