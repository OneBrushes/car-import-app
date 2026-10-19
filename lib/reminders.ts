"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { matriculationProgress } from "@/lib/matriculation"

export type ReminderSeverity = "overdue" | "soon" | "upcoming"

export interface ReminderItem {
    key: string
    /** custom = creado por el usuario (tabla reminders); auto = calculado a partir de los coches */
    kind: "custom" | "auto"
    id?: string
    title: string
    detail?: string
    due: Date
    severity: ReminderSeverity
    tab?: string
    carTable?: "imported_cars" | "inventory_cars" | "spain_cars"
    carId?: string | null
    done?: boolean
}

/** Días desde los que avisamos */
export const REMINDER_RULES = {
    /** Matriculación sin terminar desde la fecha de compra */
    matriculationWarnDays: 20,
    matriculationOverdueDays: 30,
    /** Coche en stock sin vender */
    stockWarnDays: 60,
    stockOverdueDays: 90,
    /** ITV del coche de importación a punto de caducar */
    itvWarnDays: 30,
}

const DAY = 24 * 60 * 60 * 1000

const startOfToday = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY)

const severityFor = (due: Date): ReminderSeverity => {
    const diff = daysBetween(startOfToday(), due)
    if (diff < 0) return "overdue"
    if (diff <= 7) return "soon"
    return "upcoming"
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)

export async function loadReminders(userId: string): Promise<ReminderItem[]> {
    const today = startOfToday()
    const items: ReminderItem[] = []

    const [custom, inventory, imported] = await Promise.all([
        supabase.from("reminders").select("*").eq("done", false).order("due_date"),
        supabase.from("inventory_cars").select("id, user_id, brand, model, date_purchased, status, matriculation_checklist").eq("status", "inventory"),
        supabase.from("imported_cars").select("id, user_id, brand, model, inspection_expiry").not("inspection_expiry", "is", null),
    ])

    for (const r of custom.data || []) {
        const due = new Date(r.due_date)
        items.push({
            key: `custom-${r.id}`,
            kind: "custom",
            id: r.id,
            title: r.title,
            detail: r.notes || undefined,
            due,
            severity: severityFor(due),
            carTable: r.car_table || undefined,
            carId: r.car_id,
            tab: r.car_table === "inventory_cars" ? "management" : r.car_table === "imported_cars" ? "import" : r.car_table === "spain_cars" ? "spain" : undefined,
        })
    }

    // Los avisos automáticos solo para coches propios (los roles de empresa ven todos los coches)
    for (const car of (inventory.data || []).filter((c: any) => c.user_id === userId)) {
        if (!car.date_purchased) continue
        const purchased = new Date(car.date_purchased)
        const days = daysBetween(purchased, today)
        const name = `${car.brand} ${car.model}`

        if (matriculationProgress(car.matriculation_checklist) < 100 && days >= REMINDER_RULES.matriculationWarnDays) {
            const due = addDays(purchased, REMINDER_RULES.matriculationOverdueDays)
            items.push({
                key: `matr-${car.id}`,
                kind: "auto",
                title: `Matriculación pendiente · ${name}`,
                detail: `Comprado hace ${days} días y los trámites no están completos (${matriculationProgress(car.matriculation_checklist)}%).`,
                due,
                severity: severityFor(due),
                tab: "management",
                carTable: "inventory_cars",
                carId: car.id,
            })
        }

        if (days >= REMINDER_RULES.stockWarnDays) {
            const due = addDays(purchased, REMINDER_RULES.stockOverdueDays)
            items.push({
                key: `stock-${car.id}`,
                kind: "auto",
                title: `${days} días en stock · ${name}`,
                detail: "Revisa el precio o la publicación: el coche lleva mucho tiempo sin venderse.",
                due,
                severity: severityFor(due),
                tab: "management",
                carTable: "inventory_cars",
                carId: car.id,
            })
        }
    }

    for (const car of (imported.data || []).filter((c: any) => c.user_id === userId)) {
        const expiry = new Date(car.inspection_expiry)
        if (Number.isNaN(expiry.getTime())) continue
        const daysLeft = daysBetween(today, expiry)
        if (daysLeft > REMINDER_RULES.itvWarnDays) continue
        items.push({
            key: `itv-${car.id}`,
            kind: "auto",
            title: `${daysLeft < 0 ? "ITV caducada" : "ITV a punto de caducar"} · ${car.brand} ${car.model}`,
            detail: daysLeft < 0 ? `Caducó hace ${-daysLeft} días.` : `Caduca en ${daysLeft} días.`,
            due: expiry,
            severity: severityFor(expiry),
            tab: "import",
            carTable: "imported_cars",
            carId: car.id,
        })
    }

    return items.sort((a, b) => a.due.getTime() - b.due.getTime())
}

export function useReminders(userId: string | undefined, enabled = true) {
    const [items, setItems] = useState<ReminderItem[]>([])
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        if (!userId) return
        setLoading(true)
        try {
            setItems(await loadReminders(userId))
        } catch (error) {
            console.error("Error cargando recordatorios:", error)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        if (enabled) refresh()
    }, [enabled, refresh])

    return { items, loading, refresh }
}

export async function createReminder(input: { title: string; due_date: string; notes?: string; car_table?: string | null; car_id?: string | null }) {
    return supabase.from("reminders").insert({
        title: input.title,
        due_date: input.due_date,
        notes: input.notes || null,
        car_table: input.car_table || null,
        car_id: input.car_id || null,
    })
}

export async function completeReminder(id: string) {
    return supabase.from("reminders").update({ done: true }).eq("id", id)
}

export async function deleteReminder(id: string) {
    return supabase.from("reminders").delete().eq("id", id)
}
