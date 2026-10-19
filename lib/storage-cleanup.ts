import { supabase } from "@/lib/supabase"

/**
 * Detección de archivos huérfanos en Storage: archivos que ningún registro usa ya
 * (fotos de coches borrados, documentos de coches eliminados, recibos sustituidos…).
 * Solo para admins: necesitan ver todas las filas para no marcar como huérfano algo que sí se usa.
 */

export type CleanupBucket = "car-images" | "car-documents" | "receipts" | "avatars"

export interface OrphanFile {
    path: string
    size: number
    createdAt: string | null
}

export interface BucketReport {
    bucket: CleanupBucket
    totalFiles: number
    orphans: OrphanFile[]
    orphanBytes: number
}

/** Margen de seguridad: no tocar archivos subidos hace poco (pueden estar a medio guardar en un formulario) */
const MIN_AGE_HOURS = 24

function pathFromValue(bucket: CleanupBucket, value: unknown): string | null {
    if (typeof value !== "string" || !value) return null
    if (!/^https?:\/\//i.test(value)) return value
    const marker = `/${bucket}/`
    const index = value.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(value.slice(index + marker.length).split("?")[0])
}

async function listAll(bucket: CleanupBucket, prefix = ""): Promise<OrphanFile[]> {
    const files: OrphanFile[] = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } })
        if (error) throw new Error(`No se pudo listar ${bucket}: ${error.message}`)
        for (const item of data || []) {
            const path = prefix ? `${prefix}/${item.name}` : item.name
            if (item.id === null) {
                // Carpeta
                files.push(...(await listAll(bucket, path)))
            } else if (item.name !== ".emptyFolderPlaceholder") {
                files.push({ path, size: Number((item.metadata as any)?.size) || 0, createdAt: item.created_at ?? null })
            }
        }
        if (!data || data.length < pageSize) break
    }
    return files
}

async function referencedPaths(bucket: CleanupBucket): Promise<Set<string>> {
    const paths = new Set<string>()
    const add = (value: unknown) => {
        const path = pathFromValue(bucket, value)
        if (path) paths.add(path)
    }
    const must = <T,>(result: { data: T | null; error: any }, what: string): T => {
        // Si no se puede leer alguna tabla, se aborta: mejor no borrar nada que borrar algo en uso
        if (result.error) throw new Error(`No se pudo leer ${what}: ${result.error.message}`)
        return (result.data ?? []) as T
    }

    if (bucket === "car-images") {
        const imported = must(await supabase.from("imported_cars").select("image_url, images"), "imported_cars") as any[]
        const spain = must(await supabase.from("spain_cars").select("image_url, images"), "spain_cars") as any[]
        for (const row of [...imported, ...spain]) {
            add(row.image_url)
            for (const img of Array.isArray(row.images) ? row.images : []) add(img)
        }
    } else if (bucket === "car-documents") {
        const inventory = must(await supabase.from("inventory_cars").select("documents"), "inventory_cars") as any[]
        for (const row of inventory) for (const doc of Array.isArray(row.documents) ? row.documents : []) add(doc?.url)
    } else if (bucket === "receipts") {
        const expenses = must(await supabase.from("global_expenses").select("receipt_url"), "global_expenses") as any[]
        for (const row of expenses) add(row.receipt_url)
    } else if (bucket === "avatars") {
        const profiles = must(await supabase.from("profiles").select("avatar_url"), "profiles") as any[]
        for (const row of profiles) add(row.avatar_url)
    }
    return paths
}

export async function analyzeBucket(bucket: CleanupBucket): Promise<BucketReport> {
    const [files, used] = await Promise.all([listAll(bucket), referencedPaths(bucket)])
    const cutoff = Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000
    const orphans = files.filter(f => !used.has(f.path) && (!f.createdAt || new Date(f.createdAt).getTime() < cutoff))
    return {
        bucket,
        totalFiles: files.length,
        orphans,
        orphanBytes: orphans.reduce((sum, f) => sum + f.size, 0),
    }
}

export async function deleteOrphans(bucket: CleanupBucket, files: OrphanFile[]): Promise<number> {
    let deleted = 0
    for (let i = 0; i < files.length; i += 100) {
        const chunk = files.slice(i, i + 100).map(f => f.path)
        const { data, error } = await supabase.storage.from(bucket).remove(chunk)
        if (error) throw new Error(`Error borrando en ${bucket}: ${error.message}`)
        deleted += data?.length ?? 0
    }
    return deleted
}
