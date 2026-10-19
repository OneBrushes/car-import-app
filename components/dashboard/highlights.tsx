"use client"

import { Award, TrendingUp, Zap } from "lucide-react"

interface HighlightsSectionProps {
  boughtCars: any[]
}

export function HighlightsSection({ boughtCars }: HighlightsSectionProps) {
  const calculateHighlights = () => {
    const soldCars = boughtCars.filter((car) => car.status === "sold" && car.sellPrice)

    let mostProfitable: { car: any; percentage: number } | null = null
    let bestSale: { car: any; profit: number } | null = null
    let fastestSale: { car: any; days: number } | null = null
    let maxProfitability = Number.NEGATIVE_INFINITY
    let maxProfit = Number.NEGATIVE_INFINITY
    let minDays = Number.POSITIVE_INFINITY

    for (const car of soldCars) {
      const totalInvested =
        car.initialPrice + car.initialExpenses + (car.expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0)
      const profit = car.sellPrice - totalInvested
      const profitPercentage = (profit / totalInvested) * 100
      const days = Math.floor(
        (new Date(car.dateSold).getTime() - new Date(car.datePurchased).getTime()) / (1000 * 60 * 60 * 24),
      )

      if (profitPercentage > maxProfitability) {
        maxProfitability = profitPercentage
        mostProfitable = { car, percentage: profitPercentage }
      }

      if (profit > maxProfit) {
        maxProfit = profit
        bestSale = { car, profit }
      }

      if (days < minDays) {
        minDays = days
        fastestSale = { car, days }
      }
    }

    return { mostProfitable, bestSale, fastestSale }
  }

  const highlights = calculateHighlights()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Coche más rentable */}
      {highlights.mostProfitable && (
        <HighlightCard
          icon={Award}
          title="Coche Más Rentable"
          car={highlights.mostProfitable.car}
          metric={`${highlights.mostProfitable.percentage.toFixed(1)}%`}
          metricLabel="Rentabilidad"
        />
      )}

      {/* Mejor venta en €*/}
      {highlights.bestSale && (
        <HighlightCard
          icon={TrendingUp}
          title="Mejor Venta"
          car={highlights.bestSale.car}
          metric={`+${highlights.bestSale.profit.toLocaleString()}€`}
          metricLabel="Beneficio"
        />
      )}

      {/* Venta más rápida */}
      {highlights.fastestSale && (
        <HighlightCard
          icon={Zap}
          title="Venta Más Rápida"
          car={highlights.fastestSale.car}
          metric={`${highlights.fastestSale.days} días`}
          metricLabel="En inventario"
        />
      )}
    </div>
  )
}

interface HighlightCardProps {
  icon: any
  title: string
  car: any
  metric: string
  metricLabel: string
}

function HighlightCard({ icon: Icon, title, car, metric, metricLabel }: HighlightCardProps) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-xs">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className="truncate font-semibold">
            {car.brand} {car.model}
          </p>
        </div>
      </div>
      <div className="pt-3 border-t">
        <p className="text-xs text-muted-foreground mb-1">{metricLabel}</p>
        <p className="tabular text-2xl font-semibold tracking-tight">{metric}</p>
      </div>
    </div>
  )
}
