// Área de clientes: lo que el cliente ve de su coche en www.nordrivecars.com/clientes
// (tabla client_portal_cars y bucket privado client-portal, ver supabase/2026-10_area_clientes.sql).
// Solo se guarda aquí lo que se quiere enseñar: nunca precios de compra, gastos ni márgenes.
import { supabase } from "@/lib/supabase"

export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://www.nordrivecars.com/clientes/"
export const PORTAL_BUCKET = "client-portal"

export type StepStatus = "completed" | "current" | "pending"
export type RouteStatus = "passed" | "current" | "pending"
export type TransportMode = "camion" | "conduciendo" | "tren" | "barco" | ""

export interface PortalStep {
  key: string
  title: string
  desc: string
  status: StepStatus
  /** Fecha en texto libre ("12/05/2026") */
  date?: string
  /** Lo que se explica al cliente al abrir el paso */
  note?: string
  bullets?: string[]
}

export interface RouteCity {
  name: string
  label?: string
  status: RouteStatus
}

export interface PortalFile {
  path: string
  name: string
  size?: number
}

export interface PortalCar {
  id: string
  inventory_car_id: string
  customer_id: string
  title: string
  year: number | null
  mileage: number | null
  color: string | null
  origin: string | null
  destination: string | null
  status_text: string | null
  current_location: string | null
  transport_mode: TransportMode | null
  route: RouteCity[]
  steps: PortalStep[]
  photos: PortalFile[]
  documents: PortalFile[]
  published: boolean
  updated_at: string
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = { completed: "Completado", current: "En curso", pending: "Pendiente" }
export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = { passed: "Pasado", current: "Aquí ahora", pending: "Pendiente" }
export const TRANSPORT_LABEL: Record<Exclude<TransportMode, "">, string> = { camion: "En camión", conduciendo: "Conduciendo", tren: "En tren", barco: "En barco" }

/** Los mismos pasos que enseña la web */
export const DEFAULT_STEPS: PortalStep[] = [
  { key: "search", title: "Búsqueda y selección", desc: "Encontramos el coche que encaja contigo", status: "completed" },
  { key: "inspection", title: "Inspección mecánica", desc: "Revisión completa antes de comprar", status: "pending" },
  { key: "purchase", title: "Compra y papeleo", desc: "Contrato, pago y documentación", status: "pending" },
  { key: "transport", title: "Transporte y ruta", desc: "El coche viaja hacia España", status: "pending" },
  { key: "delivery", title: "Matriculación y entrega", desc: "ITV, matrícula española y entrega", status: "pending" },
]

/** Pasos según la fase logística del coche en la app (para rellenar el área la primera vez) */
export function stepsForLogistic(logistic: string | null | undefined): PortalStep[] {
  const order = ["purchased", "in_transit", "homologation", "detailing", "ready"]
  const at = Math.max(0, order.indexOf(logistic || "purchased"))
  // purchased → compra en curso; in_transit → transporte; homologation/detailing → matriculación; ready → todo hecho
  const currentKey = at === 0 ? "purchase" : at === 1 ? "transport" : at >= 4 ? null : "delivery"
  const keys = DEFAULT_STEPS.map((s) => s.key)
  const currentIndex = currentKey ? keys.indexOf(currentKey) : keys.length
  return DEFAULT_STEPS.map((s, i) => ({ ...s, status: i < currentIndex ? "completed" : i === currentIndex ? "current" : "pending" }))
}

export async function loadPortalCar(inventoryCarId: string): Promise<PortalCar | null> {
  const { data, error } = await supabase.from("client_portal_cars").select("*").eq("inventory_car_id", inventoryCarId).maybeSingle()
  if (error) throw portalError(error)
  return (data as PortalCar) ?? null
}

export type PortalCarInput = Omit<PortalCar, "id" | "updated_at">

export async function savePortalCar(existing: PortalCar | null, input: PortalCarInput): Promise<PortalCar> {
  const payload = { ...input, updated_at: new Date().toISOString() }
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

Ya puedes seguir tu coche en tiempo real en el área de clientes de NorDrive: en qué paso está, dónde se encuentra, las fotos y los documentos.

1. Entra en ${PORTAL_URL}
2. Escribe tu correo (${email}) y te llegará un enlace para entrar.
3. La primera vez elige tu contraseña. Después entrarás con tu correo y esa contraseña.

Cualquier duda, aquí estamos.
NorDrive`
}
