"use client"

import { useState, useEffect } from "react"
import { Plus, ShoppingBag, TrendingUp, Calendar } from "lucide-react"
import { BoughtCarCard } from "@/components/cards/bought-car-card"
import { MarkAsBoughtModal } from "@/components/modals/mark-as-bought-modal"
import { SellCarModal } from "@/components/modals/sell-car-modal"

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
  const [boughtCars, setBoughtCars] = useState<BoughtCar[]>([])
  const [markAsBoughtModalOpen, setMarkAsBoughtModalOpen] = useState(false)
  const [sellCarModalOpen, setSellCarModalOpen] = useState(false)
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "inventory" | "sold">("all")

  // Cargar datos
  useEffect(() => {
    const saved = localStorage.getItem("boughtCars")
    if (saved) {
      setBoughtCars(JSON.parse(saved))
    }
  }, [])

  const saveCars = (updated: BoughtCar[]) => {
    setBoughtCars(updated)
    localStorage.setItem("boughtCars", JSON.stringify(updated))
  }

  const markAsBought = (data: any) => {
    const importedCars = JSON.parse(localStorage.getItem("importedCars") || "[]")
    const importedCar = importedCars.find((c: any) => c.id === data.carId)

    if (importedCar) {
      const boughtCar: BoughtCar = {
        id: Date.now().toString(),
        brand: importedCar.brand,
        model: importedCar.model,
        year: importedCar.year,
        initialPrice: importedCar.price,
        initialExpenses: importedCar.totalExpenses || 0,
        datePurchased: data.datePurchased,
        status: "inventory",
        expenses: [],
      }
      saveCars([...boughtCars, boughtCar])
      setMarkAsBoughtModalOpen(false)
    }
  }

  const addExpense = (carId: string, expense: Omit<Expense, "id">) => {
    const updated = boughtCars.map((car) => {
      if (car.id === carId) {
        return {
          ...car,
          expenses: [...car.expenses, { ...expense, id: Date.now().toString() }],
        }
      }
      return car
    })
    saveCars(updated)
  }

  const removeExpense = (carId: string, expenseId: string) => {
    const updated = boughtCars.map((car) => {
      if (car.id === carId) {
        return {
          ...car,
          expenses: car.expenses.filter((e) => e.id !== expenseId),
        }
      }
      return car
    })
    saveCars(updated)
  }

  const markAsSold = (carId: string, data: any) => {
    const updated = boughtCars.map((car) => {
      if (car.id === carId) {
        return {
          ...car,
          status: "sold" as const,
          sellPrice: data.sellPrice,
          dateSold: data.dateSold,
          buyer: data.buyer,
        }
      }
      return car
    })
    saveCars(updated)
    setSellCarModalOpen(false)
    setSelectedCarId(null)
  }

  const deleteCar = (id: string) => {
    saveCars(boughtCars.filter((c) => c.id !== id))
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
