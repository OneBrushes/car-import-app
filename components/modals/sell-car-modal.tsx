"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { UserPlus, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { VatRegime } from "@/lib/invoice"

export interface Customer {
  id: string
  name: string
  nif?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  postal_code?: string | null
  notes?: string | null
  /** Puede entrar en el área de clientes de la web con su correo */
  portal_access?: boolean
  user_id?: string
  created_at?: string
}

export type NewCustomer = Omit<Customer, "id" | "user_id" | "created_at">

export interface SellCarData {
  sellPrice: number
  dateSold: string
  buyer: string
  customerId: string | null
  newCustomer: NewCustomer | null
  vatRegime: VatRegime
  plate: string
  vin: string
  generateInvoice: boolean
}

interface SellCarModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: SellCarData) => void
  car: any
}

const EMPTY_CUSTOMER: NewCustomer = { name: "", nif: "", email: "", phone: "", address: "", city: "", postal_code: "" }

export function SellCarModal({ isOpen, onClose, onSubmit, car }: SellCarModalProps) {
  const [sellPrice, setSellPrice] = useState("")
  const [dateSold, setDateSold] = useState(new Date().toISOString().split("T")[0])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<"existing" | "new" | "none">("none")
  const [customerId, setCustomerId] = useState("")
  const [newCustomer, setNewCustomer] = useState<NewCustomer>(EMPTY_CUSTOMER)
  const [vatRegime, setVatRegime] = useState<VatRegime>("rebu")
  const [plate, setPlate] = useState("")
  const [vin, setVin] = useState("")
  const [generateInvoice, setGenerateInvoice] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setSellPrice("")
    setDateSold(new Date().toISOString().split("T")[0])
    setCustomerId("")
    setNewCustomer(EMPTY_CUSTOMER)
    setPlate(car?.plate || "")
    setVin(car?.vin || "")
    supabase
      .from("customers")
      .select("*")
      .order("name")
      .then(({ data }) => {
        const list = (data as Customer[]) || []
        setCustomers(list)
        setCustomerMode(list.length > 0 ? "existing" : "new")
      })
  }, [isOpen])

  if (!car) return null

  const totalInvested =
    car.initialPrice + car.initialExpenses + car.expenses.reduce((sum: number, e: any) => sum + e.amount, 0)

  const price = Number.parseFloat(sellPrice)
  const profit = sellPrice ? price - totalInvested : 0
  const profitPercentage = sellPrice && totalInvested > 0 ? (profit / totalInvested) * 100 : 0

  const selectedCustomer = customers.find(c => c.id === customerId)
  const buyerName = customerMode === "existing" ? selectedCustomer?.name ?? "" : customerMode === "new" ? newCustomer.name : ""
  const customerValid =
    customerMode === "none" ||
    (customerMode === "existing" && !!customerId) ||
    (customerMode === "new" && newCustomer.name.trim().length > 0)
  const canSubmit = !!sellPrice && price > 0 && customerValid && (!generateInvoice || customerMode !== "none")

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    onSubmit({
      sellPrice: price,
      dateSold,
      buyer: buyerName,
      customerId: customerMode === "existing" ? customerId : null,
      newCustomer: customerMode === "new" ? { ...newCustomer, name: newCustomer.name.trim() } : null,
      vatRegime,
      plate: plate.trim(),
      vin: vin.trim(),
      generateInvoice: generateInvoice && customerMode !== "none",
    })
  }

  const setField = (key: keyof NewCustomer, value: string) => setNewCustomer(prev => ({ ...prev, [key]: value }))
  const eur = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marcar como vendido</DialogTitle>
          <DialogDescription>
            {car.brand} {car.model} {car.year ? `(${car.year})` : ""} · inversión total <span className="tabular font-medium text-foreground">{eur(totalInvested)}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Precio de venta (€)</Label>
              <Input type="number" inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="24.900" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Fecha de venta</Label>
              <Input type="date" value={dateSold} onChange={(e) => setDateSold(e.target.value)} />
            </div>
          </div>

          {sellPrice && (
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${profit >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              <span className="font-medium">Beneficio</span>
              <span className="tabular font-semibold">
                {profit >= 0 ? "+" : ""}{eur(profit)} · {profitPercentage >= 0 ? "+" : ""}{profitPercentage.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Cliente */}
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Cliente</p>
              <div className="flex rounded-md bg-muted p-0.5 text-xs">
                {customers.length > 0 && (
                  <button type="button" onClick={() => setCustomerMode("existing")} className={`flex items-center gap-1 rounded px-2 py-1 ${customerMode === "existing" ? "bg-background shadow-xs font-medium" : "text-muted-foreground"}`}>
                    <Users className="h-3.5 w-3.5" /> Existente
                  </button>
                )}
                <button type="button" onClick={() => setCustomerMode("new")} className={`flex items-center gap-1 rounded px-2 py-1 ${customerMode === "new" ? "bg-background shadow-xs font-medium" : "text-muted-foreground"}`}>
                  <UserPlus className="h-3.5 w-3.5" /> Nuevo
                </button>
                <button type="button" onClick={() => setCustomerMode("none")} className={`rounded px-2 py-1 ${customerMode === "none" ? "bg-background shadow-xs font-medium" : "text-muted-foreground"}`}>
                  Sin cliente
                </button>
              </div>
            </div>

            {customerMode === "existing" && (
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Elige un cliente" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.nif ? ` · ${c.nif}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {customerMode === "new" && (
              <div className="grid grid-cols-2 gap-3">
                <Input className="col-span-2" placeholder="Nombre o razón social *" value={newCustomer.name} onChange={e => setField("name", e.target.value)} />
                <Input placeholder="NIF / NIE" value={newCustomer.nif ?? ""} onChange={e => setField("nif", e.target.value)} />
                <Input placeholder="Teléfono" value={newCustomer.phone ?? ""} onChange={e => setField("phone", e.target.value)} />
                <Input className="col-span-2" type="email" placeholder="Email" value={newCustomer.email ?? ""} onChange={e => setField("email", e.target.value)} />
                <Input className="col-span-2" placeholder="Dirección" value={newCustomer.address ?? ""} onChange={e => setField("address", e.target.value)} />
                <Input placeholder="Código postal" value={newCustomer.postal_code ?? ""} onChange={e => setField("postal_code", e.target.value)} />
                <Input placeholder="Ciudad" value={newCustomer.city ?? ""} onChange={e => setField("city", e.target.value)} />
              </div>
            )}
          </div>

          {/* Factura */}
          <div className="space-y-3 rounded-xl border p-4">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Generar factura</span>
              <Switch checked={generateInvoice} onCheckedChange={setGenerateInvoice} />
            </label>
            {generateInvoice && (
              <>
                {customerMode === "none" && <p className="text-xs text-warning">Para facturar hace falta un cliente.</p>}
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Matrícula" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} />
                  <Input placeholder="Nº de bastidor (VIN)" value={vin} onChange={e => setVin(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Régimen de IVA</Label>
                  <Select value={vatRegime} onValueChange={v => setVatRegime(v as VatRegime)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rebu">REBU (bienes usados, IVA no desglosado)</SelectItem>
                      <SelectItem value="general">IVA general 21% (incluido en el precio)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => handleSubmit()} disabled={!canSubmit}>Confirmar venta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
