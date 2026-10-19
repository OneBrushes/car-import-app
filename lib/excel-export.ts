import { supabase } from "@/lib/supabase"

/**
 * Exporta los datos que el usuario puede ver a un Excel con una hoja por tipo de dato.
 * Las reglas de seguridad de Supabase deciden qué filas entran.
 * exceljs se carga bajo demanda para no engordar la carga inicial de la app.
 */

type Column = { header: string; key: string; width?: number; numFmt?: string }

const EUR = '#,##0 "€";[Red]-#,##0 "€"'
const DATE = "dd/mm/yyyy"

const toDate = (value: unknown) => (value ? new Date(String(value)) : null)
const toNum = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value))

export interface ExportOptions {
    /** Incluir los gastos generales de la empresa (solo roles que los pueden ver) */
    includeGlobalExpenses?: boolean
}

export async function exportToExcel(options: ExportOptions = {}) {
    const ExcelJS = (await import("exceljs")).default
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "NorDrive"
    workbook.created = new Date()

    const addSheet = (name: string, columns: Column[], rows: Record<string, unknown>[]) => {
        const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] })
        sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.numFmt ? { numFmt: c.numFmt } : {} }))
        sheet.addRows(rows)
        const header = sheet.getRow(1)
        header.font = { bold: true }
        header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0ED" } }
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
        return sheet
    }

    const [imported, inventory, customers, globalExpenses] = await Promise.all([
        supabase.from("imported_cars").select("*").order("created_at", { ascending: false }),
        supabase.from("inventory_cars").select("*, expenses:car_expenses(*), customer:customers(name, nif)").order("date_purchased", { ascending: false }),
        supabase.from("customers").select("*").order("name"),
        options.includeGlobalExpenses
            ? supabase.from("global_expenses").select("*").order("date", { ascending: false })
            : Promise.resolve({ data: [] as any[], error: null }),
    ])

    // Inventario y ventas
    addSheet("Inventario y ventas", [
        { header: "Marca", key: "brand" },
        { header: "Modelo", key: "model", width: 22 },
        { header: "Año", key: "year", width: 8 },
        { header: "Matrícula", key: "plate", width: 12 },
        { header: "Bastidor", key: "vin", width: 20 },
        { header: "Estado", key: "status", width: 12 },
        { header: "Fecha compra", key: "date_purchased", numFmt: DATE, width: 13 },
        { header: "Precio compra", key: "initial_price", numFmt: EUR },
        { header: "Gastos iniciales", key: "initial_expenses", numFmt: EUR },
        { header: "Otros gastos", key: "other_expenses", numFmt: EUR },
        { header: "Inversión total", key: "invested", numFmt: EUR },
        { header: "Fecha venta", key: "date_sold", numFmt: DATE, width: 13 },
        { header: "Precio venta", key: "sell_price", numFmt: EUR },
        { header: "Beneficio", key: "profit", numFmt: EUR },
        { header: "Rentabilidad %", key: "profit_pct", numFmt: "0.0", width: 13 },
        { header: "Cliente", key: "customer", width: 24 },
        { header: "NIF cliente", key: "customer_nif", width: 13 },
        { header: "Factura", key: "invoice_number", width: 14 },
        { header: "Régimen IVA", key: "vat_regime", width: 12 },
    ], (inventory.data || []).map((car: any) => {
        const other = (car.expenses || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
        const invested = (Number(car.initial_price) || 0) + (Number(car.initial_expenses) || 0) + other
        const sold = car.status === "sold" && car.sell_price != null
        const profit = sold ? Number(car.sell_price) - invested : null
        return {
            brand: car.brand,
            model: car.model,
            year: car.year,
            plate: car.plate,
            vin: car.vin,
            status: car.status === "sold" ? "Vendido" : "En inventario",
            date_purchased: toDate(car.date_purchased),
            initial_price: toNum(car.initial_price),
            initial_expenses: toNum(car.initial_expenses),
            other_expenses: other,
            invested,
            date_sold: toDate(car.date_sold),
            sell_price: toNum(car.sell_price),
            profit,
            profit_pct: profit != null && invested > 0 ? (profit / invested) * 100 : null,
            customer: car.customer?.name ?? car.buyer ?? null,
            customer_nif: car.customer?.nif ?? null,
            invoice_number: car.invoice_number,
            vat_regime: car.vat_regime === "general" ? "IVA 21%" : car.vat_regime === "rebu" ? "REBU" : null,
        }
    }))

    // Gastos por coche
    addSheet("Gastos por coche", [
        { header: "Coche", key: "car", width: 28 },
        { header: "Fecha", key: "date", numFmt: DATE, width: 12 },
        { header: "Concepto", key: "concept", width: 28 },
        { header: "Categoría", key: "category", width: 18 },
        { header: "Importe", key: "amount", numFmt: EUR },
        { header: "Notas", key: "notes", width: 30 },
    ], (inventory.data || []).flatMap((car: any) =>
        (car.expenses || []).map((e: any) => ({
            car: `${car.brand} ${car.model}${car.plate ? ` (${car.plate})` : ""}`,
            date: toDate(e.date),
            concept: e.concept,
            category: e.category,
            amount: toNum(e.amount),
            notes: e.notes,
        }))
    ))

    // Importación
    addSheet("Importación", [
        { header: "Marca", key: "brand" },
        { header: "Modelo", key: "model", width: 22 },
        { header: "Año", key: "year", width: 8 },
        { header: "Km", key: "mileage", numFmt: "#,##0", width: 10 },
        { header: "CV", key: "cv", width: 8 },
        { header: "CO₂", key: "co2", width: 8 },
        { header: "Origen", key: "origin", width: 12 },
        { header: "Precio", key: "price", numFmt: EUR },
        { header: "Coste total", key: "total_cost", numFmt: EUR },
        { header: "Contactado", key: "contacted", width: 11 },
        { header: "Anuncio", key: "url", width: 40 },
    ], (imported.data || []).map((car: any) => ({
        brand: car.brand,
        model: car.model,
        year: car.year,
        mileage: toNum(car.mileage),
        cv: toNum(car.cv),
        co2: toNum(car.co2),
        origin: car.origin,
        price: toNum(car.price),
        total_cost: toNum(car.total_cost),
        contacted: car.contacted ? "Sí" : "No",
        url: car.url,
    })))

    // Clientes
    addSheet("Clientes", [
        { header: "Nombre", key: "name", width: 28 },
        { header: "NIF", key: "nif", width: 13 },
        { header: "Teléfono", key: "phone", width: 14 },
        { header: "Email", key: "email", width: 26 },
        { header: "Dirección", key: "address", width: 30 },
        { header: "C.P.", key: "postal_code", width: 8 },
        { header: "Ciudad", key: "city", width: 16 },
        { header: "Notas", key: "notes", width: 30 },
    ], (customers.data || []) as any[])

    if (options.includeGlobalExpenses) {
        addSheet("Gastos generales", [
            { header: "Fecha", key: "date", numFmt: DATE, width: 12 },
            { header: "Concepto", key: "title", width: 30 },
            { header: "Categoría", key: "category", width: 22 },
            { header: "Importe", key: "amount", numFmt: EUR },
        ], (globalExpenses.data || []).map((e: any) => ({ date: toDate(e.date), title: e.title, category: e.category, amount: toNum(e.amount) })))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `NorDrive_${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
