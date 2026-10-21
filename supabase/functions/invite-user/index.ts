// Supabase Edge Function "invite-user": invita a alguien del equipo a la app de gestión (app.nordrivecars.com)
// con el rol elegido. Le llega el correo de invitación, elige su contraseña y entra con ese rol.
//
// Se despliega en Supabase → Edge Functions → "Deploy a new function" → "Via Editor", con el nombre invite-user,
// pegando este archivo. Supabase pone solo SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.
//
// La llama el panel de administración: { email, first_name?, last_name?, role }. Solo admin y super_admin pueden
// invitar, y solo un super_admin puede invitar a otro super_admin.
import { createClient } from "npm:@supabase/supabase-js@2"

const APP_URL = "https://app.nordrivecars.com"
const ALLOWED_ORIGINS = [APP_URL, "http://localhost:3000"]
const ROLES = ["usuario", "gestor", "importador", "admin", "super_admin"]

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? ""
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

Deno.serve(async (req) => {
  const headers = cors(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })

  if (req.method === "OPTIONS") return new Response("ok", { headers })
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  // Quien invita: tiene que ser admin o super_admin de la app
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: "Sesión no válida" }, 401)
  const { data: me } = await asUser.from("profiles").select("role").eq("id", user.id).single()
  if (!me || !["admin", "super_admin"].includes(me.role)) return json({ error: "Solo un administrador puede invitar usuarios" }, 403)

  let body: { email?: string; first_name?: string; last_name?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: "Petición no válida" }, 400)
  }
  const email = String(body.email ?? "").trim().toLowerCase()
  const role = String(body.role ?? "")
  const firstName = String(body.first_name ?? "").trim().slice(0, 80)
  const lastName = String(body.last_name ?? "").trim().slice(0, 120)
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Correo no válido" }, 400)
  if (!ROLES.includes(role)) return json({ error: "Rol no válido" }, 400)
  if (role === "super_admin" && me.role !== "super_admin") return json({ error: "Solo un super_admin puede invitar a otro super_admin" }, 403)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const setRole = async (id: string) =>
    admin.from("profiles").upsert({ id, email, role, ...(firstName ? { first_name: firstName } : {}), ...(lastName ? { last_name: lastName } : {}) })

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/update-password`,
    // portal: "app" → la plantilla del correo muestra el texto del equipo (los clientes llevan portal: "clientes")
    data: { portal: "app", first_name: firstName, last_name: lastName },
  })

  if (!error && data?.user) {
    const { error: roleError } = await setRole(data.user.id)
    if (roleError) return json({ error: "Invitación enviada, pero no se pudo poner el rol: " + roleError.message }, 500)
    await admin.from("activity_logs").insert({ user_id: user.id, action: "INVITE_USER", details: `Invitado ${email} como ${role}` })
    return json({ status: "invited", email })
  }

  // Ya tenía cuenta: solo se le cambia el rol (si no es una cuenta de cliente)
  if (error && /already|registered|exists/i.test(error.message)) {
    const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle()
    if (!existing) return json({ error: "Ese correo ya tiene cuenta, pero no se encuentra su perfil" }, 409)
    if (existing.role === "cliente") return json({ error: "Ese correo es de una cuenta de cliente del área de clientes" }, 409)
    if (existing.role === "super_admin" && me.role !== "super_admin") return json({ error: "No puedes cambiar a un super_admin" }, 403)
    const { error: roleError } = await setRole(existing.id)
    if (roleError) return json({ error: "No se pudo poner el rol: " + roleError.message }, 500)
    return json({ status: "role_updated", email })
  }
  return json({ error: "No se pudo enviar la invitación: " + (error?.message ?? "error desconocido") }, 500)
})
