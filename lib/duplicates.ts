import { supabase } from "@/lib/supabase"

export interface DuplicateCandidate {
    id: string
    brand: string
    model: string
    year: number | null
    mileage: number | null
    url: string | null
    /** same-url: es el mismo anuncio; similar: misma marca, modelo, año y km casi iguales */
    reason: "same-url" | "similar"
}

/** Normaliza un enlace de anuncio para compararlo: sin protocolo, www, parámetros ni barra final. */
export function normalizeListingUrl(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`)
        const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "")
        const path = u.pathname.replace(/\/+$/, "")
        return `${host}${path}`.toLowerCase()
    } catch {
        return url.trim().toLowerCase()
    }
}

const sameText = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Busca coches de importación ya guardados que parezcan el mismo (entre los que el usuario puede ver). */
export async function findDuplicateImportedCars(input: {
    url?: string | null
    brand?: string | null
    model?: string | null
    year?: number | null
    mileage?: number | null
    excludeId?: string | null
}): Promise<DuplicateCandidate[]> {
    const wantedUrl = normalizeListingUrl(input.url)
    if (!wantedUrl && !(input.brand && input.model)) return []

    let query = supabase.from("imported_cars").select("id, brand, model, year, mileage, url").limit(500)
    if (!wantedUrl && input.brand) query = query.ilike("brand", input.brand.trim())
    const { data, error } = await query
    if (error || !data) return []

    const result: DuplicateCandidate[] = []
    for (const car of data as any[]) {
        if (car.id === input.excludeId) continue
        if (wantedUrl && normalizeListingUrl(car.url) === wantedUrl) {
            result.push({ ...car, reason: "same-url" })
            continue
        }
        const km = Number(input.mileage) || 0
        const carKm = Number(car.mileage) || 0
        const kmClose = km > 0 && carKm > 0 ? Math.abs(km - carKm) <= Math.max(500, km * 0.01) : false
        if (sameText(car.brand, input.brand) && sameText(car.model, input.model) && Number(car.year) === Number(input.year) && kmClose) {
            result.push({ ...car, reason: "similar" })
        }
    }
    return result
}

export function describeDuplicates(list: DuplicateCandidate[]): string {
    const first = list[0]
    const name = `${first.brand} ${first.model}${first.year ? ` (${first.year})` : ""}`
    const more = list.length > 1 ? ` y ${list.length - 1} más` : ""
    return first.reason === "same-url"
        ? `Este anuncio ya está guardado: ${name}${more}.`
        : `Puede que ya tengas este coche: ${name}${more} (mismos datos y km casi iguales).`
}
