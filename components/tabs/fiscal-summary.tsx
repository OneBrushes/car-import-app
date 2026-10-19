"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Download, Info, Landmark, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { computeSale, computeTotals, currentQuarter, quarterRange, type SaleLine } from "@/lib/fiscal"

const eur = (n: number, decimals = 2) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export function FiscalSummary({ isActive = true }: { isActive?: boolean }) {
  const { user } = useAuth()
  const now = currentQuarter()
  const [year, setYear] = useState(now.year)
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(now.quarter)
  const [lines, setLines] = useState<SaleLine[]>([])
  const [purchases, setPurchases] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [globalExpenses, setGlobalExpenses] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const range = quarterRange(year, quarter)

  useEffect(() => {
    if (!user || !isActive) return
    const load = async () => {
      setLoading(true)
      const [sold, bought, expenses] = await Promise.all([
        supabase
          .from("inventory_cars")
          .select("id, brand, model, plate, date_sold, sell_price, initial_price, vat_regime, invoice_number, buyer, customer:customers(name, nif)")
          .eq("status", "sold")
          .gte("date_sold", range.from)
          .lte("date_sold", range.to)
          .order("date_sold"),
        supabase
          .from("inventory_cars")
          .select("initial_price")
          .gte("date_purchased", range.from)
          .lte("date_purchased", range.to),
        supabase
          .from("global_expenses")
          .select("amount")
          .gte("date", range.from)
          .lte("date", range.to),
      ])
      if (sold.error) toast.error("Error al cargar las ventas")
      setLines(((sold.data as any[]) || []).map(computeSale))
      setPurchases({
        count: bought.data?.length ?? 0,
        total: (bought.data || []).reduce((s: number, c: any) => s + (Number(c.initial_price) || 0), 0),
      })
      setGlobalExpenses(expenses.error ? null : (expenses.data || []).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0))
      setLoading(false)
    }
    load()
  }, [user, isActive, year, quarter])

  const totals = useMemo(() => computeTotals(lines), [lines])
  const years = Array.from({ length: 6 }, (_, i) => now.year - i)

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet(`${quarter}T ${year}`)
    sheet.columns = [
      { header: "Fecha", key: "date", width: 12, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Factura", key: "invoice", width: 14 },
      { header: "Vehículo", key: "car", width: 28 },
      { header: "Matrícula", key: "plate", width: 11 },
      { header: "Cliente", key: "customer", width: 26 },
      { header: "NIF", key: "nif", width: 12 },
      { header: "Régimen", key: "regime", width: 12 },
      { header: "Precio venta", key: "price", width: 14, style: { numFmt: '#,##0.00 "€"' } },
      { header: "Precio compra", key: "purchase", width: 14, style: { numFmt: '#,##0.00 "€"' } },
      { header: "Margen (REBU)", key: "margin", width: 14, style: { numFmt: '#,##0.00 "€"' } },
      { header: "Base imponible", key: "base", width: 14, style: { numFmt: '#,##0.00 "€"' } },
      { header: "Cuota IVA 21%", key: "vat", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    ]
    for (const l of lines) {
      sheet.addRow({
        date: new Date(l.date_sold),
        invoice: l.invoice_number,
        car: `${l.brand} ${l.model}`,
        plate: l.plate,
        customer: l.customer?.name ?? l.buyer,
        nif: l.customer?.nif,
        regime: l.regime === "general" ? "General 21%" : `REBU${l.regimeMissing ? " (sin indicar)" : ""}`,
        price: l.sell_price,
        purchase: l.initial_price,
        margin: l.margin,
        base: l.base,
        vat: l.vat,
      })
    }
    const total = sheet.addRow({ car: "TOTAL", price: totals.salesTotal, margin: totals.rebu.margin, base: totals.base, vat: totals.vat })
    total.font = { bold: true }
    sheet.getRow(1).font = { bold: true }
    const buffer = await wb.xlsx.writeBuffer()
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    link.download = `NorDrive_fiscal_${year}_${quarter}T.xlsx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Resumen fiscal</h2>
          <p className="text-muted-foreground">IVA de las ventas del trimestre, listo para tu gestoría</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(quarter)} onValueChange={v => setQuarter(Number(v) as 1 | 2 | 3 | 4)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1T (ene–mar)</SelectItem>
              <SelectItem value="2">2T (abr–jun)</SelectItem>
              <SelectItem value="3">3T (jul–sep)</SelectItem>
              <SelectItem value="4">4T (oct–dic)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => toast.promise(exportExcel(), { loading: "Preparando Excel…", success: "Excel descargado", error: "No se pudo exportar" })} disabled={loading || lines.length === 0}>
            <Download className="h-4 w-4" /> Excel para la gestoría
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Ventas del trimestre" value={eur(totals.salesTotal, 0)} sub={`${totals.salesCount} coche(s)`} />
            <Stat label="Base imponible 21%" value={eur(totals.base)} sub="Modelo 303 · casilla 07" />
            <Stat label="Cuota de IVA 21%" value={eur(totals.vat)} sub="Modelo 303 · casilla 09" highlight />
            <Stat label="Compras del trimestre" value={eur(purchases.total, 0)} sub={`${purchases.count} coche(s)${globalExpenses != null ? ` · gastos generales ${eur(globalExpenses, 0)}` : ""}`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-xs">
              <p className="text-sm font-semibold">Régimen general (IVA 21% incluido)</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="Ventas" value={`${totals.general.count} · ${eur(totals.general.total)}`} />
                <Row label="Base imponible" value={eur(totals.general.base)} />
                <Row label="Cuota IVA" value={eur(totals.general.vat)} strong />
              </dl>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-xs">
              <p className="text-sm font-semibold">REBU (IVA sobre el margen)</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="Ventas" value={`${totals.rebu.count} · ${eur(totals.rebu.total)}`} />
                <Row label="Margen total" value={eur(totals.rebu.margin)} />
                <Row label="Base imponible" value={eur(totals.rebu.base)} />
                <Row label="Cuota IVA" value={eur(totals.rebu.vat)} strong />
              </dl>
              {totals.rebu.negativeMargins > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">{totals.rebu.negativeMargins} venta(s) con margen negativo: tributan 0 y no compensan al resto.</p>
              )}
            </div>
          </div>

          {totals.missingRegime > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>{totals.missingRegime} venta(s) no tienen régimen de IVA indicado y se han calculado como REBU. Revísalas con tu gestoría.</p>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-center">
                <Landmark className="mb-3 h-10 w-10 text-muted-foreground/60" />
                <p className="font-medium">Sin ventas en {quarter}T {year}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Fecha</th>
                      <th className="px-4 py-2.5 font-medium">Vehículo</th>
                      <th className="px-4 py-2.5 font-medium">Cliente</th>
                      <th className="px-4 py-2.5 font-medium">Régimen</th>
                      <th className="px-4 py-2.5 text-right font-medium">Venta</th>
                      <th className="px-4 py-2.5 text-right font-medium">Base</th>
                      <th className="px-4 py-2.5 text-right font-medium">IVA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map(l => (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap px-4 py-2.5">{new Date(l.date_sold).toLocaleDateString("es-ES")}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{l.brand} {l.model}</span>
                          {l.invoice_number && <span className="block text-xs text-muted-foreground">{l.invoice_number}</span>}
                        </td>
                        <td className="px-4 py-2.5">{l.customer?.name ?? l.buyer ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.regime === "general" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {l.regime === "general" ? "General" : "REBU"}{l.regimeMissing ? "*" : ""}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">{eur(l.sell_price)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">{eur(l.base)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium">{eur(l.vat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-xl border bg-card p-4 text-xs text-muted-foreground shadow-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              Cálculo orientativo. En REBU el margen es precio de venta menos precio de compra del coche (sin transporte ni otros gastos)
              y se calcula venta a venta. No incluye el IVA soportado de tus compras y gastos, que tu gestoría descontará en el modelo 303.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={`tabular mt-1.5 text-xl font-semibold tracking-tight ${highlight ? "text-primary" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  )
}
