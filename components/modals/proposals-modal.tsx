"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Loader2, MessageSquare, Send } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { invitationText } from "@/lib/client-portal"
import { deleteProposals, listProposals, reactionLabel, replyToProposal, threadOf, upsertProposals, type Proposal, type ThreadMessage } from "@/lib/proposals"

interface ProposalsModalProps {
  isOpen: boolean
  onClose: () => void
  /** Desde un cliente: elegir varios coches para proponerle */
  customer?: { id: string; name: string; email?: string | null; portal_access?: boolean } | null
  /** Desde un coche encontrado: elegir a qué clientes proponerlo */
  car?: { id: string; brand?: string; model?: string; year?: number | null } | null
  onSaved?: () => void
}

interface Row {
  id: string                // id del coche o del cliente
  title: string
  subtitle: string
  image?: string | null
  disabled?: string         // motivo por el que no se puede proponer
}

const eur = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"

export function ProposalsModal({ isOpen, onClose, customer, car, onSaved }: ProposalsModalProps) {
  const mode: "customer" | "car" = customer ? "customer" : "car"
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [existing, setExisting] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const props = await listProposals(customer ? { customerId: customer.id } : { carId: car!.id })
        let list: Row[] = []
        if (mode === "customer") {
          const { data } = await supabase.from("imported_cars")
            .select("id, brand, model, year, mileage, price, images, image_url, pipeline_stage")
            .order("created_at", { ascending: false })
          list = (data ?? []).filter((c: any) => c.pipeline_stage !== "discarded").map((c: any) => ({
            id: c.id,
            title: `${c.brand ?? ""} ${c.model ?? ""}`.trim() || "Coche",
            subtitle: [c.year, c.mileage ? `${Number(c.mileage).toLocaleString("es-ES")} km` : null, c.price ? `${eur(Number(c.price))} en origen` : null].filter(Boolean).join(" · "),
            image: c.images?.[0] ?? c.image_url,
          }))
        } else {
          const { data } = await supabase.from("customers").select("id, name, email, portal_access").order("name")
          list = (data ?? []).map((c: any) => ({
            id: c.id, title: c.name,
            subtitle: `${c.email}${c.portal_access ? "" : " · sin acceso al área de clientes (actívalo en su ficha)"}`,
            disabled: !c.email ? "Sin correo: añádelo en Clientes" : undefined,
          }))
        }
        if (cancelled) return
        setRows(list)
        setExisting(props)
        const key = (p: Proposal) => (mode === "customer" ? p.imported_car_id : p.customer_id)
        setSelected(Object.fromEntries(props.map((p) => [key(p), true])))
        setPrices(Object.fromEntries(props.filter((p) => p.client_price != null).map((p) => [key(p), String(p.client_price)])))
        setMessage(props[0]?.message ?? "")
      } catch (e: any) {
        toast.error(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, customer?.id, car?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const byKey = useMemo(() => new Map(existing.map((p) => [mode === "customer" ? p.imported_car_id : p.customer_id, p])), [existing, mode])
  const count = Object.values(selected).filter(Boolean).length

  const save = async () => {
    setSaving(true)
    try {
      const chosen = rows.filter((r) => selected[r.id] && !r.disabled)
      await upsertProposals(chosen.map((r) => ({
        customer_id: mode === "customer" ? customer!.id : r.id,
        imported_car_id: mode === "customer" ? r.id : car!.id,
        client_price: Number(prices[r.id]) > 0 ? Number(prices[r.id]) : null,
        message: message.trim() || null,
      })))
      const removed = existing.filter((p) => !selected[mode === "customer" ? p.imported_car_id : p.customer_id]).map((p) => p.id)
      await deleteProposals(removed)
      toast.success(chosen.length ? `Propuesta guardada (${chosen.length} ${mode === "customer" ? (chosen.length === 1 ? "coche" : "coches") : (chosen.length === 1 ? "cliente" : "clientes")})` : "Propuestas quitadas")
      onSaved?.()
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const title = mode === "customer" ? `Proponer coches a ${customer!.name}` : `Proponer ${[car?.brand, car?.model].filter(Boolean).join(" ")} a clientes`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> {title}</DialogTitle>
          <DialogDescription>
            El cliente los ve en su área de la web, puede decir si le gustan, comentar y elegir su favorito. Solo ve el precio si pones uno.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {mode === "customer" && customer && (!customer.email || !customer.portal_access) && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  {!customer.email ? "Este cliente no tiene correo." : "Este cliente aún no tiene acceso al área de clientes."} Actívalo en su ficha para que pueda ver las propuestas.
                </p>
              )}

              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{mode === "customer" ? "No hay coches en Importación." : "No hay clientes. Créalos en la pestaña Clientes."}</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {rows.map((r) => {
                    const p = byKey.get(r.id)
                    return (
                      <div key={r.id} className={r.disabled ? "opacity-60" : ""}>
                      <div className="flex items-center gap-3 p-3">
                        <Checkbox checked={!!selected[r.id]} disabled={!!r.disabled} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))} />
                        {mode === "customer" && (
                          <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">{r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : null}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.disabled ?? r.subtitle}</p>
                          {p && (
                            <p className="mt-0.5 text-xs">
                              <span className={p.is_favorite || p.reaction === "like" ? "text-success" : p.reaction === "dislike" ? "text-destructive" : "text-muted-foreground"}>{reactionLabel(p)}</span>
                              {threadOf(p).length > 0 && <span className="text-muted-foreground"> · {threadOf(p).length} {threadOf(p).length === 1 ? "mensaje" : "mensajes"}</span>}
                            </p>
                          )}
                        </div>
                        {selected[r.id] && (
                          <Input type="number" inputMode="numeric" className="h-8 w-32" placeholder="Precio €" title="Precio para el cliente (opcional)"
                            value={prices[r.id] ?? ""} onChange={(e) => setPrices((x) => ({ ...x, [r.id]: e.target.value }))} />
                        )}
                      </div>
                      {p && threadOf(p).length > 0 && (
                        <ProposalThread
                          proposal={p}
                          onThread={(thread) => setExisting((list) => list.map((x) => (x.id === p.id ? { ...x, thread } : x)))}
                        />
                      )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Mensaje para el cliente (opcional)</Label>
                <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej.: Estos son los que mejor encajan con lo que buscas. Dime cuál te gusta más." />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t p-4">
              {mode === "customer" && customer?.email && customer.portal_access && (
                <Button type="button" variant="ghost" size="sm" onClick={async () => {
                  try { await navigator.clipboard.writeText(invitationText(customer.name, customer.email!)); toast.success("Invitación copiada") } catch { toast.error("No se pudo copiar") }
                }}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar invitación</Button>
              )}
              <span className="ml-auto text-sm text-muted-foreground">{count} {mode === "customer" ? (count === 1 ? "coche" : "coches") : (count === 1 ? "cliente" : "clientes")}</span>
              <Button type="button" onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar propuesta</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Conversación con el cliente sobre un coche propuesto, con caja para contestar */
function ProposalThread({ proposal, onThread }: { proposal: Proposal; onThread: (thread: ThreadMessage[]) => void }) {
  const thread = threadOf(proposal)
  const waiting = thread[thread.length - 1]?.from === "client"
  const [open, setOpen] = useState(waiting)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      onThread(await replyToProposal(proposal.id, text.trim()))
      setText("")
      toast.success("Respuesta enviada: el cliente la verá en su área")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t bg-muted/20 px-3 py-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Conversación ({thread.length})
        {waiting && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Pendiente de contestar</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {thread.map((m, i) => (
            <div key={i} className={`flex ${m.from === "nordrive" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm ${m.from === "nordrive" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                <p className={`text-[10px] ${m.from === "nordrive" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                  {m.from === "nordrive" ? "Tú" : proposal.customers?.name?.split(" ")[0] ?? "Cliente"} · {new Date(m.at).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
                {m.text}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu respuesta al cliente…" className="bg-background text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }} />
            <Button type="button" size="sm" onClick={send} disabled={sending || !text.trim()} className="self-end">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
