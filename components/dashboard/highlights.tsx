"use client"

import { Award, TrendingUp, Zap } from "lucide-react"

interface HighlightsSectionProps {
  boughtCars: any[]
}

export function HighlightsSection({ boughtCars }: HighlightsSectionProps) {
  const calculateHighlights = () => {
    const soldCars = boughtCars.filter((car) => car.status === "sold" && car.sellPrice)

    let mostProfitable = null
    let bestSale = null
    let fastestSale = null
    let maxProfitability = Number.NEGATIVE_INFINITY
    let maxProfit = Number.NEGATIVE_INFINITY
    let minDays = Number.POSITIVE_INFINITY

    soldCars.forEach((car) => {
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
    })

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
    <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-6 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-primary/20 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">
            {car.brand} {car.model}
          </p>
        </div>
      </div>
      <div className="pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground mb-1">{metricLabel}</p>
        <p className="text-2xl font-bold text-primary">{metric}</p>
      </div>
    </div>
  )
}
