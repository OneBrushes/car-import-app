"use client"

// Panel "Revisión de hoy" de Guardados por Claude: qué ha encontrado la revisión de anuncios de esta mañana
// (cron del Worker a las 6 de Madrid + lo que Claude marca con Chrome).
import { useEffect, useMemo, useState } from "react"
import { CalendarCheck, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { formatEUR } from "@/lib/import-costs"
import { REVIEWED_CAR_STATES, madridDate } from "@/lib/listing-check"
import type { ClaudeCar } from "@/lib/claude-cars"

interface Review {
    id: number
    coche_id: string
    fecha: string
    resultado: "activo" | "retirado" | "no_comprobado"
    http_status: number | null
    precio_detectado: number | null
    precio_anterior: number | null
    motivo: string | null
    origen: string
}

const name = (c?: ClaudeCar) => (c ? [c.marca, c.modelo, c.anio ? `(${c.anio})` : null].filter(Boolean).join(" ") : "Coche borrado")
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })

export function ClaudeReviewPanel({ cars }: { cars: ClaudeCar[] }) {
    const [reviews, setReviews] = useState<Review[] | null>(null)
    const [missingTable, setMissingTable] = useState(false)
    const [open, setOpen] = useState(false)
    const today = madridDate()

    // Cada revisión actualiza el coche, así que al cambiar `cars` (tiempo real) se vuelve a leer el historial
    const carsKey = cars.map(c => `${c.id}:${c.anuncio_ultima_comprobacion ?? ""}`).join("|")
    useEffect(() => {
        let cancelled = false
        const since = new Date(Date.now() - 36 * 3600_000).toISOString()
        supabase.from("revisiones_anuncios").select("*").gte("fecha", since).order("fecha", { ascending: false }).then(({ data, error }) => {
            if (cancelled) return
            if (error) { setMissingTable(/revisiones_anuncios|does not exist|schema cache/i.test(error.message)); setReviews([]); return }
            setReviews(((data ?? []) as Review[]).filter(r => madridDate(new Date(r.fecha)) === today))
        })
        return () => { cancelled = true }
    }, [carsKey, today])

    const byId = useMemo(() => new Map(cars.map(c => [c.id, c])), [cars])
    const summary = useMemo(() => {
        // Última revisión de hoy de cada coche
        const latest = new Map<string, Review>()
        for (const r of reviews ?? []) if (!latest.has(r.coche_id)) latest.set(r.coche_id, r)
        const last = [...latest.values()]
        const reviewable = cars.filter(c => (REVIEWED_CAR_STATES as readonly string[]).includes(c.estado))
        const checkedToday = (c: ClaudeCar) => !!c.anuncio_ultima_comprobacion && madridDate(new Date(c.anuncio_ultima_comprobacion)) === today
        return {
            activos: last.filter(r => r.resultado === "activo"),
            retirados: last.filter(r => r.resultado === "retirado"),
            bajadas: (reviews ?? []).filter(r => r.precio_detectado != null && r.precio_anterior != null && r.precio_detectado < r.precio_anterior - 1),
            pendientes: reviewable.filter(c => c.anuncio_estado === "no_comprobado" || !checkedToday(c)),
        }
    }, [reviews, cars, today])

    if (missingTable) {
        return (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                <CalendarCheck className="mr-1.5 inline h-4 w-4" /> Revisión diaria de anuncios: falta ejecutar <code>supabase/2026-11_revision_anuncios.sql</code> en Supabase.
            </div>
        )
    }

    const chip = (label: string, n: number, tone: string) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label} <span className="tabular">{n}</span></span>
    )

    return (
        <div className="rounded-xl border bg-card">
            <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
                <CalendarCheck className="h-4 w-4 text-primary" />
                <span className="font-medium">Revisión de hoy</span>
                {reviews == null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
                    <span className="flex flex-wrap gap-1.5">
                        {chip("Activos", summary.activos.length, "bg-success/10 text-success")}
                        {chip("Retirados", summary.retirados.length, "bg-destructive/10 text-destructive")}
                        {chip("Bajadas de precio", summary.bajadas.length, "bg-primary/10 text-primary")}
                        {chip("Pendientes", summary.pendientes.length, "bg-muted text-muted-foreground")}
                    </span>
                )}
                <span className="ml-auto text-muted-foreground">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
            </button>

            {open && reviews != null && (
                <div className="grid gap-4 border-t px-4 py-3 text-sm md:grid-cols-2">
                    <Section title="Retirados" empty="Ningún anuncio retirado hoy.">
                        {summary.retirados.map(r => {
                            const c = byId.get(r.coche_id)
                            return <Row key={r.id} car={c} right={c?.estado === "descartado" ? "Descartado" : `${c?.anuncio_fallos_seguidos ?? 1}/2`} detail={`${r.motivo ?? ""} · ${time(r.fecha)}`} tone="text-destructive" />
                        })}
                    </Section>
                    <Section title="Bajadas de precio" empty="Ninguna bajada de precio hoy.">
                        {summary.bajadas.map(r => (
                            <Row key={r.id} car={byId.get(r.coche_id)} right={`${formatEUR(r.precio_anterior!)} → ${formatEUR(r.precio_detectado!)}`}
                                detail={`−${formatEUR(r.precio_anterior! - r.precio_detectado!)} · coste y beneficio recalculados`} tone="text-primary" />
                        ))}
                    </Section>
                    <Section title="Pendientes (Claude los mira con Chrome)" empty="Nada pendiente: todos comprobados hoy.">
                        {summary.pendientes.slice(0, 12).map(c => (
                            <Row key={c.id} car={c} right={c.anuncio_estado === "no_comprobado" ? "No comprobado" : "Sin revisar hoy"} detail={new URL(c.url).hostname.replace(/^www\.|^suchen\./, "")} tone="text-muted-foreground" />
                        ))}
                        {summary.pendientes.length > 12 && <p className="text-xs text-muted-foreground">y {summary.pendientes.length - 12} más. Pídele a Claude: «revisa los anuncios pendientes de NorDrive».</p>}
                    </Section>
                    <Section title="Activos" empty="Todavía no hay anuncios comprobados hoy.">
                        {summary.activos.slice(0, 12).map(r => (
                            <Row key={r.id} car={byId.get(r.coche_id)} right={r.precio_detectado ? formatEUR(r.precio_detectado) : "Activo"} detail={`${r.origen === "claude" ? "Claude" : "Revisión automática"} · ${time(r.fecha)}`} tone="text-success" />
                        ))}
                        {summary.activos.length > 12 && <p className="text-xs text-muted-foreground">y {summary.activos.length - 12} más.</p>}
                    </Section>
                </div>
            )}
        </div>
    )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
    const items = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : []
    return (
        <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
            {items.length ? children : <p className="text-xs text-muted-foreground">{empty}</p>}
        </div>
    )
}

function Row({ car, right, detail, tone }: { car?: ClaudeCar; right: string; detail: string; tone: string }) {
    return (
        <div className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50">
            <div className="min-w-0">
                <p className="truncate font-medium">
                    {name(car)}
                    {car?.url && <a href={car.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex text-muted-foreground hover:text-foreground" title="Abrir anuncio"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{detail}</p>
            </div>
            <span className={`shrink-0 text-xs font-medium ${tone}`}>{right}</span>
        </div>
    )
}
