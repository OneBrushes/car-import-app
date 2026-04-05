"use client"

import { X } from "lucide-react"

interface ComparativeCardGridProps {
  id: string
  importedCar: any
  spainCar: any
  steringAdjustment: number
  onDelete: () => void
}

export function ComparativeCardGrid({ id, importedCar, spainCar, steringAdjustment, onDelete }: ComparativeCardGridProps) {
  const importedTotal = (importedCar.price || 0) + (importedCar.totalExpenses || 0)
  const hasRightSteering = importedCar.steering === "Volante a la derecha"
  const spainAdjustedPrice = spainCar.price - (hasRightSteering ? steringAdjustment : 0)

  const difference = spainAdjustedPrice - importedTotal
  const profitPercentage = (difference / importedTotal) * 100

  let status = { color: "destructive", bg: "bg-destructive/10", border: "border-destructive", text: "text-destructive" }
  if (profitPercentage > 50 || difference > 10000) {
    status = { color: "purple-500", bg: "bg-purple-500/10", border: "border-purple-500", text: "text-purple-500" }
  } else if (profitPercentage > 20 || difference > 5000) {
    status = { color: "emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500", text: "text-emerald-500" }
  } else if (profitPercentage > 10 || difference > 2000) {
    status = { color: "accent", bg: "bg-accent/10", border: "border-accent", text: "text-accent" }
  } else if ((profitPercentage >= 5 && profitPercentage <= 10) && (difference >= 1000 && difference <= 2000)) {
    status = { color: "blue-500", bg: "bg-blue-500/10", border: "border-blue-500", text: "text-blue-500" }
  } else if ((profitPercentage >= 0 && profitPercentage < 5) && (difference >= 0 && difference < 1000)) {
    status = { color: "orange-500", bg: "bg-orange-500/10", border: "border-orange-500", text: "text-orange-500" }
  } else if (difference > 0) {
    status = { color: "accent", bg: "bg-accent/10", border: "border-accent", text: "text-accent" }
  }

  return (
    <div className={`rounded-xl border ${status.border} ${status.bg} p-4 relative transition-colors`}>
      <button onClick={onDelete} className="absolute top-2 right-2 p-1 hover:bg-black/10 rounded transition-colors">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="space-y-4 pt-2">
        <div className="flex justify-between items-center text-sm">
          <div className="flex-1 truncate pr-2">
            <span className="text-xs text-muted-foreground block">Importación</span>
            <span className="font-semibold">{importedCar.brand} {importedCar.model}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Coste Total</span>
            <span className="font-bold">{importedTotal.toLocaleString()}€</span>
          </div>
        </div>

        <div className="flex justify-between items-center text-sm border-t border-black/10 dark:border-white/10 pt-3">
          <div className="flex-1 truncate pr-2">
            <span className="text-xs text-muted-foreground block">Mercado Nacional</span>
            <span className="font-semibold">{spainCar.brand} {spainCar.model}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Ref. España</span>
            <span className="font-bold">{spainAdjustedPrice.toLocaleString()}€</span>
          </div>
        </div>

        <div className="pt-3 border-t border-black/10 dark:border-white/10 flex justify-between items-center bg-background/50 rounded-lg p-2">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground">ROI</span>
            <p className={`font-black ${status.text}`}>{profitPercentage > 0 ? "+" : ""}{profitPercentage.toFixed(1)}%</p>
          </div>
          <div className="text-right">
             <span className="text-[10px] uppercase font-bold text-muted-foreground">Ganancia</span>
             <p className={`font-black text-lg ${status.text}`}>{difference > 0 ? "+" : ""}{difference.toFixed(0)}€</p>
          </div>
        </div>
      </div>
    </div>
  )
}
