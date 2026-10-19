/**
 * Factura de venta de vehículo: se genera como HTML en una ventana nueva y se imprime
 * (el navegador permite "Guardar como PDF").
 */

export type VatRegime = "rebu" | "general"

export interface InvoiceCompany {
    name: string
    nif: string
    address?: string
    city?: string
    postalCode?: string
    phone?: string
    email?: string
    iban?: string
}

export interface InvoiceCustomer {
    name: string
    nif?: string | null
    address?: string | null
    city?: string | null
    postal_code?: string | null
    email?: string | null
    phone?: string | null
}

export interface InvoiceCar {
    brand: string
    model: string
    year?: number | null
    vin?: string | null
    plate?: string | null
    mileage?: number | null
}

export interface InvoiceData {
    number: string
    date: string
    company: InvoiceCompany
    customer: InvoiceCustomer
    car: InvoiceCar
    /** Precio final de venta, IVA incluido si el régimen es general */
    amount: number
    vatRegime: VatRegime
    notes?: string
}

export const INVOICE_COMPANY_SETTING_KEY = "invoice_company"

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" })

const esc = (value: unknown) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")

export function buildInvoiceHtml(data: InvoiceData): string {
    const { company, customer, car } = data
    const base = data.vatRegime === "general" ? data.amount / 1.21 : data.amount
    const vat = data.vatRegime === "general" ? data.amount - base : 0
    const dateLabel = new Date(data.date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })

    const lines = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).map(p => `<div>${esc(p)}</div>`).join("")

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Factura ${esc(data.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; margin: 0; padding: 48px; font-size: 13px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .muted { color: #6b6b73; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .box { border: 1px solid #e5e5e1; border-radius: 10px; padding: 16px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6b73; margin-bottom: 6px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6b73; border-bottom: 1px solid #e5e5e1; padding: 8px 0; }
  td { padding: 12px 0; border-bottom: 1px solid #f0f0ed; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
  .total { border-top: 2px solid #18181b; margin-top: 6px; padding-top: 10px !important; font-size: 16px; font-weight: 700; }
  .legal { margin-top: 40px; font-size: 11px; color: #6b6b73; border-top: 1px solid #e5e5e1; padding-top: 16px; }
  .noprint { position: fixed; top: 16px; right: 16px; }
  .noprint button { background: #2b4acb; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
  @media print { body { padding: 24px; } .noprint { display: none; } }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <div class="head">
    <div>
      <h1>${esc(company.name || "Tu empresa")}</h1>
      <div class="muted">${lines(company.nif && `NIF: ${company.nif}`, company.address, [company.postalCode, company.city].filter(Boolean).join(" "), company.phone, company.email)}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Factura</div>
      <div style="font-size:18px;font-weight:700">${esc(data.number)}</div>
      <div class="muted">${esc(dateLabel)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div class="label">Cliente</div>
      <div style="font-weight:600">${esc(customer.name)}</div>
      <div class="muted">${lines(customer.nif && `NIF/NIE: ${customer.nif}`, customer.address, [customer.postal_code, customer.city].filter(Boolean).join(" "), customer.phone, customer.email)}</div>
    </div>
    <div class="box">
      <div class="label">Vehículo</div>
      <div style="font-weight:600">${esc(car.brand)} ${esc(car.model)}${car.year ? ` (${esc(car.year)})` : ""}</div>
      <div class="muted">${lines(car.plate && `Matrícula: ${car.plate}`, car.vin && `Bastidor: ${car.vin}`, car.mileage ? `Kilómetros: ${Number(car.mileage).toLocaleString("es-ES")}` : null)}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Concepto</th><th class="num">Importe</th></tr></thead>
    <tbody>
      <tr>
        <td>Venta de vehículo usado ${esc(car.brand)} ${esc(car.model)}${car.plate ? ` · ${esc(car.plate)}` : ""}${data.notes ? `<div class="muted">${esc(data.notes)}</div>` : ""}</td>
        <td class="num">${eur(base)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    ${data.vatRegime === "general"
            ? `<div><span class="muted">Base imponible</span><span class="num">${eur(base)}</span></div>
           <div><span class="muted">IVA 21%</span><span class="num">${eur(vat)}</span></div>`
            : ""}
    <div class="total"><span>Total</span><span class="num">${eur(data.amount)}</span></div>
  </div>

  <div class="legal">
    ${data.vatRegime === "rebu"
            ? "Régimen especial de los bienes usados (art. 135 y siguientes de la Ley 37/1992 del IVA). IVA no desglosado."
            : "Operación sujeta a IVA al tipo general del 21%."}
    ${company.iban ? `<br>Forma de pago: transferencia a ${esc(company.iban)}` : ""}
  </div>
  <script>setTimeout(function(){ window.print() }, 400)</script>
</body></html>`
}

/** Abre la factura en una ventana nueva lista para imprimir. Devuelve false si el navegador bloqueó la ventana. */
export function openInvoice(data: InvoiceData): boolean {
    const win = window.open("", "_blank", "width=900,height=1100")
    if (!win) return false
    win.document.open()
    win.document.write(buildInvoiceHtml(data))
    win.document.close()
    return true
}
