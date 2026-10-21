"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Copy, ExternalLink, FileText, ImagePlus, Loader2, MapPin, Plus, Trash2, Upload, UserRound, X } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Customer } from "@/components/modals/sell-car-modal"
import {
  copyCarDocument, deletePortalCar, invitationText, loadPortalCar, PORTAL_URL, removePortalFile, ROUTE_STATUS_LABEL, savePortalCar,
  signedUrls, STEP_STATUS_LABEL, stepsForLogistic, TRANSPORT_LABEL, uploadPortalFiles,
  type PortalCar, type PortalCarInput, type PortalFile, type PortalStep, type RouteCity, type RouteStatus, type StepStatus, type TransportMode,
} from "@/lib/client-portal"

interface ClientPortalModalProps {
  isOpen: boolean
  onClose: () => void
  /** Coche comprado (inventory_cars, ya formateado por Comprados) */
  car: any
  /** Si se elige cliente aquí, también se guarda en el coche (el mismo cliente sale luego en la factura) */
  onCustomerChange?: (carId: string, customerId: string) => void
}

type CustomerRow = Customer & { portal_access?: boolean }

const formatSize = (n?: number) => (n ? (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`) : "")

async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok) } catch { toast.error("No se pudo copiar") }
}

export function ClientPortalModal({ isOpen, onClose, car, onCustomerChange }: ClientPortalModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [existing, setExisting] = useState<PortalCar | null>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [form, setForm] = useState<PortalCarInput | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const photoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)

  const carTitle = [car?.brand, car?.model].filter(Boolean).join(" ")

  useEffect(() => {
    if (!isOpen || !car?.id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [portal, customersRes, importedRes] = await Promise.all([
          loadPortalCar(car.id),
          supabase.from("customers").select("*").order("name"),
          car.imported_car_id
            ? supabase.from("imported_cars").select("origin, location, color, mileage").eq("id", car.imported_car_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        setCustomers((customersRes.data as CustomerRow[]) ?? [])
        setExisting(portal)
        const imported = (importedRes as { data: any }).data
        setForm(portal ? { ...portal } : {
          inventory_car_id: car.id,
          customer_id: car.customer_id ?? "",
          title: `${carTitle}`.trim(),
          year: car.year ?? null,
          mileage: car.mileage ?? imported?.mileage ?? null,
          color: imported?.color ?? null,
          origin: imported?.location || imported?.origin || null,
          destination: "España",
          status_text: null,
          current_location: imported?.location ?? null,
          transport_mode: "",
          route: [],
          steps: stepsForLogistic(car.logistic_status),
          photos: [],
          documents: [],
          published: true,
        })
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
  const setStep = (i: number, patch: Partial<PortalStep>) => set("steps", form!.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const setCity = (i: number, patch: Partial<RouteCity>) => set("route", form!.route.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  /** Guarda (crea la ficha la primera vez). Devuelve la ficha guardada. */
  const save = async (override?: Partial<PortalCarInput>, quiet = false): Promise<PortalCar | null> => {
    if (!form) return null
    const next = { ...form, ...override }
    if (!next.customer_id) { toast.error("Elige primero el cliente"); return null }
    setSaving(true)
    try {
      const saved = await savePortalCar(existing, next)
      setExisting(saved)
      setForm({ ...saved })
      if (next.customer_id !== car.customer_id) {
        await supabase.from("inventory_cars").update({ customer_id: next.customer_id }).eq("id", car.id)
        onCustomerChange?.(car.id, next.customer_id)
      }
      if (!quiet) toast.success("Área del cliente guardada")
      return saved
    } catch (e: any) {
      toast.error(e.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  const enablePortal = async () => {
    if (!customer) return
    if (!customer.email) { toast.error("Este cliente no tiene correo. Añádelo en Clientes."); return }
    const { error } = await supabase.from("customers").update({ portal_access: true }).eq("id", customer.id)
    if (error) { toast.error(/portal_access/.test(error.message) ? "Falta ejecutar supabase/2026-10_area_clientes.sql" : error.message); return }
    setCustomers((list) => list.map((c) => (c.id === customer.id ? { ...c, portal_access: true } : c)))
    toast.success("Acceso activado. Mándale la invitación.")
  }

  const addFiles = async (kind: "photos" | "documents", files: FileList | null) => {
    if (!files?.length || !form) return
    setBusy(kind)
    try {
      const saved = existing ?? (await save(undefined, true))
      if (!saved) return
      const uploaded = await uploadPortalFiles(saved.id, Array.from(files))
      const list = [...form[kind], ...uploaded]
      await save({ [kind]: list } as Partial<PortalCarInput>, true)
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
    if (!existing || !confirm("¿Quitar el área de cliente de este coche? El cliente dejará de verlo y se borrarán sus fotos y documentos del área.")) return
    try {
      await deletePortalCar(existing)
      toast.success("Área del cliente eliminada")
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const carDocs: { name: string; url: string }[] = (car?.documents ?? []).filter((d: any) => d?.url && !/^https?:/.test(d.url))
  const sharedNames = new Set(form?.documents.map((d) => d.name))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" /> Área del cliente</DialogTitle>
          <DialogDescription>{carTitle} · lo que el cliente ve en {PORTAL_URL.replace(/^https?:\/\//, "")}</DialogDescription>
        </DialogHeader>

        {loading || !form ? (
          <div className="flex justify-center p-12">{loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <p className="text-sm text-muted-foreground">No se pudo cargar.</p>}</div>
        ) : (
          <>
            <Tabs defaultValue="client" className="flex min-h-0 flex-1 flex-col">
              <div className="border-b px-5 py-3">
                <TabsList>
                  <TabsTrigger value="client">Cliente y ficha</TabsTrigger>
                  <TabsTrigger value="steps">Estado y ruta</TabsTrigger>
                  <TabsTrigger value="files">Fotos y documentos{form.photos.length + form.documents.length ? ` (${form.photos.length + form.documents.length})` : ""}</TabsTrigger>
                </TabsList>
              </div>

              {/* ---------- Cliente y ficha ---------- */}
              <TabsContent value="client" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
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
                          <Button type="button" size="sm" variant="outline" onClick={() => copyText(invitationText(customer.name, customer.email!), "Invitación copiada: mándasela por WhatsApp o correo")}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar invitación
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{customer.email} aún no tiene acceso al área de clientes.</span>
                          <Button type="button" size="sm" onClick={enablePortal}>Activar acceso</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Coche (como lo verá el cliente)" className="sm:col-span-2"><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
                  <Field label="Año"><Input type="number" value={form.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></Field>
                  <Field label="Kilómetros"><Input type="number" value={form.mileage ?? ""} onChange={(e) => set("mileage", e.target.value ? Number(e.target.value) : null)} /></Field>
                  <Field label="Color"><Input value={form.color ?? ""} onChange={(e) => set("color", e.target.value || null)} /></Field>
                  <Field label="Origen"><Input value={form.origin ?? ""} onChange={(e) => set("origin", e.target.value || null)} placeholder="Frankfurt, Alemania" /></Field>
                  <Field label="Destino"><Input value={form.destination ?? ""} onChange={(e) => set("destination", e.target.value || null)} placeholder="Madrid, España" /></Field>
                </div>
              </TabsContent>

              {/* ---------- Estado y ruta ---------- */}
              <TabsContent value="steps" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Titular del estado"><Input value={form.status_text ?? ""} onChange={(e) => set("status_text", e.target.value || null)} placeholder="En transporte" /></Field>
                  <Field label="Dónde está ahora"><Input value={form.current_location ?? ""} onChange={(e) => set("current_location", e.target.value || null)} placeholder="Burdeos, Francia" /></Field>
                  <Field label="Cómo viaja">
                    <Select value={form.transport_mode || "none"} onValueChange={(v) => set("transport_mode", (v === "none" ? "" : v) as TransportMode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {(Object.keys(TRANSPORT_LABEL) as (keyof typeof TRANSPORT_LABEL)[]).map((k) => <SelectItem key={k} value={k}>{TRANSPORT_LABEL[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="space-y-2">
                  <Label>Pasos</Label>
                  {form.steps.map((step, i) => (
                    <div key={step.key} className="space-y-2 rounded-lg border p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_8rem]">
                        <Input value={step.title} onChange={(e) => setStep(i, { title: e.target.value })} className="font-medium" />
                        <Select value={step.status} onValueChange={(v) => setStep(i, { status: v as StepStatus })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{(Object.keys(STEP_STATUS_LABEL) as StepStatus[]).map((s) => <SelectItem key={s} value={s}>{STEP_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input value={step.date ?? ""} onChange={(e) => setStep(i, { date: e.target.value })} placeholder="12/05/2026" />
                      </div>
                      <Textarea rows={2} value={step.note ?? ""} onChange={(e) => setStep(i, { note: e.target.value })} placeholder="Lo que quieres contarle al cliente de este paso (opcional)" />
                      <Textarea rows={2} value={(step.bullets ?? []).join("\n")} onChange={(e) => setStep(i, { bullets: e.target.value.split("\n").filter((l) => l.trim()) })}
                        placeholder="Puntos sueltos, uno por línea (opcional): Frenos revisados, Neumáticos al 70 %…" />
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Ruta (mapa del cliente)</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => set("route", [...form.route, { name: "", status: "pending" }])}><Plus className="mr-1 h-3.5 w-3.5" /> Ciudad</Button>
                  </div>
                  {form.route.length === 0 && <p className="text-xs text-muted-foreground">Añade las ciudades del viaje en orden (origen, paradas y destino) y marca dónde está ahora.</p>}
                  {form.route.map((city, i) => (
                    <div key={i} className="grid grid-cols-[1fr_8rem_8rem_auto] gap-2">
                      <Input value={city.name} onChange={(e) => setCity(i, { name: e.target.value })} placeholder="Frankfurt" />
                      <Input value={city.label ?? ""} onChange={(e) => setCity(i, { label: e.target.value })} placeholder="Origen" />
                      <Select value={city.status} onValueChange={(v) => setCity(i, { status: v as RouteStatus })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(ROUTE_STATUS_LABEL) as RouteStatus[]).map((s) => <SelectItem key={s} value={s}>{ROUTE_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" onClick={() => set("route", form.route.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* ---------- Fotos y documentos ---------- */}
              <TabsContent value="files" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Fotos</Label>
                    <Button type="button" size="sm" variant="outline" disabled={busy === "photos"} onClick={() => photoInput.current?.click()}>
                      {busy === "photos" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />} Subir fotos
                    </Button>
                    <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles("photos", e.target.files); e.target.value = "" }} />
                  </div>
                  {form.photos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Fotos del coche, de la inspección, de la carga en el camión… El cliente las ve en su área.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Documentos</Label>
                    <Button type="button" size="sm" variant="outline" disabled={busy === "documents"} onClick={() => docInput.current?.click()}>
                      {busy === "documents" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />} Subir documentos
                    </Button>
                    <input ref={docInput} type="file" accept=".pdf,image/*,.doc,.docx" multiple hidden onChange={(e) => { addFiles("documents", e.target.files); e.target.value = "" }} />
                  </div>
                  {form.documents.length === 0 && <p className="text-xs text-muted-foreground">Contrato, informe de inspección, permiso de circulación escaneado… Solo este cliente puede abrirlos.</p>}
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
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Documentos que ya tienes en este coche (no los ve el cliente hasta que los compartas):</p>
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
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3 border-t p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
                {form.published ? "Visible para el cliente" : "Oculto al cliente"}
              </label>
              {existing && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={removeAll}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar área</Button>}
              <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir la web
              </a>
              <Button type="button" onClick={() => save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
