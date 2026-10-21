// Conversaciones con los vendedores (tabla car_conversations, supabase/2026-10_conversaciones_vendedor.sql).
// Se guardan aparte del coche con una copia de sus datos, para que sigan ahí cuando el coche se borre.
import { supabase } from "@/lib/supabase"
import { detectLanguage, type SellerCar, type SellerLanguage } from "@/lib/seller-messages"

export interface ConversationMessage {
  from: "me" | "seller"
  text: string
  at: string
}

export interface Conversation {
  id: string
  car_id: string | null
  car_title: string
  car_url: string | null
  car_snapshot: SellerCar
  language: SellerLanguage
  messages: ConversationMessage[]
  seller_sold_at: string | null
  updated_at: string
}

export const MISSING_TABLE_HINT = "Falta crear la tabla de conversaciones: ejecuta supabase/2026-10_conversaciones_vendedor.sql en Supabase."

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /car_conversations/.test(error.message || ""))

export function snapshotOf(car: any): SellerCar {
  return {
    brand: car.brand ?? null, model: car.model ?? null, year: car.year ?? null, month: car.month ?? null,
    mileage: car.mileage ? Number(car.mileage) : null, price: car.price ? Number(car.price) : null,
    location: car.location ?? null, url: car.url ?? null, platform: car.platform ?? null, origin: car.origin ?? null,
  }
}

export const titleOf = (car: SellerCar) =>
  [car.brand, car.model].filter(Boolean).join(" ") + (car.year ? ` (${car.year})` : "")

export async function loadConversationForCar(carId: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from("car_conversations").select("*").eq("car_id", carId).maybeSingle()
  if (isMissingTable(error)) throw new Error(MISSING_TABLE_HINT)
  if (error) throw error
  return (data as Conversation) ?? null
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from("car_conversations").select("*").eq("id", id).maybeSingle()
  if (isMissingTable(error)) throw new Error(MISSING_TABLE_HINT)
  if (error) throw error
  return (data as Conversation) ?? null
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.from("car_conversations").select("*").order("updated_at", { ascending: false })
  if (isMissingTable(error)) throw new Error(MISSING_TABLE_HINT)
  if (error) throw error
  return (data as Conversation[]) ?? []
}

/** Guarda los mensajes; crea la conversación la primera vez (con la copia de los datos del coche) */
export async function saveConversation(params: {
  conversation: Conversation | null
  car?: any
  language: SellerLanguage
  messages: ConversationMessage[]
}): Promise<Conversation> {
  const { conversation, car, language, messages } = params
  if (conversation) {
    const { data, error } = await supabase
      .from("car_conversations")
      .update({ messages, language, updated_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .select("*")
      .single()
    if (isMissingTable(error)) throw new Error(MISSING_TABLE_HINT)
    if (error) throw error
    return data as Conversation
  }
  const snapshot = snapshotOf(car ?? {})
  const { data, error } = await supabase
    .from("car_conversations")
    .insert({
      car_id: car?.id ?? null,
      car_title: titleOf(snapshot),
      car_url: snapshot.url,
      car_snapshot: snapshot,
      language: language || detectLanguage(snapshot),
      messages,
      seller_sold_at: car?.seller_sold_at ?? null,
    })
    .select("*")
    .single()
  if (isMissingTable(error)) throw new Error(MISSING_TABLE_HINT)
  if (error) throw error
  return data as Conversation
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("car_conversations").delete().eq("id", id)
  if (error) throw error
}

/** Días que quedan hasta que se borren los datos de un coche vendido por el vendedor (30 días) */
export function daysUntilPurge(sellerSoldAt: string | null | undefined) {
  if (!sellerSoldAt) return null
  const ms = new Date(sellerSoldAt).getTime() + 30 * 86_400_000 - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

// ---------------------------------------------------------------------------------------------------------------------
// Respuesta con IA (Worker car-assistant)
// ---------------------------------------------------------------------------------------------------------------------

export interface AiReply {
  reply: string
  translation_es: string
  seller_summary_es: string
  advice_es: string
}

export const ASSISTANT_URL = process.env.NEXT_PUBLIC_ASSISTANT_WORKER || ""

export async function draftReplyWithAi(params: {
  car: SellerCar
  language: SellerLanguage
  messages: ConversationMessage[]
  instruction?: string
  offer?: number | null
  name?: string
}): Promise<AiReply> {
  if (!ASSISTANT_URL) throw new Error("Falta configurar el asistente de IA (NEXT_PUBLIC_ASSISTANT_WORKER).")
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(ASSISTANT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ ...params, messages: params.messages.map(({ from, text }) => ({ from, text })) }),
  })
  const type = res.headers.get("content-type") || ""
  if (!type.includes("application/json")) throw new Error("El asistente de IA no responde bien. Revisa el Worker car-assistant en Cloudflare.")
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || "No se pudo generar la respuesta")
  return body as AiReply
}
