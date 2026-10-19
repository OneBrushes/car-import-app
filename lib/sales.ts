import { supabase } from "@/lib/supabase"
import { INVOICE_COMPANY_SETTING_KEY, openInvoice, type InvoiceCompany, type VatRegime } from "@/lib/invoice"
import type { MarkAsBoughtData } from "@/components/modals/mark-as-bought-modal"
import type { SellCarData } from "@/components/modals/sell-car-modal"

/** Pasa un coche de Importación al inventario con su precio y gastos reales. */
export async function markImportedCarAsBought(userId: string, data: MarkAsBoughtData) {
    const { data: importedCar, error: readError } = await supabase
        .from("imported_cars")
        .select("*")
        .eq("id", data.carId)
        .single()
    if (readError || !importedCar) throw new Error("No se encontró el coche de importación")

    const { data: newCar, error } = await supabase
        .from("inventory_cars")
        .insert({
            user_id: userId,
            imported_car_id: importedCar.id,
            brand: importedCar.brand,
            model: importedCar.model,
            year: importedCar.year,
            mileage: importedCar.mileage ?? null,
            initial_price: data.price,
            initial_expenses: data.expenses,
            date_purchased: data.datePurchased,
            status: "inventory",
            logistic_status: "purchased",
        })
        .select()
        .single()
    if (error) throw error
    return newCar
}

export async function getInvoiceCompany(): Promise<InvoiceCompany | null> {
    const { data } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", INVOICE_COMPANY_SETTING_KEY)
        .maybeSingle()
    return (data?.value as InvoiceCompany) ?? null
}

/** Registra la venta (y el cliente nuevo si lo hay). Devuelve el id del cliente usado. */
export async function sellInventoryCar(carId: string, data: SellCarData): Promise<string | null> {
    let customerId = data.customerId
    if (data.newCustomer) {
        const { data: created, error } = await supabase
            .from("customers")
            .insert(data.newCustomer)
            .select("id")
            .single()
        if (error) throw error
        customerId = created.id
    }

    const { error } = await supabase
        .from("inventory_cars")
        .update({
            status: "sold",
            sell_price: data.sellPrice,
            date_sold: data.dateSold || null,
            buyer: data.buyer || null,
            customer_id: customerId,
            vat_regime: data.vatRegime,
            plate: data.plate || null,
            vin: data.vin || null,
        })
        .eq("id", carId)
    if (error) throw error

    return customerId
}

/**
 * Asigna número de factura (si no lo tenía) y la abre para imprimir.
 * Devuelve un mensaje de error legible o null si todo fue bien.
 */
export async function printInvoiceForCar(carId: string): Promise<string | null> {
    const { data: number, error: numberError } = await supabase.rpc("assign_invoice_number", { car: carId })
    if (numberError) return "No se pudo asignar el número de factura: " + numberError.message

    const { data: car, error } = await supabase
        .from("inventory_cars")
        .select("*, customer:customers(*)")
        .eq("id", carId)
        .single()
    if (error || !car) return "No se pudo leer la venta"
    if (!car.customer) return "Esta venta no tiene cliente: añádelo para poder facturar"
    if (!car.sell_price) return "Esta venta no tiene precio"

    const company = await getInvoiceCompany()
    if (!company?.name || !company?.nif) {
        return "Faltan los datos de facturación de la empresa (Clientes → Datos de facturación)"
    }

    const opened = openInvoice({
        number: String(number),
        date: car.invoice_date || car.date_sold || new Date().toISOString().split("T")[0],
        company,
        customer: car.customer,
        car: {
            brand: car.brand,
            model: car.model,
            year: car.year,
            plate: car.plate,
            vin: car.vin,
            mileage: car.mileage,
        },
        amount: Number(car.sell_price),
        vatRegime: (car.vat_regime as VatRegime) || "rebu",
    })
    return opened ? null : "El navegador ha bloqueado la ventana de la factura: permite las ventanas emergentes"
}
