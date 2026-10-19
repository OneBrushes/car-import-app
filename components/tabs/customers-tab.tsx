"use client"

import { useEffect, useMemo, useState } from "react"
import { Building2, Loader2, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Customer, NewCustomer } from "@/components/modals/sell-car-modal"
import { INVOICE_COMPANY_SETTING_KEY, type InvoiceCompany } from "@/lib/invoice"
import { getInvoiceCompany } from "@/lib/sales"

interface Sale {
  id: string
  customer_id: string
  brand: string
  model: string
  year: number | null
  sell_price: number | null
  date_sold: string | null
  invoice_number: string | null
}

const EMPTY: NewCustomer = { name: "", nif: "", email: "", phone: "", address: "", city: "", postal_code: "", notes: "" }
const EMPTY_COMPANY: InvoiceCompany = { name: "", nif: "", address: "", city: "", postalCode: "", phone: "", email: "", iban: "" }

const eur = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"

export function CustomersTab({ role }: { role?: string | null }) {
  const { user } = useAuth()
  const isAdmin = role === "admin" || role === "super_admin"
  const canEdit = role !== "usuario"

  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<NewCustomer>(EMPTY)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [company, setCompany] = useState<InvoiceCompany>(EMPTY_COMPANY)
  const [companyOpen, setCompanyOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    const [c, s] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("inventory_cars")
        .select("id, customer_id, brand, model, year, sell_price, date_sold, invoice_number")
        .not("customer_id", "is", null)
        .order("date_sold", { ascending: false }),
    ])
    if (c.error) toast.error("Error al cargar clientes. ¿Has ejecutado el script SQL nuevo en Supabase?")
    setCustomers((c.data as Customer[]) || [])
    setSales((s.data as Sale[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!user) return
    load()
    getInvoiceCompany().then(value => { if (value) setCompany({ ...EMPTY_COMPANY, ...value }) })
  }, [user])

  const salesByCustomer = useMemo(() => {
    const map = new Map<string, Sale[]>()
    for (const sale of sales) {
      const list = map.get(sale.customer_id) || []
      list.push(sale)
      map.set(sale.customer_id, list)
    }
    return map
  }, [sales])

  const filtered = customers.filter(c => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [c.name, c.nif, c.email, c.phone, c.city].some(v => v?.toLowerCase().includes(q))
  })

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  const openEdit = (customer: Customer) => {
    setEditing(customer)
    setForm({
      name: customer.name,
      nif: customer.nif ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      city: customer.city ?? "",
      postal_code: customer.postal_code ?? "",
      notes: customer.notes ?? "",
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    setSaving(true)
    const payload = { ...form, name: form.name.trim() }
    const { error } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing.id)
      : await supabase.from("customers").insert(payload)
    setSaving(false)
    if (error) {
      toast.error("No se pudo guardar: " + error.message)
      return
    }
    toast.success(editing ? "Cliente actualizado" : "Cliente añadido")
    setDialogOpen(false)
    load()
  }

  const remove = async (customer: Customer) => {
    const count = salesByCustomer.get(customer.id)?.length ?? 0
    const warning = count > 0 ? ` Tiene ${count} venta(s): seguirán registradas pero sin cliente.` : ""
    if (!confirm(`¿Eliminar a ${customer.name}?${warning}`)) return
    const { error } = await supabase.from("customers").delete().eq("id", customer.id)
    if (error) {
      toast.error("No se pudo eliminar: " + error.message)
      return
    }
    toast.success("Cliente eliminado")
    load()
  }

  const saveCompany = async () => {
    if (!company.name.trim() || !company.nif.trim()) {
      toast.error("Nombre y NIF son obligatorios para facturar")
      return
    }
    const { error } = await supabase
      .from("company_settings")
      .upsert({ key: INVOICE_COMPANY_SETTING_KEY, value: company, updated_at: new Date().toISOString() })
    if (error) {
      toast.error("No se pudieron guardar los datos: " + error.message)
      return
    }
    toast.success("Datos de facturación guardados")
    setCompanyOpen(false)
  }

  const setField = (key: keyof NewCustomer, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const setCompanyField = (key: keyof InvoiceCompany, value: string) => setCompany(prev => ({ ...prev, [key]: value }))

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Clientes</h2>
          <p className="text-muted-foreground">Compradores, su historial de compras y los datos para facturar</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setCompanyOpen(true)}>
              <Building2 className="h-4 w-4" /> Datos de facturación
            </Button>
          )}
          {canEdit && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Nuevo cliente
            </Button>
          )}
        </div>
      </div>

      {isAdmin && (!company.name || !company.nif) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <span>Completa los datos de facturación de la empresa para poder emitir facturas.</span>
          <Button size="sm" variant="outline" onClick={() => setCompanyOpen(true)}>Completar</Button>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, NIF, email…" className="pl-8" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
          <Users className="mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="font-medium">{customers.length === 0 ? "Todavía no hay clientes" : "Sin resultados"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Se crean al vender un coche o desde aquí.</p>
          {canEdit && customers.length === 0 && (
            <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4" /> Nuevo cliente</Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(customer => {
            const customerSales = salesByCustomer.get(customer.id) || []
            const total = customerSales.reduce((sum, s) => sum + (Number(s.sell_price) || 0), 0)
            return (
              <div key={customer.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{[customer.nif, customer.city].filter(Boolean).join(" · ") || "Sin NIF"}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => openEdit(customer)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(customer)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-2 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{customer.phone}</a>}
                  {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-2 truncate hover:text-foreground"><Mail className="h-3.5 w-3.5" />{customer.email}</a>}
                </div>

                <div className="mt-4 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium uppercase tracking-wider text-muted-foreground">Compras</span>
                    {customerSales.length > 0 && <span className="tabular font-medium">{eur(total)}</span>}
                  </div>
                  {customerSales.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin compras registradas</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {customerSales.slice(0, 4).map(sale => (
                        <li key={sale.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{sale.brand} {sale.model}{sale.year ? ` (${sale.year})` : ""}</span>
                          <span className="tabular shrink-0 text-muted-foreground">
                            {sale.date_sold ? new Date(sale.date_sold).toLocaleDateString("es-ES") : ""}
                          </span>
                        </li>
                      ))}
                      {customerSales.length > 4 && <li className="text-xs text-muted-foreground">y {customerSales.length - 4} más</li>}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Alta / edición de cliente */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>Los datos aparecen en las facturas de venta.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre o razón social *" className="col-span-2"><Input value={form.name} onChange={e => setField("name", e.target.value)} /></Field>
            <Field label="NIF / NIE"><Input value={form.nif ?? ""} onChange={e => setField("nif", e.target.value.toUpperCase())} /></Field>
            <Field label="Teléfono"><Input value={form.phone ?? ""} onChange={e => setField("phone", e.target.value)} /></Field>
            <Field label="Email" className="col-span-2"><Input type="email" value={form.email ?? ""} onChange={e => setField("email", e.target.value)} /></Field>
            <Field label="Dirección" className="col-span-2"><Input value={form.address ?? ""} onChange={e => setField("address", e.target.value)} /></Field>
            <Field label="Código postal"><Input value={form.postal_code ?? ""} onChange={e => setField("postal_code", e.target.value)} /></Field>
            <Field label="Ciudad"><Input value={form.city ?? ""} onChange={e => setField("city", e.target.value)} /></Field>
            <Field label="Notas" className="col-span-2"><Textarea rows={3} value={form.notes ?? ""} onChange={e => setField("notes", e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Datos de la empresa para facturas */}
      <Dialog open={companyOpen} onOpenChange={setCompanyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Datos de facturación</DialogTitle>
            <DialogDescription>Aparecen como emisor en todas las facturas de venta.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Razón social *" className="col-span-2"><Input value={company.name} onChange={e => setCompanyField("name", e.target.value)} /></Field>
            <Field label="NIF / CIF *"><Input value={company.nif} onChange={e => setCompanyField("nif", e.target.value.toUpperCase())} /></Field>
            <Field label="Teléfono"><Input value={company.phone ?? ""} onChange={e => setCompanyField("phone", e.target.value)} /></Field>
            <Field label="Email" className="col-span-2"><Input type="email" value={company.email ?? ""} onChange={e => setCompanyField("email", e.target.value)} /></Field>
            <Field label="Dirección" className="col-span-2"><Input value={company.address ?? ""} onChange={e => setCompanyField("address", e.target.value)} /></Field>
            <Field label="Código postal"><Input value={company.postalCode ?? ""} onChange={e => setCompanyField("postalCode", e.target.value)} /></Field>
            <Field label="Ciudad"><Input value={company.city ?? ""} onChange={e => setCompanyField("city", e.target.value)} /></Field>
            <Field label="IBAN para transferencias" className="col-span-2"><Input value={company.iban ?? ""} onChange={e => setCompanyField("iban", e.target.value.toUpperCase())} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyOpen(false)}>Cancelar</Button>
            <Button onClick={saveCompany}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-[13px]">{label}</Label>
      {children}
    </div>
  )
}
