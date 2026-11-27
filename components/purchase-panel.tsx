"use client"

// Ficha de un coche de Comprados en un panel lateral (a pantalla completa en el móvil). Se abre al tocar un coche en el
// tablero o en la lista. La parte de arriba cambia según la fase: pago (reservado), checklist (trámites) o fase.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { PhotoViewer } from "@/components/photo-viewer"
import { loadPurchasePhotos, type PurchasePhoto } from "@/lib/purchase-photos"
import { MATRICULATION_STEPS, matriculationProgress } from "@/lib/matriculation"
import { CONTACT_CHANNEL_LABELS, type ClaudeContact } from "@/lib/claude-cars"
import {
  EXPENSE_CATEGORIES, LOGISTIC_LABELS, LOGISTIC_STAGES, QUICK_EXPENSES, expenseIcon, purchaseForecast, purchaseStageLabel, purchaseTotals,
  type ClaudeEstimate, type ExpenseCategory, type LogisticStage, type PurchaseCar,
} from "@/lib/purchases"
import { cn } from "@/lib/utils"

const eur = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("es-ES")} €`)
const today = () => new Date().toISOString().slice(0, 10)
const shortDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "")

function ago(iso?: string | null) {
  if (!iso) return ""
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return "hoy"
  if (days === 1) return "ayer"
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`
}

type ClaudeInfo = ClaudeEstimate & {
  id: string; url?: string | null; km?: number | null; anio?: number | null; potencia_cv?: number | null; nombre_vendedor?: string | null
}

interface PanelData {
  car: PurchaseCar & { mileage?: number | null; created_at?: string; matriculation_checklist?: Record<string, boolean> | null }
  photo: PurchasePhoto | null
  claude: ClaudeInfo | null
  lastContact: ClaudeContact | null
}

export function PurchasePanel({ carId, onClose, onChanged }: { carId: string | null; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const load = useCallback(async (id: string) => {
    const { data: car, error } = await supabase.from("inventory_cars").select("*, expenses:car_expenses(*)").eq("id", id).maybeSingle()
    if (error || !car) { toast.error("No se pudo abrir el coche"); closeRef.current(); return }
    const [photos, claude, contact] = await Promise.all([
      loadPurchasePhotos([car]).catch(() => new Map<string, PurchasePhoto>()),
      car.coche_claude_id
        ? supabase.from("coches_claude").select("id, url, km, anio, potencia_cv, nombre_vendedor, precio_alemania, coste_total_espana, precio_venta_estimado_espana").eq("id", car.coche_claude_id).maybeSingle()
        : Promise.resolve({ data: null }),
      car.coche_claude_id
        ? supabase.from("contactos_claude").select("*").eq("coche_id", car.coche_claude_id).order("fecha", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setData({ car, photo: photos.get(car.id) ?? null, claude: (claude.data as ClaudeInfo) ?? null, lastContact: (contact.data as ClaudeContact) ?? null })
  }, [])

  useEffect(() => {
    if (!carId) { setData(null); return }
    setLoading(true)
    load(carId).finally(() => setLoading(false))
  }, [carId, load])

  /** Guardar algo y recargar el panel (y la lista o el tablero de detrás) */
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    const { error } = await fn()
    if (error) { toast.error(/senal/.test(error.message) ? "Falta ejecutar supabase/2026-11_reservados.sql en Supabase" : error.message); return false }
    if (ok) toast.success(ok)
    if (carId) await load(carId)
    onChanged?.()
    return true
  }

  return (
    <Sheet open={!!carId} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg [&>button:last-child]:z-10 [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/60 [&>button:last-child]:p-1.5 [&>button:last-child]:text-white [&>button:last-child]:opacity-100 [&>button:last-child]:backdrop-blur">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data ? (
          <PanelBody data={data} run={run} />
        ) : (
          <SheetTitle className="sr-only">Coche</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  )
}

type Run = (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>

function PanelBody({ data, run }: { data: PanelData; run: Run }) {
  const { car, photo, claude, lastContact } = data
  const t = purchaseTotals(car)
  const forecast = purchaseForecast(car, claude)
  const stage = (car.status === "sold" ? null : (car.logistic_status ?? "purchased")) as LogisticStage | null
  const title = `${car.brand} ${car.model}`
  const km = car.mileage ?? claude?.km
  const details = [car.year ?? claude?.anio, km ? `${Number(km).toLocaleString("es-ES")} km` : null, claude?.potencia_cv ? `${claude.potencia_cv} CV` : null, car.plate].filter(Boolean).join(" · ")

  return (
    <div className="flex flex-col">
      <Gallery photo={photo} title={title} />

      <div className="space-y-1 px-5 pb-4 pt-4">
        <SheetTitle className="text-lg leading-tight">{title}</SheetTitle>
        <SheetDescription className="tabular">{details || "—"}</SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
            t.reservado ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : car.status === "sold" ? "bg-success/10 text-success" : "bg-primary/10 text-primary")}>
            {t.reservado ? "🤝 Reservado" : purchaseStageLabel(car)}
          </span>
          {car.date_purchased && <span className="text-muted-foreground">{t.reservado ? "desde" : "comprado"} {ago(car.date_purchased)}</span>}
          {claude?.url && (
            <a href={claude.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Ver anuncio <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {t.reservado ? <PaymentSection car={car} run={run} /> : stage && <StageSection car={car} stage={stage} run={run} />}
      <ExpensesSection car={car} run={run} />
      <Section title="Cuentas">
        {forecast ? (
          <dl className="space-y-1.5 text-sm">
            <Row label="Precio del coche" value={eur(t.precio)} hint={forecast.rebaja ? `${forecast.rebaja < 0 ? "rebaja" : "más"} de ${eur(Math.abs(forecast.rebaja))} sobre el anuncio` : undefined} />
            <Row label={forecast.superado ? "Gastos (los apuntados ya superan lo previsto)" : "Gastos previstos (impuesto, transporte, ITV…)"}
              value={eur(Math.max(forecast.gastosPrevistos, forecast.gastosApuntados))}
              hint={`apuntados ${eur(forecast.gastosApuntados)} de ${eur(forecast.gastosPrevistos)} previstos`} warn={forecast.superado} />
            <Row label="Coste total previsto" value={eur(forecast.coste)} strong />
            <Row label="Venta prevista" value={eur(forecast.venta)} />
            {forecast.beneficio != null && (
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-medium">Beneficio previsto</dt>
                <dd className={cn("tabular text-lg font-semibold", forecast.beneficio >= 0 ? "text-success" : "text-destructive")}>
                  {forecast.beneficio >= 0 ? "+" : ""}{eur(forecast.beneficio)}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <dl className="space-y-1.5 text-sm">
            <Row label="Precio del coche" value={eur(t.precio)} />
            <Row label="Gastos" value={eur(t.gastos)} />
            <Row label={t.reservado ? "Total previsto" : "Total invertido"} value={eur(t.invertido)} strong />
            {car.status === "sold" && car.sell_price != null && <Row label="Vendido por" value={eur(Number(car.sell_price))} />}
          </dl>
        )}
      </Section>

      {(lastContact || claude?.nombre_vendedor) && (
        <Section title="Vendedor">
          <div className="space-y-1 text-sm">
            {claude?.nombre_vendedor && <p className="font-medium">{claude.nombre_vendedor}</p>}
            {lastContact && (
              <>
                <p className="text-muted-foreground">
                  Último mensaje {lastContact.direccion === "recibido" ? "recibido" : "enviado"} {ago(lastContact.fecha)} · {CONTACT_CHANNEL_LABELS[lastContact.canal] ?? lastContact.canal}
                </p>
                <p className="line-clamp-3 rounded-md bg-muted/60 px-3 py-2 text-xs">{lastContact.mensaje}</p>
              </>
            )}
          </div>
        </Section>
      )}
      <div className="h-6" />
    </div>
  )
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value, hint, strong, warn }: { label: string; value: string; hint?: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("min-w-0", warn && "text-amber-700 dark:text-amber-400")}>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </dt>
      <dd className={cn("tabular shrink-0", strong && "font-semibold")}>{value}</dd>
    </div>
  )
}

function Gallery({ photo, title }: { photo: PurchasePhoto | null; title: string }) {
  const [index, setIndex] = useState(0)
  const [viewer, setViewer] = useState(false)
  useEffect(() => setIndex(0), [photo?.src])
  if (!photo) return <div className="flex aspect-[16/10] w-full items-center justify-center bg-muted text-sm text-muted-foreground">Sin foto</div>
  const n = photo.all.length
  const go = (d: number) => setIndex(i => (i + d + n) % n)
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
      <button className="block h-full w-full" onClick={() => setViewer(true)} aria-label="Ver fotos a pantalla completa">
        <img src={photo.all[index]} alt={title} className="h-full w-full object-cover"
          style={index === 0 ? { objectPosition: `center ${photo.posY}%` } : undefined} />
      </button>
      {n > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur hover:bg-black/70" aria-label="Foto anterior"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur hover:bg-black/70" aria-label="Foto siguiente"><ChevronRight className="h-5 w-5" /></button>
          <span className="tabular absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{index + 1}/{n}</span>
        </>
      )}
      <PhotoViewer photos={photo.all} open={viewer} index={index} onClose={() => setViewer(false)} title={title} />
    </div>
  )
}

function PaymentSection({ car, run }: { car: PanelData["car"]; run: Run }) {
  const t = purchaseTotals(car)
  const [editing, setEditing] = useState(false)
  const [precio, setPrecio] = useState(String(t.precio || ""))
  const [senal, setSenal] = useState(String(t.senal || ""))
  const pct = t.precio > 0 ? Math.min(100, (t.senal / t.precio) * 100) : 0

  const save = async () => {
    const p = Number(precio), s = senal.trim() === "" ? 0 : Number(senal)
    if (!(p > 0) || !Number.isFinite(s) || s < 0) { toast.error("Importe no válido"); return }
    if (await run(() => supabase.from("inventory_cars").update({ initial_price: p, senal: s }).eq("id", car.id), "Guardado")) setEditing(false)
  }
  const paid = () => run(async () => {
    const r = await supabase.from("inventory_cars").update({ logistic_status: "purchased", date_purchased: today() }).eq("id", car.id)
    if (!r.error && car.coche_claude_id) await supabase.from("coches_claude").update({ estado: "comprado", updated_at: new Date().toISOString() }).eq("id", car.coche_claude_id)
    return r
  }, "Pagado: pasa a «Comprado»")

  return (
    <Section title="Pago del coche" right={!editing && <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">Editar</button>}>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Precio acordado" value={precio} onChange={setPrecio} />
            <MoneyInput label="Señal pagada" value={senal} onChange={setSenal} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar</button>
            <button onClick={() => setEditing(false)} className="rounded-md border px-3 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="tabular mt-1.5 text-sm text-muted-foreground">{eur(t.senal)} pagados de {eur(t.precio)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Señal</p>
              <p className="tabular font-semibold">{eur(t.senal)} {t.senal > 0 && <span className="text-success">✓</span>}</p>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs text-muted-foreground">Falta por pagar</p>
              <p className="tabular font-semibold text-amber-700 dark:text-amber-400">{eur(t.pendiente)}</p>
            </div>
          </div>
          <button onClick={paid} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Ya he pagado el resto → Comprado
          </button>
        </div>
      )}
    </Section>
  )
}

function StageSection({ car, stage, run }: { car: PanelData["car"]; stage: LogisticStage; run: Run }) {
  const move = (next: LogisticStage) => run(() => supabase.from("inventory_cars").update({ logistic_status: next }).eq("id", car.id), `Pasado a «${LOGISTIC_LABELS[next]}»`)
  const checklist = car.matriculation_checklist ?? {}
  const toggle = (id: string, value: boolean) =>
    run(() => supabase.from("inventory_cars").update({ matriculation_checklist: { ...checklist, [id]: value } }).eq("id", car.id))
  return (
    <Section title="Fase">
      <div className="flex flex-wrap gap-1.5">
        {LOGISTIC_STAGES.filter(s => s !== "reserved").map(s => (
          <button key={s} onClick={() => s !== stage && move(s)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              s === stage ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {LOGISTIC_LABELS[s]}
          </button>
        ))}
      </div>
      {stage === "homologation" && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">Matriculación · {matriculationProgress(checklist)} %</p>
          {MATRICULATION_STEPS.map(step => (
            <label key={step.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={!!checklist[step.id]} onChange={e => toggle(step.id, e.target.checked)} className="h-4 w-4 accent-primary" />
              {step.label}
            </label>
          ))}
        </div>
      )}
    </Section>
  )
}

function ExpensesSection({ car, run }: { car: PanelData["car"]; run: Run }) {
  const t = purchaseTotals(car)
  const expenses = useMemo(() => [...(car.expenses ?? [])].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))), [car.expenses])
  const [draft, setDraft] = useState<{ concept: string; amount: string; date: string; category: ExpenseCategory } | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const conceptRef = useRef<HTMLInputElement>(null)

  const start = (q: (typeof QUICK_EXPENSES)[number]) => {
    setDraft({ concept: q.concept, amount: "", date: today(), category: q.category })
    setTimeout(() => (q.concept ? amountRef : conceptRef).current?.focus(), 30)
  }
  const add = async () => {
    if (!draft) return
    const amount = Number(draft.amount.replace(",", "."))
    if (!draft.concept.trim() || !(amount > 0)) { toast.error("Pon el concepto y el importe"); return }
    const ok = await run(() => supabase.from("car_expenses").insert({ car_id: car.id, concept: draft.concept.trim(), amount, date: draft.date, category: draft.category }), "Gasto apuntado")
    if (ok) setDraft(null)
  }
  const remove = (id: string, concept: string) => {
    if (!window.confirm(`¿Borrar «${concept}»?`)) return
    run(() => supabase.from("car_expenses").delete().eq("id", id), "Gasto borrado")
  }

  return (
    <Section title="Gastos" right={<span className="tabular text-sm font-semibold">{eur(t.gastos)}</span>}>
      {expenses.length > 0 ? (
        <ul className="mb-3 divide-y rounded-lg border">
          {expenses.map(e => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-base" aria-hidden>{expenseIcon(e)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{e.concept}</p>
                <p className="text-xs text-muted-foreground">{[e.category, shortDate(e.date)].filter(Boolean).join(" · ")}</p>
              </div>
              <span className="tabular font-medium">{eur(Number(e.amount))}</span>
              <button onClick={() => remove(e.id, e.concept)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive" aria-label={`Borrar ${e.concept}`}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !draft && <p className="mb-3 text-sm text-muted-foreground">Aún no hay gastos. {t.reservado ? "Puedes apuntar ya el vuelo o el hotel." : ""}</p>
      )}

      {draft ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <input ref={conceptRef} value={draft.concept} onChange={e => setDraft({ ...draft, concept: e.target.value })} placeholder="Concepto"
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <div className="relative">
              <input ref={amountRef} value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} onKeyDown={e => { if (e.key === "Enter") add() }}
                inputMode="decimal" placeholder="0" className="tabular w-full rounded-md border bg-background py-2 pl-3 pr-7 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>
            <button onClick={() => setDraft(null)} className="rounded-md border px-3 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_EXPENSES.map(q => (
            <button key={q.label} onClick={() => start(q)} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent">
              <Plus className="h-3 w-3" /> {q.label}
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}

function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <div className="relative mt-1">
        <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal"
          className="tabular w-full rounded-md border bg-background py-2 pl-3 pr-7 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm">€</span>
      </div>
    </label>
  )
}
