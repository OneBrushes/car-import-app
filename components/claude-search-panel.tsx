"use client"

// Panel "Búsqueda de anoche": resumen de la última ejecución del buscador automático (tools/buscador, tabla ejecuciones)
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, ExternalLink, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface Linea { portal: string; url: string; titulo: string; precio: number | null; resultado: string; motivo: string }
interface Ejecucion {
    id: number
    inicio: string
    fin: string | null
    busquedas: number
    fichas_vistas: number
    candidatos: number
    descartes: Record<string, number>
    errores: string[]
    detalle: Linea[]
}

const eur = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("es-ES")} €`)

export function ClaudeSearchPanel() {
    const [run, setRun] = useState<Ejecucion | null | undefined>(undefined)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        supabase.from("ejecuciones").select("*").eq("simulacion", false).order("inicio", { ascending: false }).limit(1).maybeSingle()
            .then(({ data, error }) => setRun(error ? null : (data as Ejecucion | null)))
    }, [])

    if (run === undefined) return null
    if (run === null) {
        return (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                <Search className="mr-1.5 inline h-4 w-4" /> Búsqueda automática: todavía no ha corrido ninguna noche (o falta ejecutar <code>supabase/2026-11_busquedas.sql</code>).
            </div>
        )
    }

    const fechaTxt = new Date(run.inicio).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    const descartes = Object.entries(run.descartes ?? {}).sort((a, b) => b[1] - a[1])
    const candidatos = (run.detalle ?? []).filter(l => l.resultado === "candidato")

    return (
        <div className="rounded-xl border bg-card">
            <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
                <Search className="h-4 w-4 text-primary" />
                <span className="font-medium">Búsqueda de anoche</span>
                <span className="text-xs text-muted-foreground">{fechaTxt}</span>
                <span className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{run.fichas_vistas} fichas</span>
                    <span className="rounded-full bg-violet-600/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">{run.candidatos} candidato(s)</span>
                    {run.errores?.length ? <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive">{run.errores.length} error(es)</span> : null}
                </span>
                <span className="ml-auto text-muted-foreground">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
            </button>
            {open && (
                <div className="grid gap-4 border-t px-4 py-3 text-sm md:grid-cols-2">
                    <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descartados por motivo</h4>
                        {descartes.length ? descartes.map(([m, n]) => (
                            <div key={m} className="flex justify-between gap-3 text-xs"><span className="truncate">{m}</span><span className="tabular font-medium">{n}</span></div>
                        )) : <p className="text-xs text-muted-foreground">Nada descartado.</p>}
                        {run.errores?.length ? <p className="pt-2 text-xs text-destructive">{run.errores.slice(0, 3).join(" · ")}</p> : null}
                    </div>
                    <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Candidatos (filtro «Candidato» abajo)</h4>
                        {candidatos.length ? candidatos.map(l => (
                            <div key={l.url} className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-medium">{l.titulo}<a href={l.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a></p>
                                    <p className="truncate text-xs text-muted-foreground">{l.portal} · {l.motivo}</p>
                                </div>
                                <span className="shrink-0 text-xs font-medium">{eur(l.precio)}</span>
                            </div>
                        )) : <p className="text-xs text-muted-foreground">Ningún coche pasó todos los filtros.</p>}
                    </div>
                </div>
            )}
        </div>
    )
}
