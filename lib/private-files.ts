import { supabase } from "@/lib/supabase"

/**
 * Archivos de buckets privados (car-documents, receipts).
 * En la base de datos guardamos la ruta del archivo dentro del bucket. Los registros antiguos
 * guardaban la URL pública completa: de ella se extrae la ruta igualmente.
 */
export type PrivateBucket = "car-documents" | "receipts"

const SIGNED_URL_SECONDS = 60 * 10

/** Devuelve la ruta dentro del bucket a partir de una ruta o de una URL (pública o firmada). */
export function storagePath(bucket: PrivateBucket, value: string | null | undefined): string | null {
    if (!value) return null
    if (!/^https?:\/\//i.test(value)) return value
    const marker = `/${bucket}/`
    const index = value.indexOf(marker)
    if (index === -1) return null
    const path = value.slice(index + marker.length).split("?")[0]
    return decodeURIComponent(path)
}

export async function getSignedFileUrl(bucket: PrivateBucket, value: string | null | undefined): Promise<string | null> {
    const path = storagePath(bucket, value)
    if (!path) return null
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS)
    if (error) {
        console.error(`Error creando enlace temporal (${bucket}):`, error)
        return null
    }
    return data.signedUrl
}

/**
 * Abre un archivo privado en una pestaña nueva. La pestaña se abre antes de pedir el enlace
 * para que el navegador no la bloquee como ventana emergente.
 */
export async function openPrivateFile(bucket: PrivateBucket, value: string | null | undefined): Promise<boolean> {
    const win = window.open("", "_blank")
    const url = await getSignedFileUrl(bucket, value)
    if (!url) {
        win?.close()
        return false
    }
    if (win) win.location.href = url
    else window.location.href = url
    return true
}

export async function removePrivateFiles(bucket: PrivateBucket, values: (string | null | undefined)[]) {
    const paths = values.map(v => storagePath(bucket, v)).filter(Boolean) as string[]
    if (paths.length === 0) return
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) console.error(`Error borrando archivos (${bucket}):`, error)
}
