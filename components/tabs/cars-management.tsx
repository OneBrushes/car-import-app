"use client"

import { useState, useEffect } from "react"
import { Plus, ShoppingBag, TrendingUp, Calendar, Loader2, LayoutList, LayoutDashboard } from "lucide-react"
import { BoughtCarCard } from "@/components/cards/bought-car-card"
import { MarkAsBoughtModal } from "@/components/modals/mark-as-bought-modal"
import { SellCarModal } from "@/components/modals/sell-car-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import { Car } from "lucide-react"

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
}

const KANBAN_COLUMNS: { id: LogisticStatus; label: string; color: string }[] = [
  { id: "purchased", label: "Comprado", color: "bg-blue-500" },
  { id: "in_transit", label: "En Tránsito / Grúa", color: "bg-orange-500" },
  { id: "homologation", label: "Trámites / ITV", color: "bg-purple-500" },
  { id: "detailing", label: "Taller / Limpieza", color: "bg-pink-500" },
  { id: "ready", label: "En Stock / Listo", color: "bg-emerald-500" },
]

export function CarsManagement() {
  const { user, isGodMode, profile } = useAuth()
  const [boughtCars, setBoughtCars] = useState<BoughtCar[]>([])
  const [loading, setLoading] = useState(true)
  const [markAsBoughtModalOpen, setMarkAsBoughtModalOpen] = useState(false)
  const [sellCarModalOpen, setSellCarModalOpen] = useState(false)
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "inventory" | "sold">("inventory")
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban")

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [carToDelete, setCarToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (user) fetchCars()
  }, [user])

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
        }))
      }))

      setBoughtCars(formattedCars)
    } catch (error) {
      console.error("Error fetching inventory:", error)
      toast.error("Error al cargar el inventario")
    } finally {
      setLoading(false)
    }
  }

  const markAsBought = async (data: any) => {
    if (!user) return

    try {
      let carData = {
        brand: "Desconocido",
        model: "Desconocido",
        year: new Date().getFullYear(),
        price: 0,
        expenses: 0
      }

      if (data.carId) {
        const { data: importedCar } = await supabase
          .from('imported_cars')
          .select('*')
          .eq('id', data.carId)
          .single()

        if (importedCar) {
          carData = {
            brand: importedCar.brand,
            model: importedCar.model,
            year: importedCar.year,
            price: 0,
            expenses: 0
          }
        }
      }

      const { data: newCar, error } = await supabase
        .from('inventory_cars')
        .insert({
          user_id: user.id,
          brand: carData.brand,
          model: carData.model,
          year: carData.year,
          initial_price: carData.price,
          initial_expenses: carData.expenses,
          date_purchased: data.datePurchased,
          status: 'inventory',
          logistic_status: 'purchased'
        })
        .select()
        .single()

      if (error) throw error

      toast.success("Coche añadido al inventario. Frecuencia lo puedes mover en el Kanban.")
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

  const markAsSold = async (carId: string, data: any) => {
    try {
      const { error } = await supabase
        .from('inventory_cars')
        .update({
          status: 'sold',
          sell_price: data.sellPrice === "" ? null : Number(data.sellPrice),
          date_sold: data.dateSold === "" ? null : data.dateSold,
          buyer: data.buyer === "" ? null : data.buyer
        })
        .eq('id', carId)

      if (error) throw error

      toast.success("¡Coche marcado como vendido!")
      setSellCarModalOpen(false)
      setSelectedCarId(null)
      fetchCars()
    } catch (error) {
      toast.error("Error al actualizar estado")
    }
  }

  const deleteCar = async (id: string) => {
    setCarToDelete(id)
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    if (!carToDelete) return
    try {
      const { error } = await supabase
        .from('inventory_cars')
        .delete()
        .eq('id', carToDelete)

      if (error) throw error

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

  const updateLogisticStatus = async (carId: string, newStatus: LogisticStatus) => {
    // Optimistic UI update
    setBoughtCars(prev => prev.map(c => c.id === carId ? { ...c, logistic_status: newStatus } : c))
    
    try {
      const { error } = await supabase
        .from('inventory_cars')
        .update({ logistic_status: newStatus })
        .eq('id', carId)
        
      if (error) throw error
      
      toast.success("Fase logística actualizada")
    } catch(err) {
      toast.error("Error al actualizar el estado logístico")
      fetchCars() // Revert UI
    }
  }

  const handleDragStart = (e: React.DragEvent, carId: string) => {
    e.dataTransfer.setData("carId", carId)
  }

  const handleDrop = (e: React.DragEvent, status: LogisticStatus) => {
    e.preventDefault()
    const carId = e.dataTransfer.getData("carId")
    if (carId) {
      const car = boughtCars.find(c => c.id === carId)
      if (car && car.logistic_status !== status) {
        updateLogisticStatus(carId, status)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2">Coches en Patrulla</h2>
          <p className="text-muted-foreground">Gestiona la logística y los gastos de tu inventario ({boughtCars.length})</p>
        </div>
        <button
          onClick={() => setMarkAsBoughtModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Añadir Coche Comprado
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Vendidos" value={stats.totalSold} icon={ShoppingBag} />
        <StatCard
          label="Beneficio Total"
          value={`€${stats.totalProfit.toLocaleString()}`}
          icon={TrendingUp}
          highlight={stats.totalProfit > 0}
        />
        <StatCard label="Rentabilidad Media" value={`${stats.avgProfitability.toFixed(1)}%`} icon={TrendingUp} />
        <StatCard label="En Inventario" value={stats.carsInInventory} icon={Calendar} />
      </div>

      {/* Filtros & Vista Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-2">
          {(["all", "inventory", "sold"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                 setFilter(f)
                 if (f === "sold") setViewMode("list") // Kanban doesn't make sense for sold cars
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
            >
              {f === "all" ? "Todos" : f === "inventory" ? "En Inventario" : "Vendidos"}
            </button>
          ))}
        </div>

        {filter !== 'sold' && (
          <div className="flex bg-secondary p-1 rounded-lg">
             <button
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === "kanban" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
             >
                <LayoutDashboard className="w-4 h-4" /> Tablero Kanban
             </button>
             <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
             >
                <LayoutList className="w-4 h-4" /> Lista Clásica
             </button>
          </div>
        )}
      </div>

      {/* VISTA KANBAN */}
      {viewMode === "kanban" && filter !== "sold" && (
         <div className="flex gap-4 overflow-x-auto pb-6 pt-2 snap-x">
            {KANBAN_COLUMNS.map((column) => {
               const columnCars = filteredCars.filter(car => (car.logistic_status || 'purchased') === column.id && car.status === 'inventory')
               
               return (
                  <div 
                     key={column.id}
                     onDragOver={handleDragOver}
                     onDrop={(e) => handleDrop(e, column.id)}
                     className="flex-shrink-0 w-80 bg-secondary/30 rounded-xl border border-border p-3 flex flex-col snap-center"
                     style={{ minHeight: '500px' }}
                  >
                     <div className="flex items-center gap-2 mb-4">
                        <div className={`w-3 h-3 rounded-full ${column.color}`}></div>
                        <h3 className="font-bold text-sm uppercase tracking-wider">{column.label}</h3>
                        <span className="ml-auto bg-background px-2 py-0.5 rounded-full text-xs font-semibold">{columnCars.length}</span>
                     </div>
                     
                     <div className="flex flex-col gap-3 flex-1">
                        {columnCars.map(car => (
                           <div 
                              key={car.id} 
                              draggable
                              onDragStart={(e) => handleDragStart(e, car.id)}
                              className="bg-card cursor-grab active:cursor-grabbing border-l-4 border-y border-r border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-all divide-y divide-border"
                              style={{ borderLeftColor: `var(--tw-colors-${column.color.split('-')[1]}-500)` }}
                           >
                              <div className="pb-2">
                                 <div className="font-bold text-base leading-tight flex items-center justify-between">
                                    <span className="truncate">{car.brand} {car.model}</span>
                                 </div>
                                 <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1">
                                    <Calendar className="w-3 h-3" /> {new Date(car.datePurchased).toLocaleDateString()}
                                 </div>
                              </div>
                              <div className="pt-2 flex justify-between items-center mt-2 gap-2">
                                 <div className="text-sm font-semibold truncate flex-shrink min-w-0">
                                    €{car.initialPrice.toLocaleString()}
                                 </div>
                                 <div className="flex-shrink-0 flex gap-1">
                                   <button 
                                      onClick={() => { setSelectedCarId(car.id); setSellCarModalOpen(true); }}
                                      className="text-xs bg-primary/10 text-primary px-2 py-1 flex items-center justify-center rounded hover:bg-primary/20 transition-colors"
                                      title="Vender Coche"
                                   >
                                     <ShoppingBag className="w-3.5 h-3.5" />
                                   </button>
                                   <button 
                                      onClick={() => setViewMode("list")} // Volver a la lista para editar gastos
                                      className="text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 flex items-center justify-center rounded"
                                      title="Ver Detalles y Gastos"
                                   >
                                     <LayoutList className="w-3.5 h-3.5" />
                                   </button>
                                 </div>
                              </div>
                           </div>
                        ))}
                        {columnCars.length === 0 && (
                           <div className="flex-1 border-2 border-dashed border-border/50 rounded-lg flex flex-col items-center justify-center text-muted-foreground/50 italic text-sm">
                              Arrastra un coche aquí
                           </div>
                        )}
                     </div>
                  </div>
               )
            })}
         </div>
      )}

      {/* VISTA LISTA CLÁSICA */}
      {(viewMode === "list" || filter === "sold") && (
        filteredCars.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <p className="text-muted-foreground mb-4">No hay coches registrados en este filtro.</p>
            <button onClick={() => setMarkAsBoughtModalOpen(true)} className="text-primary hover:underline font-medium">
              Marca tu primer coche como comprado
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCars.map((car) => (
              <BoughtCarCard
                key={car.id}
                car={{...car, logistic_status: car.logistic_status || 'purchased'}} // Propagación normal de props
                onAddExpense={(expense) => addExpense(car.id, expense)}
                onRemoveExpense={(expenseId) => removeExpense(car.id, expenseId)}
                onMarkAsSold={() => {
                  setSelectedCarId(car.id)
                  setSellCarModalOpen(true)
                }}
                onDelete={() => deleteCar(car.id)}
              />
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
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className={`text-xl font-bold ${highlight ? "text-accent" : ""}`}>{value}</p>
        </div>
        <Icon className={`w-5 h-5 ${highlight ? "text-accent" : "text-muted-foreground"}`} />
      </div>
    </div>
  )
}
