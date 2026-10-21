"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, ShoppingBag, TrendingUp, Calendar, Loader2, LayoutList, KanbanSquare } from "lucide-react"
import { PipelineBoard } from "@/components/tabs/pipeline-board"
import { Button } from "@/components/ui/button"
import { BoughtCarCard } from "@/components/cards/bought-car-card"
import { MarkAsBoughtModal } from "@/components/modals/mark-as-bought-modal"
import { SellCarModal } from "@/components/modals/sell-car-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { loadClientCars } from "@/lib/client-cars"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import { markImportedCarAsBought, printInvoiceForCar, sellInventoryCar } from "@/lib/sales"
import { removePrivateFiles } from "@/lib/private-files"
import { OPEN_CAR_EVENT, type OpenCarDetail } from "@/components/command-palette"
import type { MarkAsBoughtData } from "@/components/modals/mark-as-bought-modal"
import type { SellCarData } from "@/components/modals/sell-car-modal"

interface Expense {
  id: string
  concept: string
  amount: number
  date: string
  category: string
  notes?: string
}

export type LogisticStatus = "purchased" | "in_transit" | "homologation" | "detailing" | "ready"

interface BoughtCar {
  id: string
  brand: string
  model: string
  year: number
  initialPrice: number
  initialExpenses: number
  datePurchased: string
  status: "inventory" | "sold"
  logistic_status: LogisticStatus
  sellPrice?: number
  dateSold?: string
  buyer?: string
  expenses: Expense[]
  documents?: any[]
  matriculation_checklist?: any
  customer_id?: string | null
  imported_car_id?: string | null
  invoice_number?: string | null
  plate?: string | null
  vin?: string | null
}

export function CarsManagement({ isActive = true }: { isActive?: boolean }) {
  const { user, isGodMode, profile } = useAuth()
  const [boughtCars, setBoughtCars] = useState<BoughtCar[]>([])
  const [loading, setLoading] = useState(true)
  const [markAsBoughtModalOpen, setMarkAsBoughtModalOpen] = useState(false)
  const [sellCarModalOpen, setSellCarModalOpen] = useState(false)
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "inventory" | "sold">("inventory")
  const [viewMode, setViewMode] = useState<"list" | "board">("board")

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [carToDelete, setCarToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (user && isActive) fetchCars()
  }, [user, isActive, viewMode])

  // Abrir un coche concreto desde la búsqueda global (Ctrl+K) o desde el garaje virtual
  const pendingOpenRef = useRef<string | null>(null)
  useEffect(() => {
    const id = pendingOpenRef.current
    if (!id) return
    const car = boughtCars.find(c => c.id === id)
    if (!car) return
    pendingOpenRef.current = null
    setFilter(car.status === "sold" ? "sold" : "inventory")
    setTimeout(() => document.getElementById(`bought-car-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150)
  }, [boughtCars])

  useEffect(() => {
    const onOpenCar = (event: Event) => {
      const { table, id } = (event as CustomEvent<OpenCarDetail>).detail
      if (table !== "inventory_cars") return
      const car = boughtCars.find(c => c.id === id)
      setViewMode("list")
      if (!car) { pendingOpenRef.current = id; return }
      setFilter(car.status === "sold" ? "sold" : "inventory")
      setViewMode("list")
      setTimeout(() => document.getElementById(`bought-car-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
    }
    window.addEventListener(OPEN_CAR_EVENT, onOpenCar)
    return () => window.removeEventListener(OPEN_CAR_EVENT, onOpenCar)
  }, [boughtCars])

  const fetchCars = async () => {
    try {
      setLoading(true)
      const { data: carsData, error: carsError } = await supabase
        .from('inventory_cars')
        .select(`
          *,
          expenses:car_expenses(*)
        `)
        .order('created_at', { ascending: false })

      if (carsError) throw carsError
      const clientCars = await loadClientCars()

      // Bypass for God Mode or Admins/Importadores
      const isAdminOrGod = isGodMode || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'importador'
      const myData = isAdminOrGod ? carsData : carsData.filter((car: any) => car.user_id === user?.id)

      const formattedCars: BoughtCar[] = myData.map((car: any) => ({
        id: car.id,
        brand: car.brand,
        model: car.model,
        year: car.year,
        initialPrice: Number(car.initial_price),
        initialExpenses: Number(car.initial_expenses),
        datePurchased: car.date_purchased,
        status: car.status,
        logistic_status: car.logistic_status || 'purchased',
        sellPrice: car.sell_price ? Number(car.sell_price) : undefined,
        dateSold: car.date_sold,
        buyer: car.buyer,
        expenses: (car.expenses || []).map((e: any) => ({
          ...e,
          amount: Number(e.amount)
        })),
        documents: car.documents || [],
        matriculation_checklist: car.matriculation_checklist || {},
        customer_id: car.customer_id,
        imported_car_id: car.imported_car_id,
        invoice_number: car.invoice_number,
        plate: car.plate,
        vin: car.vin,
        mileage: car.mileage != null ? Number(car.mileage) : undefined,
        // Coche de cliente: no es inversión propia, cobra honorarios
        client_name: clientCars.get(car.id)?.customerName,
        client_fee: car.client_fee != null ? Number(car.client_fee) : null,
        delivered_at: car.delivered_at ?? null
      }))

      setBoughtCars(formattedCars)
    } catch (error) {
      console.error("Error fetching inventory:", error)
      toast.error("Error al cargar el inventario")
    } finally {
      setLoading(false)
    }
  }

  const markAsBought = async (data: MarkAsBoughtData) => {
    if (!user) return

    try {
      await markImportedCarAsBought(user.id, data)
      toast.success("Coche añadido al inventario. Puedes moverlo en el tablero.")
      setMarkAsBoughtModalOpen(false)
      fetchCars()
    } catch (error: any) {
      toast.error("Error al añadir coche: " + error.message)
    }
  }

  const addExpense = async (carId: string, expense: Omit<Expense, "id">) => {
    try {
      const { error } = await supabase
        .from('car_expenses')
        .insert({
          car_id: carId,
          concept: expense.concept,
          amount: expense.amount,
          date: expense.date,
          category: expense.category,
          notes: expense.notes
        })

      if (error) throw error
      toast.success("Gasto añadido")
      fetchCars()
    } catch (error) {
      toast.error("Error al guardar el gasto")
    }
  }

  const removeExpense = async (carId: string, expenseId: string) => {
    try {
      const { error } = await supabase
        .from('car_expenses')
        .delete()
        .eq('id', expenseId)

      if (error) throw error
      toast.success("Gasto eliminado")
      fetchCars()
    } catch (error) {
      toast.error("Error al eliminar el gasto")
    }
  }

  const markAsSold = async (carId: string, data: SellCarData) => {
    try {
      await sellInventoryCar(carId, data)
      toast.success("¡Coche marcado como vendido!")
      setSellCarModalOpen(false)
      setSelectedCarId(null)
      fetchCars()

      if (data.generateInvoice) {
        const problem = await printInvoiceForCar(carId)
        if (problem) toast.error(problem)
      }
    } catch (error: any) {
      toast.error("Error al registrar la venta: " + (error?.message || ""))
    }
  }

  const printInvoice = async (carId: string) => {
    const problem = await printInvoiceForCar(carId)
    if (problem) toast.error(problem)
    else fetchCars()
  }

  const deleteCar = async (id: string) => {
    setCarToDelete(id)
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    if (!carToDelete) return
    try {
      const car = boughtCars.find(c => c.id === carToDelete)
      const { error } = await supabase
        .from('inventory_cars')
        .delete()
        .eq('id', carToDelete)

      if (error) throw error

      // Borrar también sus documentos privados
      if (car?.documents?.length) await removePrivateFiles('car-documents', car.documents.map((d: any) => d.url))

      toast.success("Coche eliminado")
      fetchCars()
    } catch (error) {
      toast.error("Error al eliminar coche")
    } finally {
      setShowDeleteDialog(false)
      setCarToDelete(null)
    }
  }

  const cancelDelete = () => {
    setShowDeleteDialog(false)
    setCarToDelete(null)
  }

  const filteredCars = boughtCars.filter((car) => {
    if (filter === "all") return true
    return car.status === filter
  })

  const calculateStats = () => {
    let totalSold = 0
    let totalProfit = 0
    let avgProfitability = 0
    let totalInvestment = 0
    let carsInInventory = 0

    boughtCars.forEach((car) => {
      const totalInvested = car.initialPrice + car.initialExpenses + car.expenses.reduce((sum, e) => sum + e.amount, 0)

      if (car.status === "sold" && car.sellPrice) {
        totalSold++
        const profit = car.sellPrice - totalInvested
        totalProfit += profit
        const profitPercentage = (profit / totalInvested) * 100
        avgProfitability += profitPercentage
      } else {
        totalInvestment += totalInvested
        carsInInventory++
      }
    })

    const soldCars = boughtCars.filter((c) => c.status === "sold")
    const avgProfit = soldCars.length > 0 ? avgProfitability / soldCars.length : 0

    return {
      totalSold,
      totalProfit,
      avgProfitability: avgProfit,
      totalInvestment,
      carsInInventory,
    }
  }

  const stats = calculateStats()

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Comprados</h2>
          <p className="text-muted-foreground">
            {viewMode === "board"
              ? "Todo el proceso: del anuncio encontrado al coche vendido. Arrastra las tarjetas para avanzar."
              : `Gastos, documentos, matriculación y ventas de tu inventario (${boughtCars.length})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${viewMode === "board" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
            >
              <KanbanSquare className="h-4 w-4" /> Proceso
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${viewMode === "list" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
            >
              <LayoutList className="h-4 w-4" /> Lista y gastos
            </button>
          </div>
          {viewMode === "list" && (
            <Button onClick={() => setMarkAsBoughtModalOpen(true)}>
              <Plus className="h-4 w-4" /> Añadir coche comprado
            </Button>
          )}
        </div>
      </div>

      {/* VISTA PROCESO (tablero completo) */}
      {viewMode === "board" && <PipelineBoard isActive={isActive && viewMode === "board"} embedded />}

      {viewMode === "list" && (
        <>
          {/* Estadísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Vendidos" value={stats.totalSold} icon={ShoppingBag} />
            <StatCard
              label="Beneficio total"
              value={`${stats.totalProfit.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`}
              icon={TrendingUp}
              highlight={stats.totalProfit > 0}
            />
            <StatCard label="Rentabilidad media" value={`${stats.avgProfitability.toFixed(1)}%`} icon={TrendingUp} />
            <StatCard label="En inventario" value={stats.carsInInventory} icon={Calendar} />
          </div>

          {/* Filtros */}
          <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            {(["all", "inventory", "sold"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${filter === f ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
              >
                {f === "all" ? "Todos" : f === "inventory" ? "En inventario" : "Vendidos"}
              </button>
            ))}
          </div>
        </>
      )}

      {/* VISTA LISTA CLÁSICA */}
      {viewMode === "list" && (
        filteredCars.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-4">No hay coches registrados en este filtro.</p>
            <button onClick={() => setMarkAsBoughtModalOpen(true)} className="text-primary hover:underline font-medium">
              Marca tu primer coche como comprado
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCars.map((car) => (
              <div key={car.id} id={`bought-car-${car.id}`}>
              <BoughtCarCard
                car={{...car, logistic_status: car.logistic_status || 'purchased'}} // Propagación normal de props
                onAddExpense={(expense) => addExpense(car.id, expense)}
                onRemoveExpense={(expenseId) => removeExpense(car.id, expenseId)}
                onMarkAsSold={() => {
                  setSelectedCarId(car.id)
                  setSellCarModalOpen(true)
                }}
                onDelete={() => deleteCar(car.id)}
                onPrintInvoice={() => printInvoice(car.id)}
              />
              </div>
            ))}
          </div>
        )
      )}

      {/* Modales */}
      <MarkAsBoughtModal
        isOpen={markAsBoughtModalOpen}
        onClose={() => setMarkAsBoughtModalOpen(false)}
        onSubmit={markAsBought}
      />

      {selectedCarId && (
        <SellCarModal
          isOpen={sellCarModalOpen}
          car={boughtCars.find((c) => c.id === selectedCarId)!}
          onClose={() => {
            setSellCarModalOpen(false)
            setSelectedCarId(null)
          }}
          onSubmit={(data) => markAsSold(selectedCarId, data)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="¿Eliminar coche?"
        message="Esta acción es definitiva y no se puede deshacer. Se eliminará el coche y todos sus gastos asociados."
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        type="danger"
      />
    </div>
  )
}

function StatCard({ label, value, icon: Icon, highlight }: any) {
  return (
    <div className="bg-card border rounded-xl p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className={`text-xl font-bold ${highlight ? "text-success" : ""}`}>{value}</p>
        </div>
        <Icon className={`w-5 h-5 ${highlight ? "text-success" : "text-muted-foreground"}`} />
      </div>
    </div>
  )
}
