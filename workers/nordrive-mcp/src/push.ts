// Notificaciones push a los dispositivos de la cuenta dueña (iPhone con la app en la pantalla de inicio, ordenador…).
// Nunca lanza errores: si algo falla, solo lo deja en el log para no romper la herramienta o la revisión que avisa.
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildPushRequest, isGoneStatus, type PushMessage, type PushSubscriptionKeys } from "../../../lib/web-push"
import { ownerId } from "./db"
import type { Env } from "./env"

export const PUSH_TABLE = "push_suscripciones"
const SUBJECT = "https://app.nordrivecars.com"

export const pushConfigured = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

export async function savePushSubscription(client: SupabaseClient, userId: string, sub: PushSubscriptionKeys, dispositivo: string | null) {
    const { error } = await client.from(PUSH_TABLE).upsert(
        { user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, dispositivo: dispositivo?.slice(0, 120) ?? null, fallos: 0 },
        { onConflict: "endpoint" },
    )
    if (error) throw new Error(error.message.includes(PUSH_TABLE) ? `Falta la tabla ${PUSH_TABLE}: ejecuta supabase/2026-11_push.sql` : error.message)
}

export async function deletePushSubscription(client: SupabaseClient, userId: string, endpoint: string) {
    const { error } = await client.from(PUSH_TABLE).delete().eq("user_id", userId).eq("endpoint", endpoint)
    if (error) throw new Error(error.message)
}

/** Envía a todos los dispositivos de un usuario. Borra los que ya no existen (404/410). Devuelve cuántos lo recibieron */
export async function notifyUser(client: SupabaseClient, env: Env, userId: string, message: PushMessage): Promise<{ enviados: number; dispositivos: number }> {
    if (!pushConfigured(env)) return { enviados: 0, dispositivos: 0 }
    const { data, error } = await client.from(PUSH_TABLE).select("id, endpoint, p256dh, auth, fallos").eq("user_id", userId).limit(10)
    if (error) { console.error("push:", error.message); return { enviados: 0, dispositivos: 0 } }
    const vapid = { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!, subject: SUBJECT }
    let enviados = 0
    await Promise.all((data ?? []).map(async row => {
        try {
            const res = await fetch(await buildPushRequest(row as PushSubscriptionKeys, message, vapid))
            if (res.ok) {
                enviados++
                await client.from(PUSH_TABLE).update({ ultimo_envio: new Date().toISOString(), fallos: 0 }).eq("id", row.id)
            } else if (isGoneStatus(res.status) || (row.fallos ?? 0) >= 9) {
                await client.from(PUSH_TABLE).delete().eq("id", row.id)
            } else {
                console.error("push:", res.status, (await res.text()).slice(0, 200))
                await client.from(PUSH_TABLE).update({ fallos: (row.fallos ?? 0) + 1 }).eq("id", row.id)
            }
        } catch (e) {
            console.error("push:", e instanceof Error ? e.message : String(e))
        }
    }))
    return { enviados, dispositivos: data?.length ?? 0 }
}

/** Aviso a la cuenta dueña de "Guardados por Claude" */
export async function notifyOwner(client: SupabaseClient, env: Env, message: PushMessage) {
    try {
        if (!pushConfigured(env)) return
        await notifyUser(client, env, await ownerId(client), message)
    } catch (e) {
        console.error("push:", e instanceof Error ? e.message : String(e))
    }
}
