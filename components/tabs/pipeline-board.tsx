"use client"

import { useEffect, useMemo, useState } from "react"
import { Ban, Car as CarIcon, Eye, EyeOff, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { MarkAsBoughtModal, type MarkAsBoughtData } from "@/components/modals/mark-as-bought-modal"
import { SellCarModal, type SellCarData } from "@/components/modals/sell-car-modal"
import { markImportedCarAsBought, printInvoiceForCar, sellInventoryCar } from "@/lib/sales"
import { OPEN_CAR_EVENT, type OpenCarDetail } from "@/components/command-palette"
import { cn } from "@/lib/utils"
import { loadClientCars, type ClientCarInfo } from "@/lib/client-cars"

type ImportedStage = "found" | "contacted" | "negotiating"
type LogisticStage = "purchased" | "in_transit" | "homologation" | "detailing" | "ready"
/** Solo para coches de cliente (asignados en "Área cliente") */
type ClientStage = "preparing" | "delivered"
type StageId = ImportedStage | LogisticStage | ClientStage | "sold"

interface Column {
  id: StageId
  label: string
  source: "imported" | "inventory" | "client"
  hint: string
}

const COLUMNS: Column[] = [
  { id: "found", label: "Encontrado", source: "imported", hint: "Anuncios guardados" },
  { id: "contacted", label: "Contactado", source: "imported", hint: "Mensaje enviado" },
  { id: "negotiating", label: "Negociando", source: "imported", hint: "Precio en discusión" },
  { id: "purchased", label: "Comprado", source: "inventory", hint: "Pagado, por recoger" },
  { id: "in_transit", label: "Transporte", source: "inventory", hint: "Camión o grúa" },
  { id: "homologation", label: "Trámites / ITV", source: "inventory", hint: "Homologación y matrícula" },
  { id: "detailing", label: "Taller", source: "inventory", hint: "Puesta a punto" },
  { id: "ready", label: "A la venta", source: "inventory", hint: "Listo para vender" },
  { id: "sold", label: "Vendido", source: "inventory", hint: "Últimos 60 días" },
]

/** Se ven solo si hay algún coche de cliente */
const CLIENT_COLUMNS: Column[] = [
  { id: "preparing", label: "En preparación", source: "client", hint: "Coche de cliente" },
  { id: "delivered", label: "Entregado", source: "client", hint: "Coche de cliente · 60 días" },
]

const IMPORTED_STAGES: ImportedStage[] = ["found", "contacted", "negotiating"]
const LOGISTIC_STAGES: LogisticStage[] = ["purchased", "in_transit", "homologation", "detailing", "ready"]

interface BoardCard {
  key: string
  table: "imported_cars" | "inventory_cars"
  id: string
  stage: StageId
  title: string
  subtitle: string
  amount: number | null
  amountLabel: string
  image?: string | null
  days?: number
  raw: any
}

const eur = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"
const daysSince = (date?: string | null) => (date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : undefined)

export function PipelineBoard({ isActive = true, embedded = false }: { isActive?: boolean; embedded?: boolean }) {
  const { user, isGodMode, profile } = useAuth()
  const [imported, setImported] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [clientCars, setClientCars] = useState<Map<string, ClientCarInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState<StageId | null>(null)
  const [showDiscarded, setShowDiscarded] = useState(false)

  const [buyCarId, setBuyCarId] = useState<string | null>(null)
  const [sellCar, setSellCar] = useState<any | null>(null)

  const companyRole = ["importador", "admin", "super_admin"].includes(profile?.role || "")

  const load = async () => {
    setLoading(true)
    const [imp, inv, clients] = await Promise.all([
      supabase
        .from("imported_cars")
        .select("id, user_id, shared_with, brand, model, year, mileage, price, total_cost, contacted, pipeline_stage, image_url, images, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("inventory_cars")
        .select("*, expenses:car_expenses(amount)")
        .order("created_at", { ascending: false }),
      loadClientCars(),
    ])
    setClientCars(clients)
    if (imp.error) toast.error("Error al cargar importación")
    if (inv.error) toast.error("Error al cargar inventario")

    // Mismas reglas de visibilidad que las pestañas Importación y Comprados
    const myImported = (imp.data || []).filter((car: any) =>
      isGodMode || car.user_id === user?.id || (car.shared_with || []).includes(user?.id))
    const myInventory = (inv.data || []).filter((car: any) =>
      isGodMode || companyRole || car.user_id === user?.id)

    setImported(myImported)
    setInventory(myInventory)
    setLoading(false)
  }

  useEffect(() => {
    if (user && isActive) load()
  }, [user, isActive, isGodMode])

  const cards = useMemo(() => {
    const bought = new Set(inventory.map(c => c.imported_car_id).filter(Boolean))
    const result: BoardCard[] = []

    for (const car of imported) {
      if (bought.has(car.id)) continue
      if (car.pipeline_stage === "discarded" && !showDiscarded) continue
      const stage: ImportedStage = car.pipeline_stage === "negotiating" ? "negotiating" : car.contacted ? "contacted" : "found"
      const total = Number(car.total_cost) || Number(car.price) || null
      result.push({
        key: `i-${car.id}`,
        table: "imported_cars",
        id: car.id,
        stage,
        title: `${car.brand} ${car.model}`,
        subtitle: [car.year, car.mileage ? `${Number(car.mileage).toLocaleString("es-ES")} km` : null].filter(Boolean).join(" · "),
        amount: total,
        amountLabel: "Coste estimado",
        image: car.images?.[0] || car.image_url,
        days: daysSince(car.created_at),
        raw: car,
      })
    }

    const soldCutoff = Date.now() - 60 * 86400000
    for (const car of inventory) {
      const extra = (car.expenses || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
      const invested = (Number(car.initial_price) || 0) + (Number(car.initial_expenses) || 0) + extra
      if (car.status === "sold") {
        if (car.date_sold && new Date(car.date_sold).getTime() < soldCutoff) continue
        const profit = car.sell_price != null ? Number(car.sell_price) - invested : null
        result.push({
          key: `v-${car.id}`,
          table: "inventory_cars",
          id: car.id,
          stage: "sold",
          title: `${car.brand} ${car.model}`,
          subtitle: [car.year, car.buyer].filter(Boolean).join(" · "),
          amount: profit,
          amountLabel: "Beneficio",
          days: daysSince(car.date_purchased),
          raw: car,
        })
        continue
      }
      const client = clientCars.get(car.id)
      if (client) {
        // Coche de cliente: sus fases propias e importe = honorarios
        if (car.logistic_status === "delivered" && car.delivered_at && new Date(car.delivered_at).getTime() < soldCutoff) continue
        const stage: StageId = car.logistic_status === "delivered" ? "delivered"
          : car.logistic_status === "preparing" ? "preparing"
          : (LOGISTIC_STAGES as string[]).includes(car.logistic_status) && car.logistic_status !== "ready" ? (car.logistic_status as LogisticStage) : "purchased"
        result.push({
          key: `v-${car.id}`,
          table: "inventory_cars",
          id: car.id,
          stage,
          title: `${car.brand} ${car.model}`,
          subtitle: [car.year, client.customerName].filter(Boolean).join(" · "),
          amount: car.client_fee != null ? Number(car.client_fee) : null,
          amountLabel: "Honorarios",
          days: daysSince(car.date_purchased),
          raw: car,
        })
        continue
      }
      const stage = (LOGISTIC_STAGES as string[]).includes(car.logistic_status) ? (car.logistic_status as LogisticStage) : "purchased"
      result.push({
        key: `v-${car.id}`,
        table: "inventory_cars",
        id: car.id,
        stage,
        title: `${car.brand} ${car.model}`,
        subtitle: [car.year, car.plate].filter(Boolean).join(" · "),
        amount: invested,
        amountLabel: "Invertido",
        days: daysSince(car.date_purchased),
        raw: car,
      })
    }
    return result
  }, [imported, inventory, showDiscarded, clientCars])

  // Las columnas de cliente solo aparecen si hay algún coche de cliente
  const columns = useMemo(() => (inventory.some(c => clientCars.has(c.id)) ? [...COLUMNS, ...CLIENT_COLUMNS] : COLUMNS), [inventory, clientCars])

  const canEditImported = (car: any) => isGodMode || car.user_id === user?.id

  const moveImported = async (card: BoardCard, stage: ImportedStage | "discarded" | null) => {
    if (!canEditImported(card.raw)) {
      toast.error("Solo el propietario puede mover este coche")
      return
    }
    const update =
      stage === "found" ? { contacted: false, pipeline_stage: null }
        : stage === "contacted" ? { contacted: true, pipeline_stage: null }
          : stage === "negotiating" ? { contacted: true, pipeline_stage: "negotiating" }
            : stage === "discarded" ? { pipeline_stage: "discarded" }
              : { pipeline_stage: null }
    setImported(prev => prev.map(c => (c.id === card.id ? { ...c, ...update } : c)))
    const { error } = await supabase.from("imported_cars").update(update).eq("id", card.id)
    if (error) {
      toast.error("No se pudo mover: " + error.message)
      load()
    }
  }

  const moveInventory = async (card: BoardCard, stage: LogisticStage | ClientStage) => {
    const patch: Record<string, unknown> = { logistic_status: stage }
    if (stage === "delivered") patch.delivered_at = new Date().toISOString()
    setInventory(prev => prev.map(c => (c.id === card.id ? { ...c, ...patch } : c)))
    const { error } = await supabase.from("inventory_cars").update(patch).eq("id", card.id)
    if (error) {
      toast.error(/delivered_at/.test(error.message) ? "Falta ejecutar supabase/2026-10_coches_de_cliente.sql en Supabase" : "No se pudo mover: " + error.message)
      load()
      return
    }
    if (stage === "delivered") toast.success("Entregado: el cliente ya lo ve y puede dejar su opinión")
  }

  const handleDrop = (stage: StageId, key: string) => {
    setDragOver(null)
    const card = cards.find(c => c.key === key)
    if (!card || card.stage === stage) return

    if (card.table === "imported_cars") {
      if ((IMPORTED_STAGES as string[]).includes(stage)) return moveImported(card, stage as ImportedStage)
      if (stage === "purchased") return setBuyCarId(card.id)
      toast.info("Primero pásalo a «Comprado»")
      return
    }

    if (card.stage === "sold") {
      toast.info("Un coche vendido no se puede mover")
      return
    }
    const isClientCar = clientCars.has(card.id)
    if (stage === "preparing" || stage === "delivered") {
      if (!isClientCar) { toast.info("Estas columnas son para coches de cliente (asígnalo en «Área cliente»)"); return }
      return moveInventory(card, stage)
    }
    if (isClientCar && (stage === "ready" || stage === "sold")) {
      toast.info("Es un coche de cliente: usa «En preparación» y «Entregado»")
      return
    }
    if (stage === "sold") return setSellCar(toSellModalCar(card.raw))
    if ((LOGISTIC_STAGES as string[]).includes(stage)) return moveInventory(card, stage as LogisticStage)
    toast.info("Un coche comprado no puede volver a importación")
  }

  const openCard = (card: BoardCard) => {
    const tab = card.table === "imported_cars" ? "import" : "management"
    window.dispatchEvent(new CustomEvent("changeTab", { detail: { tab } }))
    setTimeout(() => window.dispatchEvent(new CustomEvent<OpenCarDetail>(OPEN_CAR_EVENT, { detail: { table: card.table, id: card.id } })), 80)
  }

  const onBought = async (data: MarkAsBoughtData) => {
    if (!user) return
    try {
      await markImportedCarAsBought(user.id, data)
      toast.success("Coche pasado a inventario")
      setBuyCarId(null)
      load()
    } catch (error: any) {
      toast.error("No se pudo marcar como comprado: " + error.message)
    }
  }

  const onSold = async (data: SellCarData) => {
    if (!sellCar) return
    try {
      await sellInventoryCar(sellCar.id, data)
      toast.success("¡Vendido!")
      const carId = sellCar.id
      setSellCar(null)
      load()
      if (data.generateInvoice) {
        const problem = await printInvoiceForCar(carId)
        if (problem) toast.error(problem)
      }
    } catch (error: any) {
      toast.error("No se pudo registrar la venta: " + error.message)
    }
  }

  const totals = useMemo(() => {
    const map = new Map<StageId, { count: number; amount: number }>()
    for (const card of cards) {
      const t = map.get(card.stage) || { count: 0, amount: 0 }
      t.count++
      t.amount += card.amount || 0
      map.set(card.stage, t)
    }
    return map
  }, [cards])

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 animate-in">
      <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end", embedded ? "sm:justify-end -mt-2" : "sm:justify-between")}>
        {!embedded && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-1">Proceso</h2>
            <p className="text-muted-foreground">Cada coche desde que lo encuentras hasta que lo vendes. Arrastra las tarjetas para avanzar.</p>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowDiscarded(v => !v)}>
          {showDiscarded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showDiscarded ? "Ocultar descartados" : "Ver descartados"}
        </Button>
      </div>

      <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {columns.map((column, index) => {
          const columnCards = cards.filter(c => c.stage === column.id)
          const total = totals.get(column.id)
          const isBoundary = index > 0 && columns[index - 1].source !== column.source
          return (
            <div key={column.id} className={cn("flex shrink-0", isBoundary && "border-l-2 border-dashed pl-3")}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(column.id) }}
                onDragLeave={() => setDragOver(prev => (prev === column.id ? null : prev))}
                onDrop={e => { e.preventDefault(); handleDrop(column.id, e.dataTransfer.getData("text/plain")) }}
                className={cn(
                  "flex w-64 flex-col rounded-xl border bg-muted/40 p-2.5 transition-colors",
                  dragOver === column.id && "border-primary bg-primary/5"
                )}
                style={{ minHeight: 420 }}
              >
                <div className="mb-2.5 px-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{column.label}</h3>
                    <span className="tabular rounded-full bg-background px-2 py-0.5 text-xs font-medium">{total?.count ?? 0}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {column.hint}
                    {total && total.amount !== 0 && <span className="tabular"> · {eur(total.amount)}</span>}
                  </p>
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {columnCards.map(card => {
                    const discarded = card.raw.pipeline_stage === "discarded"
                    return (
                      <div
                        key={card.key}
                        draggable={!discarded}
                        onDragStart={e => e.dataTransfer.setData("text/plain", card.key)}
                        onClick={() => openCard(card)}
                        className={cn(
                          "group cursor-grab rounded-lg border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing",
                          discarded && "opacity-50"
                        )}
                      >
                        <div className="flex gap-2.5">
                          <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                            {card.image ? (
                              <img src={card.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center"><CarIcon className="h-4 w-4 text-muted-foreground/60" /></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-tight">{card.title}</p>
                            <p className="tabular truncate text-xs text-muted-foreground">{card.subtitle || "—"}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                          {card.amount != null ? (
                            <span className={cn("tabular font-medium", card.stage === "sold" && (card.amount >= 0 ? "text-success" : "text-destructive"))}>
                              {card.stage === "sold" && card.amount > 0 ? "+" : ""}{eur(card.amount)}
                            </span>
                          ) : <span />}
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {card.days != null && <span className="tabular">{card.days} d</span>}
                            {card.table === "imported_cars" && canEditImported(card.raw) && (
                              <button
                                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                                title={discarded ? "Recuperar" : "Descartar"}
                                onClick={e => { e.stopPropagation(); moveImported(card, discarded ? null : "discarded") }}
                              >
                                {discarded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {columnCards.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground/70">
                      Arrastra aquí
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <MarkAsBoughtModal
        isOpen={!!buyCarId}
        initialCarId={buyCarId}
        onClose={() => setBuyCarId(null)}
        onSubmit={onBought}
      />

      {sellCar && (
        <SellCarModal
          isOpen={!!sellCar}
          car={sellCar}
          onClose={() => setSellCar(null)}
          onSubmit={onSold}
        />
      )}
    </div>
  )
}

/** El modal de venta espera el formato de la pestaña Comprados */
function toSellModalCar(car: any) {
  return {
    id: car.id,
    brand: car.brand,
    model: car.model,
    year: car.year,
    plate: car.plate,
    vin: car.vin,
    initialPrice: Number(car.initial_price) || 0,
    initialExpenses: Number(car.initial_expenses) || 0,
    expenses: (car.expenses || []).map((e: any) => ({ amount: Number(e.amount) || 0 })),
  }
}
