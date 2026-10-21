// Propuestas: coches encontrados (Importación) que compartes con un cliente antes de comprarlos.
// El cliente los valora en la web (me gusta / no me convence, comentario y favorito) y te llega un aviso.
// Tabla client_proposals (supabase/2026-10_area_clientes_v2.sql).
import { supabase } from "@/lib/supabase"

export type Reaction = "like" | "dislike"

/** Mensaje de la conversación de una propuesta */
export interface ThreadMessage {
  from: "client" | "nordrive"
  text: string
  at: string
}

export interface Proposal {
  id: string
  customer_id: string
  imported_car_id: string
  client_price: number | null
  message: string | null
  reaction: Reaction | null
  client_comment: string | null
  is_favorite: boolean
  reacted_at: string | null
  /** Conversación con el cliente sobre este coche (supabase/2026-10_propuestas_conversacion.sql) */
  thread?: ThreadMessage[] | null
  created_at: string
  customers?: { name: string } | null
}

export const MISSING_PROPOSALS_HINT = "Falta preparar las propuestas: ejecuta supabase/2026-10_area_clientes_v2.sql en Supabase."

function proposalError(error: { code?: string; message?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || /client_proposals/.test(error.message || "")) return new Error(MISSING_PROPOSALS_HINT)
  return new Error(error.message || "Error en las propuestas")
}

export async function listProposals(filter: { customerId?: string; carId?: string } = {}): Promise<Proposal[]> {
  let q = supabase.from("client_proposals").select("*, customers(name)").order("created_at", { ascending: false })
  if (filter.customerId) q = q.eq("customer_id", filter.customerId)
  if (filter.carId) q = q.eq("imported_car_id", filter.carId)
  const { data, error } = await q
  if (error) throw proposalError(error)
  return (data as Proposal[]) ?? []
}

/** Crea o actualiza propuestas (precio y mensaje) sin tocar lo que ya ha contestado el cliente */
export async function upsertProposals(rows: { customer_id: string; imported_car_id: string; client_price: number | null; message: string | null }[]) {
  if (!rows.length) return
  const { error } = await supabase.from("client_proposals").upsert(rows, { onConflict: "customer_id,imported_car_id" })
  if (error) throw proposalError(error)
}

/** Contesta al cliente en la conversación de una propuesta; devuelve la conversación actualizada */
export async function replyToProposal(id: string, text: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase.rpc("reply_proposal", { proposal: id, body: text })
  if (error) {
    if (error.code === "PGRST202" || /reply_proposal/.test(error.message || "")) {
      throw new Error("Falta preparar las respuestas: ejecuta supabase/2026-10_propuestas_conversacion.sql en Supabase.")
    }
    throw new Error(error.message || "No se pudo enviar la respuesta")
  }
  // reply_proposal devuelve la conversación entera (jsonb); null si no se ha podido escribir (sin permiso)
  if (!Array.isArray(data)) throw new Error("No se pudo enviar la respuesta")
  return data as ThreadMessage[]
}

/** La conversación (con el comentario antiguo como primer mensaje si aún no hay conversación) */
export function threadOf(p: Pick<Proposal, "thread" | "client_comment" | "reacted_at" | "created_at">): ThreadMessage[] {
  if (Array.isArray(p.thread) && p.thread.length) return p.thread
  return p.client_comment ? [{ from: "client", text: p.client_comment, at: p.reacted_at || p.created_at }] : []
}

export async function deleteProposals(ids: string[]) {
  if (!ids.length) return
  const { error } = await supabase.from("client_proposals").delete().in("id", ids)
  if (error) throw proposalError(error)
}

/** Texto corto de lo que ha dicho el cliente */
export function reactionLabel(p: Pick<Proposal, "reaction" | "is_favorite">) {
  if (p.is_favorite) return "★ Favorito"
  if (p.reaction === "like") return "👍 Le gusta"
  if (p.reaction === "dislike") return "👎 No le convence"
  return "Sin respuesta"
}
