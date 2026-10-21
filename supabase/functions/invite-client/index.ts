// Supabase Edge Function "invite-client": manda a un cliente el correo de invitación para crear su cuenta del
// área de clientes (www.nordrivecars.com/clientes). Las cuentas de cliente solo se crean así: la web ya no deja
// crearlas por su cuenta.
//
// Se despliega en Supabase → Edge Functions → "Deploy a new function" → "Via Editor", con el nombre invite-client,
// pegando este archivo. No hace falta configurar nada más: Supabase pone solo SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY (la clave secreta nunca sale de Supabase).
//
// La llama la app de gestión con la sesión del usuario: { customer_id }. Solo el equipo (gestor, importador, admin,
// super_admin) puede invitar, y solo a fichas de cliente que puede ver.
import { createClient } from "npm:@supabase/supabase-js@2"

const PORTAL_URL = "https://www.nordrivecars.com/clientes/"
const ALLOWED_ORIGINS = ["https://app.nordrivecars.com", "http://localhost:3000"]
const STAFF_ROLES = ["gestor", "importador", "admin", "super_admin"]

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

  // Quien llama: su sesión de la app (se aplican sus reglas de acceso)
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: "Sesión no válida" }, 401)
  const { data: profile } = await asUser.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !STAFF_ROLES.includes(profile.role)) return json({ error: "No tienes permiso para invitar clientes" }, 403)

  let customerId = ""
  try {
    customerId = String((await req.json()).customer_id ?? "")
  } catch {
    return json({ error: "Petición no válida" }, 400)
  }
  const { data: customer } = await asUser.from("customers").select("id, name, email, portal_access").eq("id", customerId).single()
  if (!customer) return json({ error: "Cliente no encontrado" }, 404)
  const email = String(customer.email ?? "").trim().toLowerCase()
  if (!email) return json({ error: "Este cliente no tiene correo" }, 400)

  // Con la invitación se activa también su acceso al área de clientes
  if (!customer.portal_access) {
    const { error } = await asUser.from("customers").update({ portal_access: true }).eq("id", customer.id)
    if (error) return json({ error: "No se pudo activar el acceso: " + error.message }, 500)
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: PORTAL_URL,
    data: { portal: "clientes", name: customer.name },
  })
  if (!error) return json({ status: "invited", email })

  // Ya tenía cuenta: se le manda un enlace para entrar (y, si no la tenía, elegir contraseña)
  if (/already|registered|exists/i.test(error.message)) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: linkError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: PORTAL_URL } })
    if (linkError) return json({ error: "Ya tiene cuenta, pero no se pudo enviar el enlace: " + linkError.message }, 500)
    return json({ status: "magic_link", email })
  }
  return json({ error: "No se pudo enviar la invitación: " + error.message }, 500)
})
