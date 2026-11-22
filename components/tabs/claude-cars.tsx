"use client"

// Pestaña "Guardados por Claude": coches que guarda Claude (claude.ai) con el servidor MCP (workers/nordrive-mcp).
// Solo la ve la cuenta dueña (is_claude_owner() en Supabase); la base de datos tampoco deja leerlos a nadie más.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, ArrowRightLeft, ArrowUpDown, SlidersHorizontal, TrendingDown, Bookmark, Bot, ClipboardPaste, ChevronDown, ChevronUp, Clock, ExternalLink, History, ImageDown, Images, Loader2, MessageSquare, RefreshCw, ShieldCheck, Star, Undo2, XCircle,
} from "lucide-react"
import { PhotoViewer } from "@/components/photo-viewer"
import { ClaudeReviewPanel } from "@/components/claude-review-panel"
import { ClaudeSearchPanel } from "@/components/claude-search-panel"
import { BOOKMARKLET, photosFromPasted } from "@/components/import-from-url"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { autoFramingY, DEFAULT_PHOTO_POSITION_Y } from "@/lib/image-size"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatEUR } from "@/lib/import-costs"
import {
  CLAUDE_CAR_STATE_LABELS,
  CLAUDE_CAR_STATES,
  CONTACT_CHANNEL_LABELS,
  NO_REPLY_DAYS,
  awaitingReplySince,
  carPhotoList,
  claudeCarToImportedCar,
  daysSince,
  needsFollowUp,
  saleEaseLabel,
  travelTransport,
  activeFilterCount,
  matchesCarFilters,
  type CarRangeFilters,
  formatTravelHours,
  TRAVEL_DESTINATION,
  SALE_EASE_LABELS,
  SALE_EASE_LEVELS,
  sortContacts,
  type ClaudeCar,
  type ClaudeCarState,
  type ClaudeContact,
} from "@/lib/claude-cars"

/** Worker del MCP: el botón "Actualizar fotos" le pide que vuelva a sacar las fotos del anuncio */
const MCP_WORKER_URL = process.env.NEXT_PUBLIC_MCP_WORKER || "https://nordrive-mcp.infonordrive.workers.dev"

const ago = (iso: string) => {
  const d = daysSince(iso)
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`
}

type Filter = "activos" | "sin_respuesta" | ClaudeCarState

/** Colores del medidor de facilidad de venta: verde (fácil) → rojo (difícil) */
const SALE_EASE_COLORS = ["bg-emerald-500", "bg-lime-500", "bg-amber-400", "bg-orange-500", "bg-red-500"]
const SALE_EASE_TEXT = ["text-emerald-600", "text-lime-600", "text-amber-600", "text-orange-600", "text-red-600"]

/** Facilidad de venta: 5 segmentos; se pulsa uno para cambiarla (otra vez el mismo la quita) */
function SaleEaseMeter({ car, onPatch }: { car: ClaudeCar; onPatch: (changes: Partial<ClaudeCar>) => void }) {
  const level = car.facilidad_venta ?? null
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? level
  const save = async (n: number) => {
    const value = n === level ? null : n
    onPatch({ facilidad_venta: value })
    const { error } = await supabase.from("coches_claude").update({ facilidad_venta: value, updated_at: new Date().toISOString() }).eq("id", car.id)
    if (error) {
      onPatch({ facilidad_venta: level })
      toast.error(error.message.includes("facilidad_venta")
        ? "Falta ejecutar supabase/2026-11_coches_claude_facilidad_venta.sql en Supabase"
        : "No se pudo guardar la facilidad de venta: " + error.message)
    }
  }
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Facilidad de venta</span>
        <span className={`text-xs font-medium ${shown ? SALE_EASE_TEXT[shown - 1] : "text-muted-foreground"}`}>
          {saleEaseLabel(shown) ?? "Sin valorar"}
        </span>
      </div>
      <div className="flex gap-1" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Facilidad de venta">
        {SALE_EASE_LEVELS.map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={level === n}
            title={SALE_EASE_LABELS[n]}
            aria-label={SALE_EASE_LABELS[n]}
            onMouseEnter={() => setHover(n)}
            onClick={() => save(n)}
            className={`h-2 flex-1 rounded-full transition-colors ${shown === n ? SALE_EASE_COLORS[n - 1] : shown ? "bg-muted" : "bg-muted hover:bg-muted-foreground/30"} ${level === n && hover == null ? "ring-1 ring-offset-1 ring-offset-background ring-foreground/20" : ""}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground/70">
        <span>Fácil</span><span>Medio</span><span>Difícil</span>
      </div>
      {car.facilidad_venta_motivo && <p className="text-xs text-muted-foreground">{car.facilidad_venta_motivo}</p>}
    </div>
  )
}

type SortKey = "recientes" | "margen" | "beneficio" | "facil" | "barato" | "precio_de" | "km" | "anio"
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recientes", label: "Más recientes" },
  { key: "margen", label: "Mayor % de beneficio" },
  { key: "beneficio", label: "Más dinero ganado" },
  { key: "facil", label: "Más fácil de vender" },
  { key: "barato", label: "Más barato (coste en España)" },
  { key: "precio_de", label: "Más barato en Alemania" },
  { key: "km", label: "Menos kilómetros" },
  { key: "anio", label: "Más nuevo" },
]
const SORT_STORAGE_KEY = "nordrive.claude.sort"
const FILTERS_STORAGE_KEY = "nordrive.claude.filtros"

/** Par de casillas "desde / hasta" (vacío = sin límite) */
function RangeInput({ label, min, max, step, onChange, onlyMin, onlyMax }: {
  label: string
  min?: number | null
  max?: number | null
  step: number
  onChange: (min: number | null, max: number | null) => void
  onlyMin?: boolean
  onlyMax?: boolean
}) {
  const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")))
  const cls = "h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <div className="flex items-center gap-1.5">
        {!onlyMax && <input type="number" inputMode="numeric" step={step} placeholder="desde" className={cls} value={min ?? ""} onChange={e => onChange(parse(e.target.value), max ?? null)} />}
        {!onlyMin && !onlyMax && <span>–</span>}
        {!onlyMin && <input type="number" inputMode="numeric" step={step} placeholder="hasta" className={cls} value={max ?? ""} onChange={e => onChange(min ?? null, parse(e.target.value))} />}
      </div>
    </label>
  )
}

/** Valor por el que se ordena (mayor primero) y si se ordena de menor a mayor; los que no tienen el dato van al final */
function sortValue(car: ClaudeCar, key: SortKey): number | null {
  switch (key) {
    case "recientes": return Date.parse(car.created_at ?? "") || null
    case "margen": return car.margen_pct ?? null
    case "beneficio": return car.beneficio ?? null
    case "facil": return car.facilidad_venta ? -car.facilidad_venta : null
    case "barato": return car.coste_total_espana ? -car.coste_total_espana : null
    case "precio_de": return car.precio_alemania ? -car.precio_alemania : null
    case "km": return car.km != null ? -car.km : null
    case "anio": return car.anio ? car.anio * 12 + (car.mes_matriculacion ?? 0) : null
  }
}

export function sortClaudeCars(cars: ClaudeCar[], key: SortKey): ClaudeCar[] {
  return [...cars].sort((a, b) => {
    const va = sortValue(a, key), vb = sortValue(b, key)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return vb - va
  })
}

interface McpLog {
  id: number
  created_at: string
  herramienta: string
  ok: boolean
  resumen: string | null
  error: string | null
}

const STATE_STYLES: Record<ClaudeCarState, string> = {
  candidato: "bg-violet-600 text-white",
  nuevo: "bg-primary text-primary-foreground",
  interesante: "bg-warning text-warning-foreground",
  contactado: "bg-success text-success-foreground",
  descartado: "bg-muted text-muted-foreground",
  comprado: "bg-foreground text-background",
}

export function ClaudeCarsTab({ isActive }: { isActive: boolean }) {
  const { user } = useAuth()
  const [cars, setCars] = useState<ClaudeCar[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>("activos")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [logs, setLogs] = useState<McpLog[] | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  const load = useCallback(async () => {
    let res = await supabase.from("coches_claude").select("*, contactos:contactos_claude(*)").order("created_at", { ascending: false })
    if (res.error) res = await supabase.from("coches_claude").select("*").order("created_at", { ascending: false })
    if (res.error) toast.error("No se pudieron cargar los coches de Claude: " + res.error.message)
    else setCars(((res.data as ClaudeCar[]) ?? []).map(car => {
      const contactos = sortContacts(car.contactos as ClaudeContact[] | undefined)
      return { ...car, contactos, ultimo_contacto: contactos.at(-1)?.fecha ?? null }
    }))
    setLoading(false)
  }, [])

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from("mcp_logs").select("*").order("created_at", { ascending: false }).limit(40)
    setLogs((data as McpLog[]) ?? [])
  }, [])

  useEffect(() => {
    if (!isActive || !user) return
    load()
    // Los coches aparecen solos mientras Claude los va guardando
    const channel = supabase
      .channel("coches_claude_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "coches_claude" }, () => {
        load()
        if (showLogs) loadLogs()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contactos_claude" }, () => load())
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [isActive, user, load, loadLogs, showLogs])

  useEffect(() => { if (showLogs) loadLogs() }, [showLogs, loadLogs])

  const counts = useMemo(() => {
    const c: Record<string, number> = { activos: 0, sin_respuesta: 0 }
    for (const s of CLAUDE_CAR_STATES) c[s] = 0
    for (const car of cars) {
      c[car.estado]++
      if (car.estado !== "descartado") c.activos++
      if (car.estado !== "descartado" && needsFollowUp(car.contactos)) c.sin_respuesta++
    }
    return c
  }, [cars])

  const [sort, setSort] = useState<SortKey>("recientes")
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as SortKey | null
      if (saved && SORT_OPTIONS.some(o => o.key === saved)) setSort(saved)
    } catch {}
  }, [])
  const changeSort = (key: SortKey) => {
    setSort(key)
    try { localStorage.setItem(SORT_STORAGE_KEY, key) } catch {}
  }

  // Filtros por rangos (precio, km, año…): se pueden combinar y se recuerdan en este navegador
  const [ranges, setRanges] = useState<CarRangeFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) ?? "null")
      if (saved && typeof saved === "object") setRanges(saved)
    } catch {}
  }, [])
  const changeRanges = (next: CarRangeFilters) => {
    setRanges(next)
    try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }
  const nFilters = activeFilterCount(ranges)
  const brands = useMemo(() => [...new Set(cars.map(c => c.marca).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "es")), [cars])

  const visible = useMemo(
    () => sortClaudeCars(cars.filter(car =>
      (filter === "activos" ? car.estado !== "descartado"
        : filter === "sin_respuesta" ? car.estado !== "descartado" && needsFollowUp(car.contactos)
          : car.estado === filter) && matchesCarFilters(car, ranges)), sort),
    [cars, filter, sort, ranges],
  )

  const patch = (id: string, changes: Partial<ClaudeCar>) =>
    setCars(prev => prev.map(car => (car.id === id ? { ...car, ...changes } : car)))

  const setState = async (car: ClaudeCar, estado: ClaudeCarState) => {
    const previous = car.estado
    patch(car.id, { estado })
    const { error } = await supabase.from("coches_claude").update({ estado, updated_at: new Date().toISOString() }).eq("id", car.id)
    if (error) {
      patch(car.id, { estado: previous })
      toast.error("No se pudo cambiar el estado: " + error.message)
    }
  }

  const moveToMyCars = async (car: ClaudeCar) => {
    if (!user) return
    setBusyId(car.id)
    try {
      const { data, error } = await supabase
        .from("imported_cars")
        .insert({ ...claudeCarToImportedCar(car), user_id: user.id })
        .select("id")
        .single()
      if (error) throw error
      const { error: linkError } = await supabase
        .from("coches_claude")
        .update({ movido_a: data.id, updated_at: new Date().toISOString() })
        .eq("id", car.id)
      if (linkError) throw linkError
      patch(car.id, { movido_a: data.id })
      await supabase.from("activity_logs").insert({ user_id: user.id, action: "ADD_CAR", details: `Movido desde Claude: ${car.marca ?? ""} ${car.modelo ?? ""}`.trim() })
      toast.success("Añadido a tus coches de Importación", {
        action: { label: "Ver", onClick: () => window.dispatchEvent(new CustomEvent("changeTab", { detail: { tab: "import" } })) },
      })
    } catch (error: any) {
      toast.error("No se pudo mover: " + (error?.message ?? error))
    } finally {
      setBusyId(null)
    }
  }

  if (loading && isActive) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="h-6 w-6 text-primary" /> Guardados por Claude
          </h2>
          <p className="text-muted-foreground">Coches que Claude encuentra y guarda desde claude.ai. Coste y beneficio con la misma fórmula que la Calculadora.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowLogs(v => !v)}>
            <History className="h-4 w-4" /> Registro
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load() }}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
      </div>

      {showLogs && <LogsPanel logs={logs} />}

      <ClaudeSearchPanel />

      <ClaudeReviewPanel cars={cars} />

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={sort} onValueChange={v => changeSort(v as SortKey)}>
          <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 rounded-full text-sm" aria-label="Ordenar por">
            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${nFilters ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros{nFilters ? <span className="tabular rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{nFilters}</span> : null}
        </button>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {(["activos", "sin_respuesta", ...CLAUDE_CAR_STATES] as Filter[]).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${filter === f ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}
          >
            {f === "activos" ? "Activos" : f === "sin_respuesta" ? `Sin respuesta +${NO_REPLY_DAYS} días` : CLAUDE_CAR_STATE_LABELS[f]} <span className="tabular opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RangeInput label="Precio Alemania (€)" min={ranges.precioMin} max={ranges.precioMax} step={500}
              onChange={(precioMin, precioMax) => changeRanges({ ...ranges, precioMin, precioMax })} />
            <RangeInput label="Kilómetros" min={ranges.kmMin} max={ranges.kmMax} step={5000}
              onChange={(kmMin, kmMax) => changeRanges({ ...ranges, kmMin, kmMax })} />
            <RangeInput label="Año" min={ranges.anioMin} max={ranges.anioMax} step={1}
              onChange={(anioMin, anioMax) => changeRanges({ ...ranges, anioMin, anioMax })} />
            <RangeInput label="Coste en España máx. (€)" max={ranges.costeMax} step={500} onlyMax
              onChange={(_, costeMax) => changeRanges({ ...ranges, costeMax })} />
            <RangeInput label="Beneficio mín. (€)" min={ranges.beneficioMin} step={500} onlyMin
              onChange={beneficioMin => changeRanges({ ...ranges, beneficioMin })} />
          </div>
          {brands.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Marca</span>
              {brands.map(b => {
                const on = ranges.marcas?.includes(b)
                return (
                  <button key={b} type="button"
                    onClick={() => changeRanges({ ...ranges, marcas: on ? ranges.marcas!.filter(m => m !== b) : [...(ranges.marcas ?? []), b] })}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                    {b}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{visible.length} coche(s) con estos filtros</span>
            {nFilters > 0 && <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => changeRanges({})}>Quitar filtros</button>}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {cars.length > 0 && nFilters > 0 ? (
            <>Ningún coche cumple los filtros. <button type="button" className="font-medium text-foreground underline" onClick={() => changeRanges({})}>Quitar filtros</button></>
          ) : cars.length === 0
            ? "Todavía no hay coches. Pídele a Claude en claude.ai que busque coches en mobile.de y los guarde con la herramienta guardar_coche."
            : filter === "sin_respuesta" ? "Nadie te debe una respuesta: todos los vendedores han contestado o se les escribió hace menos de 3 días." : "No hay coches en este estado."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(car => (
            <ClaudeCarCard
              key={car.id}
              car={car}
              busy={busyId === car.id}
              onState={estado => setState(car, estado)}
              onMove={() => moveToMyCars(car)}
              onPatch={changes => patch(car.id, changes)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ClaudeCarCard({ car, busy, onState, onMove, onPatch }: {
  car: ClaudeCar
  busy: boolean
  onState: (estado: ClaudeCarState) => void
  onMove: () => void
  onPatch: (changes: Partial<ClaudeCar>) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState("")
  const bookmarkRef = useRef<HTMLAnchorElement>(null)
  // React no deja poner href="javascript:…" en JSX: se pone a mano
  useEffect(() => { if (pasteOpen) setTimeout(() => bookmarkRef.current?.setAttribute("href", BOOKMARKLET), 0) }, [pasteOpen])
  const { photos, main: mainPhoto, startIndex } = carPhotoList(car)
  const contactos = car.contactos ?? []
  const lastContact = contactos.at(-1)
  const waitingSince = awaitingReplySince(contactos)
  const followUp = needsFollowUp(contactos)

  /** Vuelve a sacar todas las fotos del anuncio (el Worker las copia por tandas: se repite hasta terminar) */
  const refreshPhotos = async (given?: string[]) => {
    setRefreshing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Tu sesión ha caducado")
      let result: any = null
      for (let round = 0; round < 3; round++) {
        const res = await fetch(`${MCP_WORKER_URL}/api/fotos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify(given ? { id: car.id, fotos: given } : { id: car.id }),
        })
        result = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(result.error || `Error ${res.status}`)
        onPatch({ fotos: result.car.fotos, foto_url: result.car.foto_url, foto_posicion_y: result.car.foto_posicion_y })
        if (!result.pendientes) break
      }
      const n = result.car.fotos?.length ?? 0
      // El portal bloquea al servidor (mobile.de): se copian desde el navegador con el marcador
      if (!given && result.leidas == null) { setPasteOpen(true); return }
      if (given) { setPasteOpen(false); setPasted("") }
      if (result.avisos?.length) toast.warning(`${n} foto(s). ${result.avisos[0]}`)
      else toast.success(`${n} foto(s) guardadas${result.leidas != null ? ` de ${result.leidas} del anuncio` : ""}`)
    } catch (error: any) {
      toast.error("No se pudieron actualizar las fotos: " + (error?.message ?? error))
    } finally {
      setRefreshing(false)
    }
  }

  /** "Fijar como principal": la foto pasa delante y se recalcula el encuadre con sus medidas reales */
  const setMain = async (src: string) => {
    const size = await new Promise<{ width: number; height: number } | null>(resolve => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = src
    })
    const fotos = [src, ...photos.filter(p => p !== src)]
    const changes = { fotos, foto_url: src, foto_posicion_y: autoFramingY(size) }
    const { error } = await supabase.from("coches_claude").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", car.id)
    if (error) { toast.error("No se pudo fijar la foto: " + error.message); return }
    onPatch(changes)
    setViewerIndex(0)
    toast.success("Foto principal cambiada")
  }
  const title = [car.marca, car.modelo].filter(Boolean).join(" ") || "Coche sin nombre"
  const lines = car.desglose?.lines ?? []
  const taxLine = lines.find(l => l.label === "Impuesto de matriculación")
  const href = car.url.startsWith("http") ? car.url : `https://${car.url}`
  const discarded = car.estado === "descartado"

  return (
    <div className={`group relative overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${discarded ? "opacity-70 hover:opacity-100" : ""}`}>
      <div className="absolute left-2.5 top-2.5 z-10 flex flex-wrap gap-1">
        <Badge className={`border-transparent shadow-sm ${STATE_STYLES[car.estado]}`}>{CLAUDE_CAR_STATE_LABELS[car.estado]}</Badge>
        {car.movido_a && <Badge variant="secondary" className="bg-background/90 shadow-sm backdrop-blur">En mis coches</Badge>}
        {lastContact && (
          waitingSince ? (
            <Badge className={`border-transparent shadow-sm ${followUp ? "bg-warning text-warning-foreground" : "bg-background/90 text-foreground backdrop-blur"}`} title={followUp ? "Sin respuesta: toca insistir" : undefined}>
              <Clock className="h-3 w-3" /> Contactado {ago(waitingSince)}
            </Badge>
          ) : (
            <Badge className="border-transparent bg-success text-success-foreground shadow-sm">
              <MessageSquare className="h-3 w-3" /> Respondió {ago(lastContact.fecha)}
            </Badge>
          )
        )}
        {car.anuncio_estado === "retirado" && !discarded && (
          <Badge className="border-transparent bg-destructive text-white shadow-sm" title="La revisión diaria no encuentra el anuncio; a la 2.ª vez seguida se descarta">
            Anuncio retirado {car.anuncio_fallos_seguidos ?? 1}/2
          </Badge>
        )}
        {car.precio_bajado && !discarded && (
          <Badge className="border-transparent bg-primary text-primary-foreground shadow-sm" title="Bajó de precio: coste y beneficio recalculados">
            <TrendingDown className="h-3 w-3" /> Bajó de precio
          </Badge>
        )}
      </div>

      {/* Foto principal encuadrada para que se vea el coche (no el cielo); al pulsar, galería con todas */}
      {mainPhoto ? (
        <button
          type="button"
          onClick={() => {
            // Para depurar si el visor no enseña fotos: qué recibe exactamente
            console.info(`[visor] ${car.id}: ${photos.length} foto(s), abre en la ${startIndex + 1}`, photos)
            setViewerIndex(startIndex)
          }}
          className="relative block aspect-[16/10] w-full overflow-hidden bg-muted"
          title={photos.length > 1 ? `Ver las ${photos.length} fotos` : "Ver foto"}
        >
          <img
            src={mainPhoto}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ objectPosition: `center ${car.foto_posicion_y ?? DEFAULT_PHOTO_POSITION_Y}%` }}
          />
          <span className="tabular absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            <Images className="h-3.5 w-3.5" /> 1/{photos.length}
          </span>
        </button>
      ) : (
        <div className="flex aspect-[16/10] w-full items-center justify-center bg-muted text-sm text-muted-foreground">Sin foto</div>
      )}
      <button
        type="button"
        onClick={() => refreshPhotos()}
        disabled={refreshing}
        title="Actualizar fotos desde el anuncio"
        className="absolute right-2.5 top-2.5 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/55 px-2.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-70"
      >
        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{refreshing ? "Actualizando…" : "Actualizar fotos"}</span>
      </button>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Copiar las fotos desde tu navegador</DialogTitle>
          <DialogDescription>
            {(() => { try { return new URL(href).hostname.replace(/^(www|suchen)\./, "") } catch { return "Este portal" } })()} no deja que el servidor lea el anuncio.
            Cópialo desde tu navegador y guardaré todas las fotos de la galería.
          </DialogDescription>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Arrastra este botón a tu barra de marcadores (solo la primera vez; si ya lo tenías, vuelve a arrastrarlo, porque ahora copia todas las fotos):{" "}
              <a ref={bookmarkRef} onClick={e => { e.preventDefault(); toast.info("Arrástralo a la barra de marcadores; no se usa desde aquí.") }}
                className="ml-1 inline-flex cursor-grab items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground no-underline">
                <Bookmark className="h-3 w-3" /> Copiar para NorDrive
              </a>
            </li>
            <li><a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">Abre el anuncio</a> y pulsa ese marcador.</li>
            <li>Vuelve aquí y pega (Ctrl+V) en el recuadro.</li>
          </ol>
          <textarea
            rows={3}
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            placeholder="Pega aquí (Ctrl+V)…"
            className="w-full resize-none rounded-md border bg-muted/30 p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              try { setPasted(await navigator.clipboard.readText()) } catch { toast.error("No se pudo leer el portapapeles: pega con Ctrl+V") }
            }}>
              <ClipboardPaste className="h-4 w-4" /> Pegar
            </Button>
            <Button size="sm" disabled={refreshing || !pasted.trim()} onClick={() => {
              const list = photosFromPasted(pasted)
              if (!list.length) { toast.error("No he encontrado fotos en lo pegado. Usa el marcador «Copiar para NorDrive» en la página del anuncio."); return }
              refreshPhotos(list)
            }}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />} Guardar fotos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PhotoViewer
        photos={photos}
        open={viewerIndex != null}
        index={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        mainPhoto={mainPhoto}
        onSetMain={setMain}
        title={title}
      />

      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-snug">{[car.marca, car.modelo].filter(Boolean).join(" ") || "Coche sin nombre"}</h3>
          {car.version && <p className="truncate text-sm text-muted-foreground">{car.version}</p>}
          <p className="tabular mt-0.5 text-xs text-muted-foreground">
            {[
              car.anio ? (car.mes_matriculacion ? `${String(car.mes_matriculacion).padStart(2, "0")}/${car.anio}` : car.anio) : null,
              car.km != null ? `${car.km.toLocaleString("es-ES")} km` : null,
              car.potencia_cv ? `${car.potencia_cv} CV` : null,
              car.combustible,
              car.co2 != null ? `${car.co2} g/km CO₂` : null,
            ].filter(Boolean).join(" · ") || "Sin datos"}
          </p>
        </div>

        {(car.viaje_ciudad_origen || car.viaje_km || car.viaje_coste_ruta != null) && (
          <p className="text-sm text-muted-foreground" title={[
            car.viaje_coste_ruta != null ? `Ruta (gasolina + peajes): ${formatEUR(car.viaje_coste_ruta)}` : null,
            car.viaje_extras ? `Extras (vuelo, hotel, comidas, placas): ${formatEUR(car.viaje_extras)}` : null,
            travelTransport(car) != null ? `Transporte total: ${formatEUR(travelTransport(car)!)}` : null,
            car.viaje_detalle,
          ].filter(Boolean).join("\n") || undefined}>
            🚗 {[
              `${car.viaje_ciudad_origen ?? "?"} → ${TRAVEL_DESTINATION}`,
              car.viaje_km ? `${car.viaje_km.toLocaleString("es-ES")} km` : null,
              formatTravelHours(car.viaje_horas),
              car.viaje_coste_ruta != null ? formatEUR(car.viaje_coste_ruta) : null,
            ].filter(Boolean).join(" · ")}
            {!!car.viaje_extras && <span className="text-xs"> + {formatEUR(car.viaje_extras)} extras</span>}
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {(car.tipo_vendedor || car.nombre_vendedor) && (
            <span>{car.tipo_vendedor === "concesionario" ? "Concesionario" : car.tipo_vendedor === "particular" ? "Particular" : "Vendedor"}{car.nombre_vendedor ? `: ${car.nombre_vendedor}` : ""}</span>
          )}
          {car.valoracion_vendedor != null && <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" /> {car.valoracion_vendedor}</span>}
          {car.unfallfrei != null && (
            <span className={`inline-flex items-center gap-0.5 ${car.unfallfrei ? "text-success" : "text-destructive"}`}>
              <ShieldCheck className="h-3 w-3" /> {car.unfallfrei ? "Sin accidentes" : "Con accidente"}
            </span>
          )}
          {car.duenos != null && <span>{car.duenos} {car.duenos === 1 ? "dueño" : "dueños"}</span>}
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3 text-sm">
          <dt className="text-muted-foreground">Precio Alemania</dt>
          <dd className="tabular text-right font-medium">
            {car.precio_alemania != null ? formatEUR(car.precio_alemania) : "—"}
            {car.iva_deducible && car.precio_neto ? <span className="block text-xs font-normal text-muted-foreground">neto {formatEUR(car.precio_neto)} (IVA deducible)</span> : null}
          </dd>
          <dt className="text-muted-foreground">Impuesto matriculación</dt>
          <dd className="tabular text-right font-medium">
            {taxLine ? formatEUR(taxLine.amount) : "—"}
            {car.desglose?.impuesto_aplicado === "claude" && <span className="block text-xs font-normal text-muted-foreground">de Claude · app {formatEUR(car.impuesto_calculado ?? 0)}</span>}
          </dd>
          {car.valor_hacienda ? (
            <>
              <dt className="text-muted-foreground">Valor Hacienda</dt>
              <dd className="tabular text-right font-medium" title={car.valor_hacienda_version ?? undefined}>
                {formatEUR(car.valor_hacienda)}
                <span className="block text-xs font-normal text-muted-foreground">{car.valor_hacienda_origen === "tabla" ? "tablas BOE 2026" : "de Claude"}</span>
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Coste en España</dt>
          <dd className="tabular text-right text-lg font-semibold tracking-tight">{formatEUR(car.coste_total_espana ?? 0)}</dd>
          <dt className="text-muted-foreground">Venta estimada</dt>
          <dd className="tabular text-right font-medium">{car.precio_venta_estimado_espana ? formatEUR(car.precio_venta_estimado_espana) : "—"}</dd>
        </dl>

        {car.beneficio != null && (
          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${car.beneficio >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            <span className="font-medium">Beneficio</span>
            <span className="tabular font-semibold">{formatEUR(car.beneficio)}{car.margen_pct != null && ` · ${car.margen_pct}%`}</span>
          </div>
        )}

        {car.verificar_version && (
          <p className="flex gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><b>Verificar versión:</b> el valor de Hacienda es de «{car.valor_hacienda_version}», pero hay otras versiones posibles en las tablas.</span>
          </p>
        )}

        <SaleEaseMeter car={car} onPatch={onPatch} />

        {car.aviso_impuesto && (
          <p className="flex gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {car.aviso_impuesto}
          </p>
        )}

        {car.notas && (
          <p className={`whitespace-pre-line text-sm text-muted-foreground ${open ? "" : "line-clamp-3"}`}>
            <span className="font-medium text-foreground">Notas de Claude: </span>{car.notas}
          </p>
        )}

        <button type="button" onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {open ? "Ocultar" : "Ver"} desglose{car.notas ? ", notas" : ""}{contactos.length ? ` y ${contactos.length} mensaje(s)` : ""}
        </button>
        {open && (
          <dl className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
            {lines.map(line => (
              <div key={line.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{line.label}{line.hint && <span className="block opacity-70">{line.hint}</span>}</dt>
                <dd className="tabular shrink-0">{formatEUR(line.amount, 2)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t pt-1 font-medium">
              <dt>Total</dt><dd className="tabular">{formatEUR(car.coste_total_espana ?? 0, 2)}</dd>
            </div>
          </dl>
        )}
        {open && contactos.length > 0 && <ContactTimeline contactos={contactos} />}

        <Select value={car.estado} onValueChange={v => onState(v as ClaudeCarState)}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CLAUDE_CAR_STATES.map(s => <SelectItem key={s} value={s}>{CLAUDE_CAR_STATE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="flex-1" onClick={onMove} disabled={busy || !!car.movido_a} title={car.movido_a ? "Ya está en tus coches" : undefined}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} {car.movido_a ? "Movido" : "Mover a mis coches"}
          </Button>
          {discarded ? (
            <Button size="sm" variant="outline" onClick={() => onState("nuevo")}><Undo2 className="h-4 w-4" /> Recuperar</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onState("descartado")}><XCircle className="h-4 w-4" /> Descartar</Button>
          )}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" /> Abrir anuncio
          </a>
        </div>
      </div>
    </div>
  )
}

/** Mensajes con el vendedor: enviados a la derecha, recibidos a la izquierda */
function ContactTimeline({ contactos }: { contactos: ClaudeContact[] }) {
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><MessageSquare className="h-3.5 w-3.5" /> Contactos con el vendedor</p>
      {contactos.map(c => {
        const sent = c.direccion === "enviado"
        return (
          <div key={c.id} className={`flex ${sent ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-xs ${sent ? "rounded-br-sm bg-primary/10" : "rounded-bl-sm border bg-background"}`}>
              <p className="mb-1 text-[11px] text-muted-foreground">
                {new Date(c.fecha).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {" · "}{CONTACT_CHANNEL_LABELS[c.canal] ?? c.canal}
                {" · "}{sent ? (c.enviado_por === "usuario" ? "Tú" : "Claude") : "Vendedor"}
              </p>
              {c.asunto && <p className="mb-0.5 font-medium">{c.asunto}</p>}
              <p className="whitespace-pre-line break-words">{c.mensaje}</p>
              {c.notas && <p className="mt-1 border-t pt-1 text-xs text-muted-foreground">{c.notas}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LogsPanel({ logs }: { logs: McpLog[] | null }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <p className="mb-3 text-sm font-semibold">Registro de llamadas de Claude</p>
      {logs == null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin llamadas todavía.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
          {logs.map(log => (
            <li key={log.id} className="flex flex-wrap gap-x-2">
              <span className="tabular text-muted-foreground">{new Date(log.created_at).toLocaleString("es-ES")}</span>
              <span className="font-mono">{log.herramienta}</span>
              <span className={log.ok ? "text-success" : "text-destructive"}>{log.ok ? "ok" : "error"}</span>
              <span className="min-w-0 break-words text-muted-foreground">{log.ok ? log.resumen : log.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
