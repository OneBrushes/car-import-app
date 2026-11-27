// Coches en "Comprados" (tabla inventory_cars + gastos en car_expenses): lógica compartida por la app y el MCP.
//
// Fases (logistic_status):
//   reserved      → "Reservado": precio negociado y señal pagada, falta pagar el resto. Ya se pueden apuntar gastos
//                   (vuelo, hotel…) aunque el coche aún no esté pagado.
//   purchased     → "Comprado": pagado, por recoger
//   in_transit    → "Transporte"
//   homologation  → "Trámites / ITV"
//   detailing     → "Taller"
//   ready         → "A la venta"

export const LOGISTIC_STAGES = ["reserved", "purchased", "in_transit", "homologation", "detailing", "ready"] as const
export type LogisticStage = (typeof LOGISTIC_STAGES)[number]

export const LOGISTIC_LABELS: Record<LogisticStage, string> = {
    reserved: "Reservado",
    purchased: "Comprado",
    in_transit: "Transporte",
    homologation: "Trámites / ITV",
    detailing: "Taller",
    ready: "A la venta",
}

/** Nombres en español que usa el MCP (Claude) → fase guardada */
export const PURCHASE_STAGE_BY_NAME = {
    reservado: "reserved",
    comprado: "purchased",
    transporte: "in_transit",
    tramites: "homologation",
    taller: "detailing",
    a_la_venta: "ready",
} as const satisfies Record<string, LogisticStage>
export type PurchaseStageName = keyof typeof PURCHASE_STAGE_BY_NAME
export const PURCHASE_STAGE_NAMES = Object.keys(PURCHASE_STAGE_BY_NAME) as [PurchaseStageName, ...PurchaseStageName[]]

export const stageName = (stage: string | null | undefined): PurchaseStageName | null =>
    (Object.entries(PURCHASE_STAGE_BY_NAME).find(([, v]) => v === stage)?.[0] as PurchaseStageName | undefined) ?? null

/** Categorías de gasto (las mismas del desplegable de la app) */
export const EXPENSE_CATEGORIES = [
    "Precio del coche",
    "Viaje",
    "Transporte",
    "ITV",
    "Trámites",
    "Reparación",
    "Mantenimiento",
    "Seguro",
    "Impuestos",
    "Otro",
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface PurchaseExpense {
    id: string
    concept: string
    amount: number | string
    date?: string | null
    category?: string | null
    notes?: string | null
}

export interface PurchaseCar {
    id: string
    brand: string
    model: string
    year?: number | null
    initial_price: number | string | null
    initial_expenses?: number | string | null
    date_purchased?: string | null
    status?: string | null
    logistic_status?: string | null
    senal?: number | string | null
    coche_claude_id?: string | null
    sell_price?: number | string | null
    plate?: string | null
    vin?: string | null
    expenses?: PurchaseExpense[] | null
}

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v))

/** Totales de un coche comprado o reservado */
export function purchaseTotals(car: PurchaseCar) {
    const precio = num(car.initial_price)
    const gastosIniciales = num(car.initial_expenses)
    const gastos = (car.expenses ?? []).reduce((s, e) => s + num(e.amount), 0)
    const reservado = car.logistic_status === "reserved" && car.status !== "sold"
    const senal = num(car.senal)
    return {
        precio,
        gastos: gastosIniciales + gastos,
        invertido: precio + gastosIniciales + gastos,
        reservado,
        senal,
        /** Lo que falta por pagar del coche (solo si está reservado) */
        pendiente: reservado ? Math.max(0, precio - senal) : 0,
        /** Lo que ya ha salido de la cuenta: señal o precio completo + gastos */
        pagado: (reservado ? senal : precio) + gastosIniciales + gastos,
    }
}

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`

/** Etiqueta de la fase para mostrar */
export function purchaseStageLabel(car: Pick<PurchaseCar, "status" | "logistic_status">): string {
    if (car.status === "sold") return "Vendido"
    return LOGISTIC_LABELS[(car.logistic_status ?? "purchased") as LogisticStage] ?? car.logistic_status ?? "Comprado"
}

/** Resumen en texto de un coche de Comprados (para las respuestas del MCP) */
export function purchaseText(car: PurchaseCar): string {
    const t = purchaseTotals(car)
    const lines = [
        `${car.brand} ${car.model}${car.year ? ` (${car.year})` : ""} · ${purchaseStageLabel(car)} · id ${car.id}`,
        t.reservado
            ? `Precio acordado ${eur(t.precio)} · señal pagada ${eur(t.senal)} · falta por pagar ${eur(t.pendiente)}`
            : `Precio ${eur(t.precio)}${car.date_purchased ? ` · comprado el ${new Date(car.date_purchased).toLocaleDateString("es-ES")}` : ""}`,
        `Gastos ${eur(t.gastos)} · total invertido ${eur(t.invertido)}${t.reservado ? ` (pagado hasta ahora ${eur(t.pagado)})` : ""}`,
    ]
    const expenses = car.expenses ?? []
    if (expenses.length) {
        lines.push("Gastos:")
        for (const e of [...expenses].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")))) {
            lines.push(`• ${e.concept}: ${eur(num(e.amount))}${e.category ? ` (${e.category})` : ""}${e.date ? ` · ${new Date(e.date).toLocaleDateString("es-ES")}` : ""} · id ${e.id}`)
        }
    }
    return lines.join("\n")
}

/**
 * Cambios al pasar de fase. Al pagar el resto (reservado → comprado o más adelante) la fecha de compra pasa a ser la
 * del pago (o la que se indique); mientras está reservado, date_purchased es la fecha de la reserva.
 */
export function stagePatch(current: Pick<PurchaseCar, "logistic_status">, next: LogisticStage, fecha?: string | null, today = new Date().toISOString().slice(0, 10)): Record<string, unknown> {
    const patch: Record<string, unknown> = { logistic_status: next }
    if (current.logistic_status === "reserved" && next !== "reserved") patch.date_purchased = fecha || today
    else if (fecha) patch.date_purchased = fecha
    return patch
}

// --- Ficha (panel) de un coche de Comprados ---------------------------------------------------------------------------

/** Lo que estimó Claude del coche enlazado (coches_claude) */
export interface ClaudeEstimate {
    precio_alemania?: number | null
    coste_total_espana?: number | null
    precio_venta_estimado_espana?: number | null
}

/**
 * Cuentas previstas: precio acordado + gastos (los que estimó Claude — impuesto, transporte, ITV… — o los apuntados si
 * ya los superan). Así el beneficio previsto no mejora solo porque aún no hayas pagado el impuesto, y empeora si el
 * viaje se come el margen. null si no hay estimación de Claude.
 */
export function purchaseForecast(car: PurchaseCar, est: ClaudeEstimate | null | undefined) {
    if (!est?.coste_total_espana) return null
    const t = purchaseTotals(car)
    const previstos = Math.max(0, num(est.coste_total_espana) - num(est.precio_alemania))
    const gastos = Math.max(previstos, t.gastos)
    const coste = t.precio + gastos
    const venta = est.precio_venta_estimado_espana ? num(est.precio_venta_estimado_espana) : null
    return {
        gastosPrevistos: previstos,
        gastosApuntados: t.gastos,
        /** Los gastos apuntados ya superan lo que estimó Claude */
        superado: t.gastos > previstos,
        coste,
        venta,
        beneficio: venta != null ? venta - coste : null,
        /** Diferencia de precio negociada respecto al anuncio (negativa = rebaja conseguida) */
        rebaja: est.precio_alemania ? t.precio - num(est.precio_alemania) : null,
    }
}

/** Gastos rápidos del panel: un toque y solo falta el importe */
export const QUICK_EXPENSES: { label: string; concept: string; category: ExpenseCategory }[] = [
    { label: "Vuelo", concept: "Vuelo", category: "Viaje" },
    { label: "Hotel", concept: "Hotel", category: "Viaje" },
    { label: "Gasolina", concept: "Gasolina", category: "Viaje" },
    { label: "Peajes", concept: "Peajes", category: "Viaje" },
    { label: "Comida", concept: "Comida", category: "Viaje" },
    { label: "Transporte", concept: "Transporte del coche", category: "Transporte" },
    { label: "Otro", concept: "", category: "Otro" },
]

/** Emoji del gasto: por el concepto (vuelo, hotel…) y si no por la categoría */
export function expenseIcon(e: Pick<PurchaseExpense, "concept" | "category">): string {
    const c = (e.concept || "").toLowerCase()
    if (/vuelo|avi[oó]n|flight|ryanair|iberia|vueling|lufthansa/.test(c)) return "✈️"
    if (/hotel|airbnb|hostal|alojamiento|booking/.test(c)) return "🏨"
    if (/gasolina|gasoil|di[eé]sel|combustible|repostaje/.test(c)) return "⛽"
    if (/peaje|vi[ñn]eta|autopista/.test(c)) return "🛣️"
    if (/tren|bus|taxi|uber|metro/.test(c)) return "🚆"
    if (/comida|cena|desayuno|restaurante|dieta/.test(c)) return "🍽️"
    if (/placa/.test(c)) return "🪪"
    const byCategory: Record<string, string> = {
        Viaje: "🧳", Transporte: "🚚", ITV: "🔍", "Trámites": "📄", "Reparación": "🔧", Mantenimiento: "🛠️",
        Seguro: "🛡️", Impuestos: "🏛️", "Precio del coche": "🚗",
    }
    return byCategory[e.category ?? ""] ?? "💶"
}
