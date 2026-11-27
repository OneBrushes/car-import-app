// Fotos de los coches de Comprados. inventory_cars no guarda fotos: se leen del coche del que viene
// (coche de "Guardados por Claude" por coche_claude_id, o de Importación por imported_car_id), así los coches que ya
// están en Comprados también salen con foto y siempre se ve la foto actual.
import { supabase } from "@/lib/supabase"
import { DEFAULT_PHOTO_POSITION_Y } from "@/lib/image-size"

export interface PurchasePhoto {
    /** Foto principal (miniatura) */
    src: string
    /** Todas las fotos, la principal primero */
    all: string[]
    /** Encuadre vertical de la miniatura (0–100 %) */
    posY: number
}

interface Linked { id: string; coche_claude_id?: string | null; imported_car_id?: string | null }

const unique = (list: (string | null | undefined)[]) => [...new Set(list.filter((u): u is string => typeof u === "string" && u.length > 0))]

/** Primera foto y encuadre: igual que en "Guardados por Claude" (foto_url, si no la primera de fotos) */
export function pickPhoto(row: { foto_url?: string | null; fotos?: string[] | null; images?: string[] | null; image_url?: string | null; foto_posicion_y?: number | null }): PurchasePhoto | null {
    const all = unique([row.foto_url, ...(row.fotos ?? []), ...(row.images ?? []), row.image_url])
    return all.length ? { src: all[0], all, posY: row.foto_posicion_y ?? DEFAULT_PHOTO_POSITION_Y } : null
}

/** id de Comprados → foto. Si algo falla (permisos, tabla), simplemente no hay foto */
export async function loadPurchasePhotos(cars: Linked[]): Promise<Map<string, PurchasePhoto>> {
    const out = new Map<string, PurchasePhoto>()
    const claudeIds = unique(cars.map(c => c.coche_claude_id))
    const importedIds = unique(cars.map(c => c.imported_car_id))
    const [claude, imported] = await Promise.all([
        claudeIds.length
            ? supabase.from("coches_claude").select("id, foto_url, fotos, foto_posicion_y").in("id", claudeIds)
            : Promise.resolve({ data: [] as any[], error: null }),
        importedIds.length
            ? supabase.from("imported_cars").select("id, images, image_url").in("id", importedIds)
            : Promise.resolve({ data: [] as any[], error: null }),
    ])
    const byClaude = new Map((claude.error ? [] : claude.data ?? []).map((r: any) => [r.id, r]))
    const byImported = new Map((imported.error ? [] : imported.data ?? []).map((r: any) => [r.id, r]))
    for (const car of cars) {
        const photo = (car.coche_claude_id && byClaude.has(car.coche_claude_id) ? pickPhoto(byClaude.get(car.coche_claude_id)) : null)
            ?? (car.imported_car_id && byImported.has(car.imported_car_id) ? pickPhoto(byImported.get(car.imported_car_id)) : null)
        if (photo) out.set(car.id, photo)
    }
    return out
}
