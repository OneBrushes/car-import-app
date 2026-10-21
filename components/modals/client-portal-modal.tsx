"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Copy, ExternalLink, FileText, ImagePlus, Loader2, Mail, MapPin, Trash2, Upload, UserRound } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Customer } from "@/components/modals/sell-car-modal"
import {
  copyCarDocument, deletePortalCar, invitationText, inviteCustomer, loadPortalCar, PORTAL_URL, removePortalFile, savePortalCar, signedUrls,
  STAGE_LABEL, TRANSPORT_LABEL, uploadPortalFiles,
  type PortalCar, type PortalCarInput, type PortalFile, type TransportMode,
} from "@/lib/client-portal"

interface ClientPortalModalProps {
  isOpen: boolean
  onClose: () => void
  /** Coche comprado (inventory_cars, ya formateado por Comprados) */
  car: any
}

type CustomerRow = Customer & { portal_access?: boolean }

const formatSize = (n?: number) => (n ? (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`) : "")

async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok) } catch { toast.error("No se pudo copiar") }
}

/**
 * Asigna un coche comprado a un cliente para que lo siga en la web. Los datos del coche, la fase del tablero
 * y los checks de la inspección salen solos de la app; aquí solo se elige el cliente y lo que se añade a mano.
 */
export function ClientPortalModal({ isOpen, onClose, car }: ClientPortalModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [existing, setExisting] = useState<PortalCar | null>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [form, setForm] = useState<PortalCarInput | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [checks, setChecks] = useState<{ done: number; total: number; photos: number } | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)

  const carTitle = [car?.brand, car?.model].filter(Boolean).join(" ") + (car?.year ? ` (${car.year})` : "")
  const stage = car?.status === "sold" ? "delivered" : car?.logistic_status || "purchased"

  useEffect(() => {
    if (!isOpen || !car?.id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [portal, customersRes, checklistRes] = await Promise.all([
          loadPortalCar(car.id),
          supabase.from("customers").select("*").order("name"),
          car.imported_car_id
            ? supabase.from("car_checklists").select("data").eq("car_id", car.imported_car_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        setCustomers((customersRes.data as CustomerRow[]) ?? [])
        setExisting(portal)
        const data = ((checklistRes as { data: { data?: Record<string, { checked?: boolean; photos?: string[] }> } | null }).data?.data) ?? {}
        const entries = Object.values(data)
        setChecks({ done: entries.filter((e) => e?.checked).length, total: entries.length, photos: entries.reduce((n, e) => n + (e?.photos?.length ?? 0), 0) })
        setForm(portal
          ? { inventory_car_id: portal.inventory_car_id, customer_id: portal.customer_id, transport_mode: portal.transport_mode || "conduciendo", note: portal.note, current_location: portal.current_location ?? null, location_updated_at: portal.location_updated_at ?? null, photos: portal.photos, documents: portal.documents, published: portal.published }
          : { inventory_car_id: car.id, customer_id: car.customer_id ?? "", transport_mode: "conduciendo", note: null, current_location: null, location_updated_at: null, photos: [], documents: [], published: true })
        if (portal) setUrls(await signedUrls(portal.photos.map((p) => p.path)))
      } catch (e: any) {
        toast.error(e.message)
        setForm(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, car?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const customer = useMemo(() => customers.find((c) => c.id === form?.customer_id) ?? null, [customers, form?.customer_id])
  const set = <K extends keyof PortalCarInput>(key: K, value: PortalCarInput[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  /** Guarda (crea el enlace la primera vez) */
  const save = async (override?: Partial<PortalCarInput>, quiet = false): Promise<PortalCar | null> => {
    if (!form) return null
    const next = { ...form, ...override }
    if (!next.customer_id) { toast.error("Elige primero el cliente"); return null }
    setSaving(true)
    try {
      const saved = await savePortalCar(existing, next)
      setExisting(saved)
      setForm({ ...next, photos: saved.photos, documents: saved.documents })
      if (next.customer_id !== car.customer_id) await supabase.from("inventory_cars").update({ customer_id: next.customer_id }).eq("id", car.id)
      if (!quiet) toast.success(existing ? "Guardado" : "Coche asignado al cliente")
      return saved
    } catch (e: any) {
      toast.error(e.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  const [inviting, setInviting] = useState(false)
  /** Activa su acceso y le manda el correo para crear su cuenta (o entrar, si ya la tiene) */
  const sendInvite = async () => {
    if (!customer) return
    if (!customer.email) { toast.error("Este cliente no tiene correo. Añádelo en Clientes."); return }
    setInviting(true)
    try {
      const status = await inviteCustomer(customer.id)
      setCustomers((list) => list.map((c) => (c.id === customer.id ? { ...c, portal_access: true } : c)))
      toast.success(status === "invited" ? `Invitación enviada a ${customer.email}` : `Ya tenía cuenta: le hemos enviado un enlace para entrar`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setInviting(false)
    }
  }

  const addFiles = async (kind: "photos" | "documents", files: FileList | null) => {
    if (!files?.length || !form) return
    setBusy(kind)
    try {
      const saved = existing ?? (await save(undefined, true))
      if (!saved) return
      const uploaded = await uploadPortalFiles(saved.id, Array.from(files))
      await save({ [kind]: [...form[kind], ...uploaded] } as Partial<PortalCarInput>, true)
      if (kind === "photos") setUrls({ ...urls, ...(await signedUrls(uploaded.map((u) => u.path))) })
      toast.success(kind === "photos" ? "Fotos añadidas" : "Documentos añadidos")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const removeFile = async (kind: "photos" | "documents", file: PortalFile) => {
    if (!form) return
    await removePortalFile(file.path)
    await save({ [kind]: form[kind].filter((f) => f.path !== file.path) } as Partial<PortalCarInput>, true)
  }

  const shareCarDocument = async (doc: { name: string; url: string }) => {
    if (!form) return
    setBusy(doc.url)
    try {
      const saved = existing ?? (await save(undefined, true))
      if (!saved) return
      const file = await copyCarDocument(saved.id, doc)
      await save({ documents: [...form.documents, file] }, true)
      toast.success(`«${doc.name}» compartido con el cliente`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const removeAll = async () => {
    if (!existing || !confirm("¿Dejar de compartir este coche con el cliente? Se borrarán las fotos y documentos añadidos aquí.")) return
    try {
      await deletePortalCar(existing)
      toast.success("El cliente ya no ve este coche")
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const carDocs: { name: string; url: string }[] = (car?.documents ?? []).filter((d: any) => d?.url && !/^https?:/.test(d.url))
  const sharedNames = new Set(form?.documents.map((d) => d.name))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" /> Área del cliente</DialogTitle>
          <DialogDescription>{carTitle} · el cliente lo sigue en {PORTAL_URL.replace(/^https?:\/\//, "")}</DialogDescription>
        </DialogHeader>

        {loading || !form ? (
          <div className="flex justify-center p-12">{loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <p className="text-sm text-muted-foreground">No se pudo cargar.</p>}</div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {/* Cliente */}
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={form.customer_id || undefined} onValueChange={(v) => set("customer_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Elige el cliente (se crean en la pestaña Clientes)" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : " · sin correo"}</SelectItem>)}
                  </SelectContent>
                </Select>
                {customer && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    {!customer.email ? (
                      <p className="text-warning">Este cliente no tiene correo: añádelo en la pestaña Clientes para que pueda entrar.</p>
                    ) : customer.portal_access ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Acceso activado para <b>{customer.email}</b>.</span>
                        <Button type="button" size="sm" variant="outline" disabled={inviting} onClick={sendInvite}>
                          {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />} Reenviar acceso por correo
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => copyText(invitationText(customer.name, customer.email!), "Texto copiado: mándaselo por WhatsApp")}>
                          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar texto
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{customer.email} aún no tiene cuenta en el área de clientes.</span>
                        <Button type="button" size="sm" disabled={inviting} onClick={sendInvite}>
                          {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />} Enviar invitación por correo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Lo que sale solo de la app */}
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-2 font-medium">Lo que verá el cliente (sale solo de la app)</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Datos y fotos del coche: {carTitle || "—"}</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Fase actual: <b className="text-foreground">{STAGE_LABEL[stage] ?? stage}</b> (cambia al mover la tarjeta en el tablero)</li>
                  <li className="flex gap-2">
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${checks?.total ? "text-success" : "text-muted-foreground/40"}`} />
                    {checks?.total
                      ? <>Checks de la inspección: {checks.done} de {checks.total} revisados{checks.photos ? `, ${checks.photos} fotos` : ""}</>
                      : car?.imported_car_id ? "Checks de la inspección: aún no hay (pestaña Checklist)" : "Checks: este coche no viene de Importación"}
                  </li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Nunca se enseñan precios de compra, gastos ni márgenes.</p>
              </div>

              {/* Cómo viaja + nota */}
              <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Cuando esté de camino</Label>
                  <Select value={form.transport_mode || "conduciendo"} onValueChange={(v) => set("transport_mode", v as TransportMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TRANSPORT_LABEL) as TransportMode[]).map((k) => <SelectItem key={k} value={k}>{TRANSPORT_LABEL[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nota para el cliente (opcional)</Label>
                  <Textarea rows={2} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Ej.: Lo recojo el lunes y llegamos el miércoles por la noche." />
                </div>
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> «Camino a» y «Ahora en» se actualizan en la tarjeta del coche, debajo de Trámites de matriculación.</p>

              {/* Fotos extra */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Fotos extra <span className="font-normal text-muted-foreground">(además de las del coche)</span></Label>
                  <Button type="button" size="sm" variant="outline" disabled={busy === "photos"} onClick={() => photoInput.current?.click()}>
                    {busy === "photos" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />} Subir
                  </Button>
                  <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles("photos", e.target.files); e.target.value = "" }} />
                </div>
                {form.photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {form.photos.map((p) => (
                      <div key={p.path} className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                        {urls[p.path] ? <img src={urls[p.path]} alt={p.name} className="h-full w-full object-cover" /> : null}
                        <button type="button" onClick={() => removeFile("photos", p)} title="Quitar"
                          className="absolute right-1 top-1 hidden rounded-full bg-background/90 p-1 text-destructive shadow group-hover:block"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documentos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Documentos para el cliente</Label>
                  <Button type="button" size="sm" variant="outline" disabled={busy === "documents"} onClick={() => docInput.current?.click()}>
                    {busy === "documents" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />} Subir
                  </Button>
                  <input ref={docInput} type="file" accept=".pdf,image/*,.doc,.docx" multiple hidden onChange={(e) => { addFiles("documents", e.target.files); e.target.value = "" }} />
                </div>
                {form.documents.map((d) => (
                  <div key={d.path} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{formatSize(d.size)}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFile("documents", d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {carDocs.length > 0 && (
                  <div className="rounded-lg border border-dashed p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Documentos del coche (el cliente no los ve hasta que los compartas):</p>
                    <div className="space-y-1.5">
                      {carDocs.map((doc) => (
                        <div key={doc.url} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                          {sharedNames.has(doc.name) ? <span className="text-xs text-success">Compartido</span> : (
                            <Button type="button" size="sm" variant="outline" disabled={busy === doc.url} onClick={() => shareCarDocument(doc)}>
                              {busy === doc.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Compartir"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
                {form.published ? "Visible para el cliente" : "Oculto al cliente"}
              </label>
              {existing && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={removeAll}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Dejar de compartir</Button>}
              <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir la web
              </a>
              <Button type="button" onClick={() => save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{existing ? "Guardar" : "Asignar al cliente"}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
