/**
 * Datos del garaje virtual. Solo lectura: nunca escribe en la base de datos.
 *
 * Tablas y columnas que se leen (todas existen en el proyecto):
 *   inventory_cars: id, user_id, imported_car_id, brand, model, year, plate, status, logistic_status,
 *                   date_purchased, date_sold, initial_price, initial_expenses, sell_price, created_at
 *   car_expenses:   car_id, amount            (embebido en inventory_cars)
 *   imported_cars:  id, user_id, shared_with, brand, model, year, color, vehicle_type, contacted,
 *                   pipeline_stage, images, image_url, price, total_cost, created_at
 *   customers:      count(*)
 *   global_expenses: amount, date          (solo importador/admin/super_admin; si no, "—")
 *   recordatorios:  lib/reminders.ts (calculados a partir de las mismas tablas + reminders)
 *
 * Campos que NO existen y se muestran como "—": precio de venta pedido (no hay campo "asking price").
 */

import { supabase } from "@/lib/supabase"
import { loadReminders } from "@/lib/reminders"
import { computeSale, computeTotals, currentQuarter, quarterRange } from "@/lib/fiscal"
import type { BoardStage, ParkStage } from "./geometry"

export type BodyType = "saloon" | "suv" | "estate" | "hatchback" | "van" | "coupe" | "pickup"

export interface GarageCar {
    id: string
    brand: string
    model: string
    year: number | null
    plate: string | null
    stage: ParkStage
    color: string
    colorKnown: boolean
    body: BodyType
    daysInStock: number | null
    totalCost: number | null
    sellPrice: number | null
    margin: number | null
    dateSold: string | null
    urgent: boolean
}

export interface BoardCard {
    id: string
    brand: string
    model: string
    year: number | null
    stage: BoardStage
    image: string | null
    createdAt: string
}

export interface OfficeStats {
    profitMonth: number | null
    vatQuarter: { vat: number; general: number; rebu: number; label: string } | null
    clients: number | null
    expensesMonth: number | null
    urgentReminders: number | null
    month: {
        bought: number | null
        sold: number | null
        profit: number | null
        avgMarginPct: number | null
        stockValue: number | null
    }
    board: { found: number; contacted: number; negotiating: number }
}

export interface GarageData {
    cars: GarageCar[]
    board: BoardCard[]
    stats: OfficeStats
    loadedAt: number
}

/** Días que un coche vendido sigue visible antes de salir por la puerta (0 = sale en cuanto se vende) */
export const SOLD_LINGER_DAYS = 0

const DAY = 86_400_000

// -----------------------------------------------------------------------------
// Aspecto del coche a partir de los datos reales
// -----------------------------------------------------------------------------

const COLOR_NAMES: [RegExp, string][] = [
    [/negr|black|schwarz|noir/i, "#3a3d4a"],
    [/blanc|white|weiß|weiss/i, "#f4f1ea"],
    [/plat|silver|silber|argent/i, "#c3c8d0"],
    [/gris|grey|gray|grau/i, "#8d939e"],
    [/roj|red|rot|rouge|granate/i, "#d8433a"],
    [/azul|blue|blau|bleu/i, "#3a74c9"],
    [/verde|green|grün|vert/i, "#3f9a5c"],
    [/amarill|yellow|gelb|jaune/i, "#f2c14e"],
    [/naranj|orange/i, "#eb7a34"],
    [/marr|brown|braun|bronce/i, "#8a5a3c"],
    [/beige|crema|cream/i, "#e2cfa6"],
    [/morad|violet|purple|lila/i, "#8b5cf6"],
    [/dorad|gold/i, "#d9a83a"],
]

/** Paleta "de juguete" para los coches sin color conocido */
const FALLBACK_COLORS = ["#3a74c9", "#d8433a", "#1baf7a", "#f2c14e", "#8b5cf6", "#eb6834", "#14b8a6", "#ec4899", "#c3c8d0", "#3a3d4a"]

export function hashString(value: string) {
    let h = 2166136261
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

export function carColor(colorName: string | null | undefined, id: string): { color: string; known: boolean } {
    if (colorName) {
        const match = COLOR_NAMES.find(([re]) => re.test(colorName))
        if (match) return { color: match[1], known: true }
    }
    return { color: FALLBACK_COLORS[hashString(id) % FALLBACK_COLORS.length], known: false }
}

/** vehicle_type de la app: Sedán, SUV, Deportivo, Coupé, Familiar, Monovolumen, Pickup */
export function bodyType(vehicleType: string | null | undefined, model?: string | null): BodyType {
    const v = (vehicleType || "").toLowerCase()
    if (v.includes("suv")) return "suv"
    if (v.includes("familiar") || v.includes("estate") || v.includes("variant") || v.includes("touring")) return "estate"
    if (v.includes("monovol") || v.includes("furgo") || v.includes("van")) return "van"
    if (v.includes("pick")) return "pickup"
    if (v.includes("coup") || v.includes("deport")) return "coupe"
    if (v.includes("sed")) return "saloon"
    // Sin tipo: pista por el nombre del modelo
    const m = (model || "").toLowerCase()
    if (/variant|touring|avant|sw\b|estate|kombi/.test(m)) return "estate"
    if (/\b(x[1-7]|q[2-8]|gla|glc|tiguan|t-roc|kuga|tucson|sportage|qashqai)\b/.test(m)) return "suv"
    return "hatchback"
}

// -----------------------------------------------------------------------------
// Formato: lo desconocido es "—"
// -----------------------------------------------------------------------------

export const UNKNOWN = "—"

export function fmtEur(value: number | null | undefined) {
    return value == null || Number.isNaN(value) ? UNKNOWN : `${Math.round(value).toLocaleString("es-ES")} €`
}

export function fmtNum(value: number | null | undefined) {
    return value == null || Number.isNaN(value) ? UNKNOWN : value.toLocaleString("es-ES")
}

export function fmtPct(value: number | null | undefined) {
    return value == null || Number.isNaN(value) ? UNKNOWN : `${value.toFixed(1).replace(".", ",")} %`
}

export const STAGE_LABEL: Record<ParkStage, string> = {
    purchased: "Comprado",
    in_transit: "Transporte",
    homologation: "Trámites / ITV",
    detailing: "Taller",
    ready: "A la venta",
    sold: "Vendido",
}

// -----------------------------------------------------------------------------
// Carga
// -----------------------------------------------------------------------------

const PARK_STAGES: ParkStage[] = ["purchased", "in_transit", "homologation", "detailing", "ready"]

export function toParkStage(row: { status?: string | null; logistic_status?: string | null }): ParkStage {
    if (row.status === "sold") return "sold"
    return (PARK_STAGES as string[]).includes(row.logistic_status || "") ? (row.logistic_status as ParkStage) : "purchased"
}

export async function loadGarageData(opts: { userId: string; role: string | null; godMode: boolean }): Promise<GarageData> {
    const now = Date.now()
    const companyRole = ["importador", "admin", "super_admin"].includes(opts.role || "")
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const monthIso = monthStart.toISOString().slice(0, 10)
    const q = currentQuarter()
    const quarter = quarterRange(q.year, q.quarter)

    const [inventoryRes, importedRes, customersRes, expensesRes, reminders] = await Promise.all([
        supabase
            .from("inventory_cars")
            .select("id, user_id, imported_car_id, brand, model, year, plate, status, logistic_status, date_purchased, date_sold, initial_price, initial_expenses, sell_price, vat_regime, invoice_number, buyer, created_at, expenses:car_expenses(amount)"),
        supabase
            .from("imported_cars")
            .select("id, user_id, shared_with, brand, model, year, color, vehicle_type, contacted, pipeline_stage, images, image_url, created_at")
            .order("created_at", { ascending: false }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        companyRole
            ? supabase.from("global_expenses").select("amount, date").gte("date", monthIso)
            : Promise.resolve({ data: null, error: { message: "sin permiso" } } as any),
        loadReminders(opts.userId).catch(() => null),
    ])

    if (inventoryRes.error) throw new Error("No se pudo leer el inventario: " + inventoryRes.error.message)

    // Mismas reglas de visibilidad que las pestañas Importación y Comprados
    const imported = (importedRes.data || []).filter((c: any) =>
        opts.godMode || c.user_id === opts.userId || (c.shared_with || []).includes(opts.userId))
    const importedById = new Map((importedRes.data || []).map((c: any) => [c.id, c]))
    const inventory = (inventoryRes.data || []).filter((c: any) => opts.godMode || companyRole || c.user_id === opts.userId)

    const urgentIds = new Set(
        (reminders || [])
            .filter(r => r.carTable === "inventory_cars" && r.carId && r.severity !== "upcoming")
            .map(r => r.carId as string)
    )

    const invested = (c: any) =>
        (Number(c.initial_price) || 0) + (Number(c.initial_expenses) || 0) +
        (c.expenses || []).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0)

    const cars: GarageCar[] = []
    for (const c of inventory as any[]) {
        const stage = toParkStage(c)
        if (stage === "sold") {
            const soldAt = c.date_sold ? new Date(c.date_sold).getTime() : 0
            if (!soldAt || now - soldAt > SOLD_LINGER_DAYS * DAY) continue
        }
        const source: any = c.imported_car_id ? importedById.get(c.imported_car_id) : null
        const { color, known } = carColor(source?.color, c.id)
        const total = invested(c)
        const sell = c.sell_price != null ? Number(c.sell_price) : null
        cars.push({
            id: c.id,
            brand: c.brand || UNKNOWN,
            model: c.model || "",
            year: c.year != null ? Number(c.year) : null,
            plate: c.plate || null,
            stage,
            color,
            colorKnown: known,
            body: bodyType(source?.vehicle_type, c.model),
            daysInStock: c.date_purchased ? Math.max(0, Math.floor((now - new Date(c.date_purchased).getTime()) / DAY)) : null,
            totalCost: total || null,
            sellPrice: sell,
            margin: sell != null ? sell - total : null,
            dateSold: c.date_sold || null,
            urgent: urgentIds.has(c.id),
        })
    }
    // Orden estable: los más antiguos primero, así no cambian de plaza al llegar otros
    cars.sort((a, b) => (b.daysInStock ?? 0) - (a.daysInStock ?? 0) || a.id.localeCompare(b.id))

    // Corcho: lo que aún no se ha comprado
    const bought = new Set(inventory.map((c: any) => c.imported_car_id).filter(Boolean))
    const board: BoardCard[] = imported
        .filter((c: any) => !bought.has(c.id) && c.pipeline_stage !== "discarded")
        .map((c: any) => ({
            id: c.id,
            brand: c.brand || UNKNOWN,
            model: c.model || "",
            year: c.year != null ? Number(c.year) : null,
            stage: c.pipeline_stage === "negotiating" ? "negotiating" : c.contacted ? "contacted" : "found",
            image: c.images?.[0] || c.image_url || null,
            createdAt: c.created_at,
        }))

    // Cifras de la oficina
    const sold = (inventory as any[]).filter(c => c.status === "sold" && c.sell_price != null)
    const soldThisMonth = sold.filter(c => c.date_sold && c.date_sold >= monthIso)
    const profits = soldThisMonth.map(c => Number(c.sell_price) - invested(c))
    const margins = soldThisMonth
        .map(c => { const inv = invested(c); return inv > 0 ? ((Number(c.sell_price) - inv) / inv) * 100 : null })
        .filter((m): m is number => m != null)
    const soldInQuarter = sold.filter(c => c.date_sold && c.date_sold >= quarter.from && c.date_sold <= quarter.to)
    const fiscal = computeTotals(soldInQuarter.map((c: any) => computeSale({
        id: c.id, brand: c.brand, model: c.model, date_sold: c.date_sold,
        sell_price: Number(c.sell_price), initial_price: Number(c.initial_price) || 0, vat_regime: c.vat_regime,
    })))

    const stats: OfficeStats = {
        profitMonth: soldThisMonth.length ? profits.reduce((a, b) => a + b, 0) : 0,
        vatQuarter: { vat: fiscal.vat, general: fiscal.general.vat, rebu: fiscal.rebu.vat, label: `${q.quarter}T ${q.year}` },
        clients: customersRes.error ? null : customersRes.count ?? null,
        expensesMonth: expensesRes.error || !expensesRes.data ? null : expensesRes.data.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
        urgentReminders: reminders ? reminders.filter(r => r.severity !== "upcoming").length : null,
        month: {
            bought: (inventory as any[]).filter(c => c.date_purchased && c.date_purchased >= monthIso).length,
            sold: soldThisMonth.length,
            profit: soldThisMonth.length ? profits.reduce((a, b) => a + b, 0) : 0,
            avgMarginPct: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
            stockValue: (inventory as any[]).filter(c => c.status !== "sold").reduce((s, c) => s + invested(c), 0),
        },
        board: {
            found: board.filter(b => b.stage === "found").length,
            contacted: board.filter(b => b.stage === "contacted").length,
            negotiating: board.filter(b => b.stage === "negotiating").length,
        },
    }

    return { cars, board, stats, loadedAt: now }
}

// -----------------------------------------------------------------------------
// Datos de ejemplo (para las capturas y para ver el garaje sin sesión: ?demo=1)
// -----------------------------------------------------------------------------

export function demoGarageData(seed = 1, count = 14): GarageData {
    const brands: [string, string, string, BodyType][] = [
        ["Seat", "Leon", "Negro", "hatchback"], ["Volkswagen", "Polo GTI", "Rojo", "hatchback"],
        ["Audi", "A3 Sportback", "Plata", "hatchback"], ["Volkswagen", "Golf Variant", "Gris", "estate"],
        ["Mercedes-Benz", "A220", "Negro", "hatchback"], ["BMW", "X3", "Blanco", "suv"],
        ["Peugeot", "Rifter", "Azul", "van"], ["BMW", "420i Coupé", "Azul", "coupe"],
        ["Skoda", "Octavia", "Blanco", "saloon"], ["Toyota", "Hilux", "Gris", "pickup"],
        ["Kia", "Sportage", "Verde", "suv"], ["Renault", "Clio", "Naranja", ""] as any,
    ]
    const base: ParkStage[] = ["purchased", "purchased", "in_transit", "in_transit", "in_transit", "in_transit", "homologation", "homologation", "detailing", "ready", "ready", "ready", "ready", "purchased"]
    const stages: ParkStage[] = Array.from({ length: count }, (_, i) => base[i % base.length])
    const cars: GarageCar[] = stages.map((stage, i) => {
        const [brand, model, colorName, body] = brands[(i + seed) % brands.length]
        const { color, known } = carColor(colorName, `demo-${i}`)
        const total = 9000 + ((i * 3779) % 12000)
        const sell = stage === "ready" ? null : null
        return {
            id: `demo-${i}`,
            brand, model, year: 2016 + (i % 7), plate: i % 3 === 0 ? `${1000 + i * 37} K${String.fromCharCode(66 + (i % 20))}C` : null,
            stage, color, colorKnown: known, body: body || "hatchback",
            daysInStock: 3 + i * 6, totalCost: total, sellPrice: sell, margin: null, dateSold: null,
            urgent: i === 6 || i === 0,
        }
    })
    return {
        cars,
        board: [
            { id: "b1", brand: "Audi", model: "A4 Avant", year: 2019, stage: "found", image: null, createdAt: "" },
            { id: "b2", brand: "BMW", model: "320d", year: 2020, stage: "found", image: null, createdAt: "" },
            { id: "b3", brand: "Cupra", model: "Formentor", year: 2022, stage: "contacted", image: null, createdAt: "" },
            { id: "b4", brand: "Volvo", model: "XC40", year: 2021, stage: "negotiating", image: null, createdAt: "" },
        ],
        stats: {
            profitMonth: 6420, vatQuarter: { vat: 2380, general: 1210, rebu: 1170, label: "4T 2026" }, clients: 37,
            expensesMonth: 1840, urgentReminders: 2,
            month: { bought: 6, sold: 4, profit: 6420, avgMarginPct: 11.8, stockValue: 186400 },
            board: { found: 2, contacted: 1, negotiating: 1 },
        },
        loadedAt: Date.now(),
    }
}
