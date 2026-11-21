"use client"

import { useEffect, useMemo, useState } from "react"
import { Calculator, Info, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { calculateImportCost, DEFAULT_IMPORT_COST_SETTINGS, formatEUR, TAX_REGIONS, type ImportCostSettings, type TaxRegion } from "@/lib/import-costs"
import { loadImportCostSettings, saveImportCostSettings } from "@/lib/import-cost-settings"

interface CarOption {
  id: string
  brand: string
  model: string
  year: number | null
  month: number | null
  price: number | null
  co2: number | null
}

const formFromSettings = (settings: ImportCostSettings) => ({
  purchasePrice: "",
  netPrice: "",
  fiscalValueNew: "",
  year: String(new Date().getFullYear() - 3),
  month: "1",
  co2: "",
  payVat: false,
  vatDeductible: false,
  region: settings.region as TaxRegion,
  transport: String(settings.transport),
  itv: String(settings.itv),
  homologation: String(settings.homologation),
  plates: String(settings.plates),
  agency: String(settings.agency),
  other: "0",
  expectedSalePrice: "",
})

type FormState = ReturnType<typeof formFromSettings>

const num = (value: string) => {
  const parsed = parseFloat(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

export function ImportCalculator() {
  const { user, profile } = useAuth()
  const canSaveDefaults = profile?.role === "admin" || profile?.role === "super_admin"
  const [settings, setSettings] = useState<ImportCostSettings>(DEFAULT_IMPORT_COST_SETTINGS)
  const [form, setForm] = useState<FormState>(() => formFromSettings(DEFAULT_IMPORT_COST_SETTINGS))
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [cars, setCars] = useState<CarOption[]>([])
  const [selectedCarId, setSelectedCarId] = useState<string>("")

  useEffect(() => {
    if (!user) return
    supabase
      .from("imported_cars")
      .select("id, brand, model, year, month, price, co2")
      .order("created_at", { ascending: false })
      .then(({ data }) => setCars((data as CarOption[]) || []))
    // Gastos fijos guardados (los mismos que usa el MCP de "Guardados por Claude")
    loadImportCostSettings().then(saved => {
      setSettings(saved)
      setForm(prev => ({
        ...prev,
        region: saved.region,
        transport: String(saved.transport),
        itv: String(saved.itv),
        homologation: String(saved.homologation),
        plates: String(saved.plates),
        agency: String(saved.agency),
      }))
    })
  }, [user])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const loadCar = (id: string) => {
    setSelectedCarId(id)
    const car = cars.find(c => c.id === id)
    if (!car) return
    setForm(prev => ({
      ...prev,
      purchasePrice: car.price != null ? String(car.price) : prev.purchasePrice,
      year: car.year != null ? String(car.year) : prev.year,
      month: car.month != null ? String(car.month) : prev.month,
      co2: car.co2 != null ? String(car.co2) : "",
    }))
  }

  const reset = () => {
    setForm(formFromSettings(settings))
    setSelectedCarId("")
  }

  const saveDefaults = async () => {
    const next: ImportCostSettings = {
      region: form.region,
      transport: num(form.transport),
      itv: num(form.itv),
      homologation: num(form.homologation),
      plates: num(form.plates),
      agency: num(form.agency),
    }
    setSavingDefaults(true)
    try {
      await saveImportCostSettings(next)
      setSettings(next)
      toast.success("Gastos guardados como valores por defecto (Calculadora y Claude)")
    } catch (error: any) {
      toast.error("No se pudieron guardar: " + (error?.message ?? error))
    } finally {
      setSavingDefaults(false)
    }
  }

  const result = useMemo(() => {
    const year = Math.round(num(form.year)) || new Date().getFullYear()
    const month = Math.min(12, Math.max(1, Math.round(num(form.month)) || 1))
    return calculateImportCost({
      purchasePrice: num(form.purchasePrice),
      vatDeductible: form.vatDeductible,
      netPrice: form.netPrice ? num(form.netPrice) : null,
      region: form.region,
      fiscalValueNew: form.fiscalValueNew ? num(form.fiscalValueNew) : null,
      firstRegistration: new Date(year, month - 1, 1),
      co2: form.co2 === "" ? null : num(form.co2),
      payVat: form.payVat,
      transport: num(form.transport),
      itv: num(form.itv),
      homologation: num(form.homologation),
      plates: num(form.plates),
      agency: num(form.agency),
      other: num(form.other),
      expectedSalePrice: form.expectedSalePrice ? num(form.expectedSalePrice) : null,
    })
  }, [form])

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Calculadora de importación</h2>
          <p className="text-muted-foreground">Coste real de traer un coche a España antes de comprarlo</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Reiniciar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Formulario */}
        <div className="space-y-6">
          {cars.length > 0 && (
            <Section title="Partir de un coche guardado">
              <Select value={selectedCarId} onValueChange={loadCar}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elige un coche de Importación (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {cars.map(car => (
                    <SelectItem key={car.id} value={car.id}>
                      {car.brand} {car.model} {car.year ? `(${car.year})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Section>
          )}

          <Section title="Vehículo">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Precio de compra (€)">
                <Input inputMode="decimal" value={form.purchasePrice} onChange={e => set("purchasePrice", e.target.value)} placeholder="18.500" />
              </Field>
              <Field label="Emisiones CO₂ WLTP (g/km)">
                <Input inputMode="numeric" value={form.co2} onChange={e => set("co2", e.target.value)} placeholder="145" />
              </Field>
              <Field label="Año de 1ª matriculación">
                <Input inputMode="numeric" value={form.year} onChange={e => set("year", e.target.value)} />
              </Field>
              <Field label="Mes de 1ª matriculación">
                <Input inputMode="numeric" value={form.month} onChange={e => set("month", e.target.value)} />
              </Field>
              <Field
                label="Valor en tablas de Hacienda, nuevo (€)"
                hint="Opcional. Si lo dejas vacío se usa el precio de compra como base del impuesto."
                className="sm:col-span-2"
              >
                <Input inputMode="decimal" value={form.fiscalValueNew} onChange={e => set("fiscalValueNew", e.target.value)} placeholder="Según la orden anual de precios medios" />
              </Field>
              <Field label="Comunidad donde se matricula" hint="Cambia el tipo del impuesto de matriculación." className="sm:col-span-2">
                <Select value={form.region} onValueChange={v => set("region", v as TaxRegion)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_REGIONS.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <label className="mt-4 flex items-start gap-3 rounded-lg border p-3">
              <Switch checked={form.payVat} onCheckedChange={v => set("payVat", v)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Pagar IVA en España (21%)</span>
                <span className="block text-muted-foreground">
                  Solo si el coche cuenta como «nuevo» a efectos fiscales (menos de 6 meses o 6.000 km) o si el vendedor no aplica REBU.
                </span>
              </span>
            </label>
            <label className="mt-3 flex items-start gap-3 rounded-lg border p-3">
              <Switch checked={form.vatDeductible} onCheckedChange={v => set("vatDeductible", v)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Compro como empresa con IVA deducible</span>
                <span className="block text-muted-foreground">
                  El coste es el precio neto (sin IVA, «MwSt. ausweisbar»). El IVA se autoliquida y se deduce, así que no suma.
                </span>
              </span>
            </label>
            {form.vatDeductible && (
              <div className="mt-3">
                <Field label="Precio neto sin IVA (€)">
                  <Input inputMode="decimal" value={form.netPrice} onChange={e => set("netPrice", e.target.value)} placeholder="15.546" />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Gastos de importación">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Transporte (€)"><Input inputMode="decimal" value={form.transport} onChange={e => set("transport", e.target.value)} /></Field>
              <Field label="ITV (€)"><Input inputMode="decimal" value={form.itv} onChange={e => set("itv", e.target.value)} /></Field>
              <Field label="Homologación (€)"><Input inputMode="decimal" value={form.homologation} onChange={e => set("homologation", e.target.value)} /></Field>
              <Field label="Placas (€)"><Input inputMode="decimal" value={form.plates} onChange={e => set("plates", e.target.value)} /></Field>
              <Field label="Gestoría (€)"><Input inputMode="decimal" value={form.agency} onChange={e => set("agency", e.target.value)} /></Field>
              <Field label="Otros (€)"><Input inputMode="decimal" value={form.other} onChange={e => set("other", e.target.value)} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Valores por defecto: transporte {formatEUR(settings.transport)}, ITV {formatEUR(settings.itv)}, homologación {formatEUR(settings.homologation)},
                placas {formatEUR(settings.plates)}, gestoría {formatEUR(settings.agency)}. También los usa Claude cuando no indica los suyos.
              </p>
              {canSaveDefaults && (
                <Button variant="outline" size="sm" onClick={saveDefaults} disabled={savingDefaults}>
                  <Save className="h-4 w-4" /> Guardar como valores por defecto
                </Button>
              )}
            </div>
          </Section>

          <Section title="Venta">
            <Field label="Precio de venta esperado en España (€)" hint="Opcional. Para ver el margen.">
              <Input inputMode="decimal" value={form.expectedSalePrice} onChange={e => set("expectedSalePrice", e.target.value)} placeholder="24.900" />
            </Field>
          </Section>
        </div>

        {/* Resultado */}
        <div className="lg:sticky lg:top-20 h-fit space-y-4">
          <div className="rounded-xl border bg-card p-5 shadow-xs">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Calculator className="h-4 w-4 text-primary" />
              </div>
              <p className="font-semibold">Resumen</p>
            </div>

            <dl className="space-y-2 text-sm">
              {result.lines.map(line => (
                <div key={line.label} className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {line.label}
                    {line.hint && <span className="block text-xs text-muted-foreground/70">{line.hint}</span>}
                  </dt>
                  <dd className="tabular shrink-0 font-medium">{formatEUR(line.amount, 2)}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex items-end justify-between border-t pt-4">
              <span className="text-sm font-medium">Coste total</span>
              <span className="tabular text-2xl font-semibold tracking-tight">{formatEUR(result.totalCost)}</span>
            </div>

            {result.margin != null && (
              <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${result.margin >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                <span className="font-medium">Margen estimado</span>
                <span className="tabular font-semibold">
                  {formatEUR(result.margin)}{result.marginPercent != null && ` · ${result.marginPercent.toFixed(1)}%`}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground shadow-xs">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <Info className="h-3.5 w-3.5" /> Cómo se calcula
            </p>
            <p>
              Antigüedad: {result.ageYears} años → conserva el {result.depreciation}% de su valor. Tipo del impuesto: {result.taxRate}% (0% hasta 120 g/km,
              4,75% hasta 159, 9,75% hasta 199 y 14,75% desde 200; 16% en Cataluña). Con valor de Hacienda, la base se minora en el IVA y el
              impuesto que ya lleva dentro el coche usado (art. 5.2 Orden HAC/1501/2025). Valores orientativos; Canarias tiene los suyos. Confírmalo con tu gestoría.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-[13px]">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
