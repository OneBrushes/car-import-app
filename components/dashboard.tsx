"use client"

import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Zap, Loader2 } from "lucide-react"
import { RecentSalesSection } from "@/components/dashboard/recent-sales"
import { HighlightsSection } from "@/components/dashboard/highlights"
import { DashboardCharts } from "@/components/dashboard/charts"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"

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
  expenses: any[]
}

interface ImportedCar {
  id: string
  brand: string
  model: string
  year: number
  price: number
  totalExpenses?: number
  mileage?: number
  cv?: number
  origin?: string
}

interface DashboardProps {
  isActive?: boolean
}

export function Dashboard({ isActive = true }: DashboardProps) {
  const { user, isGodMode } = useAuth()
  const [loading, setLoading] = useState(true)
  const [boughtCars, setBoughtCars] = useState<BoughtCar[]>([])
  const [importedCars, setImportedCars] = useState<ImportedCar[]>([])
  const [stats, setStats] = useState({
    totalSold: 0,
    totalProfit: 0,
    avgProfitability: 0,
    totalInvestment: 0,
    carsInInventory: 0,
    avgDaysInInventory: 0,
    totalFacturacion: 0,
    comparisons: [] as any[],
    globalExpenses: 0
  })

  useEffect(() => {
    if (user && isActive) fetchData()
  }, [user, isActive])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 1. Cargar Inventario (con gastos)
      const { data: inventoryData } = await supabase
        .from('inventory_cars')
        .select(`*, expenses:car_expenses(*)`)

      // 2. Cargar Importados
      const { data: importedData } = await supabase
        .from('imported_cars')
        .select('*')

      // 3. Cargar Comparativas
      const { data: comparisonsData } = await supabase
        .from('comparisons')
        .select('*')

      // 4. Cargar Gastos Globales
      const { data: globalExpensesData } = await supabase
        .from('global_expenses')
        .select('amount')

      // Filtrado Local basado en God Mode
      const myInventory = isGodMode ? inventoryData : (inventoryData || []).filter(item => item.user_id === user?.id)
      const myImported = isGodMode ? importedData : (importedData || []).filter(item => item.user_id === user?.id || (item.shared_with && item.shared_with.includes(user?.id)))
      const myComparisons = isGodMode ? comparisonsData : (comparisonsData || []).filter(item => item.user_id === user?.id)

      // Transformar datos para que coincidan con las interfaces
      const formattedInventory: BoughtCar[] = (myInventory || []).map((car: any) => ({
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
        expenses: (car.expenses || []).map((e: any) => ({
          ...e,
          amount: Number(e.amount)
        }))
      }))

      const formattedImported: ImportedCar[] = (myImported || []).map((car: any) => ({
        id: car.id,
        brand: car.brand,
        model: car.model,
        year: car.year,
        price: Number(car.price),
        totalExpenses: Number(car.total_cost),
        mileage: Number(car.mileage),
        cv: Number(car.cv),
        origin: car.origin
      }))

      setBoughtCars(formattedInventory)
      setImportedCars(formattedImported)

      // Calcular Estadísticas
      let totalSold = 0
      let totalProfit = 0
      const profitPercentages: number[] = []
      let totalInvestment = 0
      let carsInInventory = 0
      const daysInInventory: number[] = []
      let totalFacturacion = 0

      formattedInventory.forEach((car) => {
        const totalInvested =
          car.initialPrice + car.initialExpenses + (car.expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0)

        if (car.status === "sold" && car.sellPrice) {
          totalSold++
          totalFacturacion += car.sellPrice
          const profit = car.sellPrice - totalInvested
          totalProfit += profit
          profitPercentages.push((profit / totalInvested) * 100)

          if (car.datePurchased && car.dateSold) {
            const days = Math.floor(
              (new Date(car.dateSold).getTime() - new Date(car.datePurchased).getTime()) / (1000 * 60 * 60 * 24),
            )
            daysInInventory.push(days)
          }
        } else {
          carsInInventory++
          totalInvestment += totalInvested
          totalProfit -= totalInvested // Cashflow realista: restamos inversión de coches no vendidos
        }
      })

      const avgDays =
        daysInInventory.length > 0 ? Math.round(daysInInventory.reduce((a, b) => a + b, 0) / daysInInventory.length) : 0

      const avgProfit =
        profitPercentages.length > 0 ? profitPercentages.reduce((a, b) => a + b, 0) / profitPercentages.length : 0

      const globalExpenses = (globalExpensesData || []).reduce((sum: number, exp: any) => sum + Number(exp.amount), 0)
      
      // Ajustar el Beneficio Neto restando los gastos fijos empresariales
      totalProfit -= globalExpenses

      setStats({
        totalSold,
        totalProfit,
        avgProfitability: avgProfit,
        totalInvestment,
        carsInInventory,
        avgDaysInInventory: avgDays,
        totalFacturacion,
        comparisons: myComparisons || [],
        globalExpenses,
      })

    } catch (error) {
      console.error("Error loading dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Encabezado */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Dashboard</h2>
        <p className="text-muted-foreground">Overview de tu negocio de importación de coches</p>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Coches Vendidos" value={stats.totalSold} icon={ShoppingCart} color="primary" />
        <MetricCard
          title="Beneficio Total"
          value={`€${stats.totalProfit.toLocaleString()}`}
          icon={DollarSign}
          color={stats.totalProfit >= 0 ? "success" : "destructive"}
          trend={stats.totalProfit}
        />
        <MetricCard
          title="Rentabilidad Media"
          value={`${stats.avgProfitability.toFixed(1)}%`}
          icon={TrendingUp}
          color={stats.avgProfitability >= 0 ? "success" : "destructive"}
        />
        <MetricCard title="En Inventario" value={stats.carsInInventory} icon={Zap} color="primary" />
      </div>

      {/* Fila 2 de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Gastos Fijos Empresa"
          value={`€${stats.globalExpenses.toLocaleString()}`}
          icon={TrendingDown}
          color="destructive"
          size="small"
        />
        <MetricCard
          title="Inversión Activa"
          value={`€${stats.totalInvestment.toLocaleString()}`}
          icon={TrendingDown}
          color="primary"
          size="small"
        />
        <MetricCard
          title="Días Promedio Venta"
          value={`${stats.avgDaysInInventory} días`}
          icon={TrendingUp}
          color="primary"
          size="small"
        />
        <MetricCard
          title="Facturación Total"
          value={`€${stats.totalFacturacion.toLocaleString()}`}
          icon={DollarSign}
          color="primary"
          size="small"
        />
      </div>

      {/* Sección de Destacados */}
      <HighlightsSection boughtCars={boughtCars} />

      {/* Sección de Últimas Ventas */}
      <RecentSalesSection boughtCars={boughtCars} />

      {/* Gráficos Analíticos */}
      <DashboardCharts boughtCars={boughtCars} importedCars={importedCars} />
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string | number
  icon: any
  color?: string
  trend?: number
  size?: "normal" | "small"
}

function MetricCard({ title, value, icon: Icon, color = "foreground", trend, size = "normal" }: MetricCardProps) {
  const colorClass =
    color === "primary"
      ? "text-primary"
      : color === "success"
        ? "text-success"
        : color === "destructive"
          ? "text-destructive"
          : "text-muted-foreground"

  const iconBg =
    color === "primary"
      ? "bg-primary/10"
      : color === "success"
        ? "bg-success/10"
        : color === "destructive"
          ? "bg-destructive/10"
          : "bg-muted"

  const isSmall = size === "small"

  return (
    <div className={`bg-card border border-border rounded-xl shadow-xs ${isSmall ? "p-4" : "p-5"} transition-shadow hover:shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className={`tabular mt-1.5 font-semibold tracking-tight ${isSmall ? "text-xl" : "text-2xl"}`}>{value}</p>
        </div>
        <div className={`flex shrink-0 items-center justify-center rounded-lg ${iconBg} ${isSmall ? "h-8 w-8" : "h-9 w-9"}`}>
          <Icon className={`h-4 w-4 ${colorClass}`} />
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1">
          {trend >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-success" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-destructive" />
          )}
          <span className={`text-xs font-medium ${trend >= 0 ? "text-success" : "text-destructive"}`}>
            {trend >= 0 ? "Beneficio neto positivo" : "Beneficio neto negativo"}
          </span>
        </div>
      )}
    </div>
  )
}
