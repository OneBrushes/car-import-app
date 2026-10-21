// Coches de cliente: coches comprados asignados a un cliente en "Área cliente" (client_portal_cars).
// No son stock propio: el cliente paga el coche y te paga honorarios (inventory_cars.client_fee).
import { supabase } from "@/lib/supabase"

export interface ClientCarInfo {
  customerId: string
  customerName: string
}

/** inventory_car_id → cliente al que se le ha asignado (vacío si aún no existe la tabla) */
export async function loadClientCars(): Promise<Map<string, ClientCarInfo>> {
  const { data, error } = await supabase.from("client_portal_cars").select("inventory_car_id, customer_id, customers(name)")
  const map = new Map<string, ClientCarInfo>()
  if (error || !data) return map
  for (const row of data as any[]) {
    map.set(row.inventory_car_id, { customerId: row.customer_id, customerName: row.customers?.name ?? "Cliente" })
  }
  return map
}

export const MISSING_CLIENT_CAR_COLUMNS = "Falta ejecutar supabase/2026-10_coches_de_cliente.sql en Supabase"
