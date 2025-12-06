"use client"

import { useState, useEffect } from "react"
import { Plus, ShoppingBag, TrendingUp, Calendar, Loader2 } from "lucide-react"
import { BoughtCarCard } from "@/components/cards/bought-car-card"
import { MarkAsBoughtModal } from "@/components/modals/mark-as-bought-modal"
import { SellCarModal } from "@/components/modals/sell-car-modal"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

interface BoughtCar {
  id: string
  brand: string
  model: string
  year: number
  initialPrice: number
  initialExpenses: number
  datePurchased: string
  status: "inventory" | "sold"
  sellPrice?: number
  dateSold?: string
  buyer?: string
  expenses: Expense[]
}

interface Expense {
  id: string
  concept: string
  amount: number
  date: string
  category: string
  notes?: string
}

export function CarsManagement() {
  const { user } = useAuth()
  const [boughtCars, setBoughtCars] = useState<BoughtCar[]>([])
  const [loading, setLoading] = useState(true)
  const [markAsBoughtModalOpen, setMarkAsBoughtModalOpen] = useState(false)
  const [sellCarModalOpen, setSellCarModalOpen] = useState(false)
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "inventory" | "sold">("all")

  // Cargar datos desde Supabase
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

      // Transformar datos de snake_case (DB) a camelCase (Frontend)
      const formattedCars: BoughtCar[] = carsData.map((car: any) => ({
        id: car.id,
        brand: car.brand,
        model: car.model,
        year: car.year,
        initialPrice: Number(car.initial_price),
        initialExpenses: Number(car.initial_expenses),
        datePurchased: car.date_purchased,
        status: car.status,
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
      // 1. Obtener datos del coche importado (si viene de ahí)
      // Nota: Aquí asumimos que data.carId es el ID de imported_cars
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
            price: importedCar.price,
            expenses: importedCar.total_cost - importedCar.price // Aproximación de gastos
          }
        }
      }

      // 2. Insertar en inventory_cars
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
          status: 'inventory'
        })
        .select()
        .single()

      if (error) throw error

      toast.success("Coche añadido al inventario")
      setMarkAsBoughtModalOpen(false)
      fetchCars() // Recargar lista
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
          sell_price: data.sellPrice,
          date_sold: data.dateSold,
          buyer: data.buyer
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
    if (!confirm("¿Estás seguro de eliminar este coche del inventario?")) return

    try {
      const { error } = await supabase
        .from('inventory_cars')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast.success("Coche eliminado")
      fetchCars()
    } catch (error) {
      toast.error("Error al eliminar coche")
    }
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
          <h2 className="text-3xl font-bold mb-2">Coches Comprados</h2>
          <p className="text-muted-foreground">Gestiona tu inventario ({boughtCars.length})</p>
        </div>
        <button
          onClick={() => setMarkAsBoughtModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Marcar como Comprado
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

      {/* Filtros */}
      <div className="flex gap-2">
        {(["all", "inventory", "sold"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
          >
            {f === "all" ? "Todos" : f === "inventory" ? "En Inventario" : "Vendidos"}
          </button>
        ))}
      </div>

      {/* Lista de Coches */}
      {filteredCars.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No hay coches registrados</p>
          <button onClick={() => setMarkAsBoughtModalOpen(true)} className="text-primary hover:underline font-medium">
            Marca tu primer coche como comprado
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCars.map((car) => (
            <BoughtCarCard
              key={car.id}
              car={car}
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
