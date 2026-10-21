// Área de clientes (www.nordrivecars.com/clientes): enlace coche comprado ↔ cliente (tabla client_portal_cars)
// y sus fotos/documentos extra (bucket privado client-portal). Los datos del coche, su fase y los checks los
// lee la web directamente de la app con portal_my_cars() (supabase/2026-10_area_clientes_v2.sql), sin precios.
import { supabase } from "@/lib/supabase"

export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://www.nordrivecars.com/clientes/"
export const PORTAL_BUCKET = "client-portal"

export type TransportMode = "conduciendo" | "camion"

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  conduciendo: "Conduciendo (lo llevo yo)",
  camion: "En camión",
}

/** Fases del tablero de Comprados tal y como las ve el cliente */
export const STAGE_LABEL: Record<string, string> = {
  purchased: "Comprado",
  in_transit: "De camino a España",
  homologation: "Homologación y matrícula",
  detailing: "Preparación",
  ready: "Listo para entregar",
  delivered: "Entregado",
}

export interface PortalFile {
  path: string
  name: string
  size?: number
}

/** Enlace coche ↔ cliente. El resto de datos (modelo, km, fotos, fase, checks) salen de la app. */
export interface PortalCar {
  id: string
  inventory_car_id: string
  customer_id: string
  transport_mode: TransportMode | null
  note: string | null
  photos: PortalFile[]
  documents: PortalFile[]
  published: boolean
  updated_at: string
}

export async function loadPortalCar(inventoryCarId: string): Promise<PortalCar | null> {
  const { data, error } = await supabase.from("client_portal_cars").select("*").eq("inventory_car_id", inventoryCarId).maybeSingle()
  if (error) throw portalError(error)
  return (data as PortalCar) ?? null
}

export type PortalCarInput = Omit<PortalCar, "id" | "updated_at">

/** Solo se guardan las columnas del enlace (las antiguas de la v1 se quedan con sus valores por defecto) */
const pick = (i: PortalCarInput) => ({
  inventory_car_id: i.inventory_car_id, customer_id: i.customer_id, transport_mode: i.transport_mode || "conduciendo",
  note: i.note?.trim() || null, photos: i.photos, documents: i.documents, published: i.published,
})

export async function savePortalCar(existing: PortalCar | null, input: PortalCarInput): Promise<PortalCar> {
  const payload = { ...pick(input), updated_at: new Date().toISOString() }
  const query = existing
    ? supabase.from("client_portal_cars").update(payload).eq("id", existing.id).select("*").single()
    : supabase.from("client_portal_cars").insert(payload).select("*").single()
  const { data, error } = await query
  if (error) throw portalError(error)
  return data as PortalCar
}

export async function deletePortalCar(car: PortalCar) {
  const paths = [...car.photos, ...car.documents].map((f) => f.path)
  if (paths.length) await supabase.storage.from(PORTAL_BUCKET).remove(paths)
  const { error } = await supabase.from("client_portal_cars").delete().eq("id", car.id)
  if (error) throw portalError(error)
}

/** Sube archivos a la carpeta del coche en el bucket privado */
export async function uploadPortalFiles(portalCarId: string, files: File[]): Promise<PortalFile[]> {
  const out: PortalFile[] = []
  for (const file of files) {
    const safe = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_")
    const path = `${portalCarId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`
    const { error } = await supabase.storage.from(PORTAL_BUCKET).upload(path, file, { contentType: file.type || undefined })
    if (error) throw portalError(error)
    out.push({ path, name: file.name, size: file.size })
  }
  return out
}

/** Copia al área del cliente un documento que ya está en el coche (bucket privado car-documents) */
export async function copyCarDocument(portalCarId: string, doc: { name: string; url: string }): Promise<PortalFile> {
  const { data, error } = await supabase.storage.from("car-documents").download(doc.url)
  if (error || !data) throw new Error(`No se pudo leer «${doc.name}»`)
  const [file] = await uploadPortalFiles(portalCarId, [new File([data], doc.name, { type: data.type })])
  return file
}

export async function removePortalFile(path: string) {
  await supabase.storage.from(PORTAL_BUCKET).remove([path])
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrls(paths, 3600)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]))
}

function portalError(error: { message?: string; code?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || /client_portal_cars|client-portal|Bucket not found/i.test(error.message || "")) {
    return new Error("Falta preparar el área de clientes: ejecuta supabase/2026-10_area_clientes.sql en Supabase.")
  }
  return new Error(error.message || "Error del área de clientes")
}

/** Texto para mandar al cliente con el enlace de acceso */
export function invitationText(name: string, email: string) {
  const first = name.trim().split(/\s+/)[0] || ""
  return `Hola${first ? ` ${first}` : ""}:

Ya puedes seguir tu coche en el área de clientes de NorDrive: en qué fase está, la inspección con sus fotos y los documentos. Allí también verás los coches que te propongamos.

1. Entra en ${PORTAL_URL}
2. Escribe tu correo (${email}) y te llegará un enlace para entrar.
3. La primera vez elige tu contraseña. Después entrarás con tu correo y esa contraseña.

Cualquier duda, aquí estamos.
NorDrive`
}
