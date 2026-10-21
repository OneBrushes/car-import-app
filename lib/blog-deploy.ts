// Seguimiento de la subida de un artículo a la web: se guarda aquí (y en sessionStorage) para que la barra de progreso
// siga aunque se salga del editor o se recargue la página.
import { useSyncExternalStore } from "react"

export interface DeployJob {
  slug: string
  title: string
  /** live: el artículo tiene que aparecer · gone: tiene que desaparecer · update: solo cambia */
  expect: "live" | "gone" | "update"
  startedAt: number
}

const KEY = "nordrive-blog-deploy"
const listeners = new Set<() => void>()

function read(): DeployJob | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DeployJob) : null
  } catch {
    return null
  }
}

let job: DeployJob | null = typeof window === "undefined" ? null : read()

function emit(next: DeployJob | null) {
  job = next
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next))
    else sessionStorage.removeItem(KEY)
  } catch { /* sin almacenamiento: solo en memoria */ }
  listeners.forEach((l) => l())
}

export const startDeploy = (j: Omit<DeployJob, "startedAt">) => emit({ ...j, startedAt: Date.now() })
export const clearDeploy = () => emit(null)

export function useDeployJob() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => job,
    () => null,
  )
}
