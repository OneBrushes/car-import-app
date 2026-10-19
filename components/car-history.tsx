"use client"

import { useEffect, useState } from "react"
import {
  ArrowRight, Ban, CheckCircle2, FileText, History, Loader2, Mail, MailX, Pencil, Plus, Receipt, Share2,
  ShoppingBag, Sparkles, Tag, Trash2, Truck, Wallet,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CarEvent {
  id: string
  car_table: "imported_cars" | "inventory_cars"
  car_id: string
  user_id: string | null
  event: string
  details: any
  created_at: string
}

const eur = (value: any) => (value == null || value === "" ? "—" : `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`)

const STAGES: Record<string, string> = {
  negotiating: "Negociando",
  discarded: "Descartado",
  purchased: "Comprado",
  in_transit: "Transporte",
  homologation: "Trámites / ITV",
  detailing: "Taller",
  ready: "A la venta",
}
const stage = (value: any) => (value ? STAGES[value] || value : "Encontrado")

const FIELD_LABELS: Record<string, string> = {
  brand: "marca", model: "modelo", year: "año", month: "mes", mileage: "km", cv: "CV", url: "anuncio", images: "fotos",
  image_url: "foto", notes: "notas", defects: "defectos", equipment: "equipamiento", tags: "etiquetas", color: "color",
  location: "ubicación", origin: "origen", co2: "CO₂", fuel_type: "combustible", transmission: "cambio",
  inspection_expiry: "caducidad ITV", initial_price: "precio de compra", initial_expenses: "gastos iniciales",
  date_purchased: "fecha de compra",
}

function describe(e: CarEvent): { icon: any; text: string; tone?: "success" | "warning" | "destructive" } {
  const d = e.details || {}
  switch (e.event) {
    case "created": return { icon: Plus, text: `Guardado el anuncio (${eur(d.price)})` }
    case "deleted": return { icon: Trash2, text: "Eliminado", tone: "destructive" }
    case "contacted": return { icon: Mail, text: "Marcado como contactado" }
    case "uncontacted": return { icon: MailX, text: "Desmarcado como contactado" }
    case "stage":
      return d.to === "discarded"
        ? { icon: Ban, text: "Descartado", tone: "warning" }
        : { icon: ArrowRight, text: `Fase: ${stage(d.from)} → ${stage(d.to)}` }
    case "price": return { icon: Tag, text: `Precio: ${eur(d.from)} → ${eur(d.to)}` }
    case "cost": return { icon: Wallet, text: `Coste total estimado: ${eur(d.from)} → ${eur(d.to)}` }
    case "shared": return { icon: Share2, text: d.count ? `Compartido con ${d.count} persona(s)` : "Ya no está compartido" }
    case "moved_to_inventory": return { icon: ShoppingBag, text: "Comprado: pasa al inventario", tone: "success" }
    case "bought": return { icon: ShoppingBag, text: `Comprado por ${eur(d.price)}${Number(d.expenses) ? ` + ${eur(d.expenses)} de gastos` : ""}`, tone: "success" }
    case "logistic": return { icon: Truck, text: `Logística: ${stage(d.from)} → ${stage(d.to)}` }
    case "sold": return { icon: CheckCircle2, text: `Vendido por ${eur(d.price)}${d.buyer ? ` a ${d.buyer}` : ""}`, tone: "success" }
    case "sale_updated": return { icon: Tag, text: `Precio de venta: ${eur(d.from)} → ${eur(d.to)}` }
    case "documents": {
      const diff = Number(d.to) - Number(d.from)
      return { icon: FileText, text: diff >= 0 ? `Documento añadido (${d.to} en total)` : `Documento eliminado (${d.to} en total)` }
    }
    case "matriculation": return { icon: Sparkles, text: `Matriculación: ${d.done}/${d.total} trámites hechos`, tone: d.done === d.total ? "success" : undefined }
    case "invoiced": return { icon: Receipt, text: `Factura emitida ${d.number}` }
    case "expense_added": return { icon: Plus, text: `Gasto: ${d.concept || d.category || "sin concepto"} (${eur(d.amount)})` }
    case "expense_removed": return { icon: Trash2, text: `Gasto eliminado: ${d.concept || "sin concepto"} (${eur(d.amount)})` }
    case "updated": {
      const fields: string[] = Array.isArray(d.fields) ? d.fields : []
      const labels = fields.map(f => FIELD_LABELS[f]).filter(Boolean)
      return { icon: Pencil, text: labels.length ? `Editado: ${Array.from(new Set(labels)).slice(0, 5).join(", ")}` : "Datos editados" }
    }
    default: return { icon: History, text: e.event }
  }
}

const TONES = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
}

interface CarHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Coche de importación y/o coche comprado: se muestran juntos en una sola línea de tiempo */
  importedId?: string | null
  inventoryId?: string | null
}

export function CarHistoryDialog({ open, onOpenChange, title, importedId, inventoryId }: CarHistoryDialogProps) {
  const [events, setEvents] = useState<CarEvent[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const load = async () => {
      setLoading(true)
      setError(null)
      const filters = [
        importedId ? `and(car_table.eq.imported_cars,car_id.eq.${importedId})` : null,
        inventoryId ? `and(car_table.eq.inventory_cars,car_id.eq.${inventoryId})` : null,
      ].filter(Boolean).join(",")
      if (!filters) { setLoading(false); return }

      const { data, error } = await supabase
        .from("car_events")
        .select("*")
        .or(filters)
        .order("created_at", { ascending: false })
        .limit(200)
      if (error) {
        setError("El historial no está disponible todavía. Ejecuta el script SQL nuevo en Supabase.")
        setLoading(false)
        return
      }
      const rows = (data as CarEvent[]) || []
      setEvents(rows)

      const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
      if (ids.length) {
        const { data: people } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids)
        const map: Record<string, string> = {}
        for (const p of people || []) map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email
        setNames(map)
      }
      setLoading(false)
    }
    load()
  }, [open, importedId, inventoryId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Historial</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin movimientos registrados todavía. Los cambios a partir de ahora aparecerán aquí.</p>
          ) : (
            <ol className="relative ml-3 border-l py-2">
              {events.map(e => {
                const { icon: Icon, text, tone } = describe(e)
                const date = new Date(e.created_at)
                return (
                  <li key={e.id} className="relative pb-5 pl-6 last:pb-1">
                    <span className={`absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border bg-card ${tone ? TONES[tone] : "text-muted-foreground"}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <p className="text-sm">{text}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })} · {date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                      {e.user_id && names[e.user_id] ? ` · ${names[e.user_id]}` : ""}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CarHistoryButton(props: Omit<CarHistoryDialogProps, "open" | "onOpenChange"> & { className?: string; label?: boolean }) {
  const [open, setOpen] = useState(false)
  const { className, label, ...rest } = props
  return (
    <>
      <Button
        variant="ghost"
        size={label ? "sm" : "icon"}
        className={className ?? "h-9 w-9 text-muted-foreground hover:text-foreground"}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        title="Historial"
      >
        <History className="h-4 w-4" />
        {label && <span>Historial</span>}
      </Button>
      <CarHistoryDialog open={open} onOpenChange={setOpen} {...rest} />
    </>
  )
}
