// Invitar usuarios del equipo desde el panel de administración (Edge Function invite-user de Supabase).
// Les llega un correo, eligen su contraseña en la app y entran con el rol elegido.
import { supabase } from "@/lib/supabase"

export type TeamRole = "usuario" | "gestor" | "importador" | "admin" | "super_admin"

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  usuario: "Usuario",
  gestor: "Gestor",
  importador: "Importador",
  admin: "Admin",
  super_admin: "Super Admin",
}

export async function inviteTeamMember(input: { email: string; firstName?: string; lastName?: string; role: TeamRole }) {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { email: input.email, first_name: input.firstName, last_name: input.lastName, role: input.role },
  })
  if (error) {
    let message = ""
    try { message = (await (error as { context?: Response }).context?.json())?.error ?? "" } catch { /* sin cuerpo */ }
    if (!message && /Failed to send|404|not found/i.test(error.message)) {
      message = "Falta desplegar la función invite-user en Supabase (Edge Functions)."
    }
    throw new Error(message || error.message || "No se pudo enviar la invitación")
  }
  return data as { status: "invited" | "role_updated"; email: string }
}
