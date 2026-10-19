"use client"

import { Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ComparativeCardGridProps {
  id: string
  importedCar: any
  spainCar: any
  steringAdjustment: number
  onDelete: () => void
}

const eur = (value: number) => `${Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`

export function ComparativeCardGrid({ id, importedCar, spainCar, steringAdjustment, onDelete }: ComparativeCardGridProps) {
  const importedTotal = (importedCar.price || 0) + (importedCar.totalExpenses || 0)
  const hasRightSteering = importedCar.steering === "Volante a la derecha"
  const spainAdjustedPrice = spainCar.price - (hasRightSteering ? steringAdjustment : 0)

  const difference = spainAdjustedPrice - importedTotal
  const profitPercentage = (difference / importedTotal) * 100

  let status = { label: "Mala opción", badge: "bg-destructive/10 text-destructive", border: "border-destructive/30", text: "text-destructive" }
  if (profitPercentage > 50 || difference > 10000) {
    status = { label: "Unicornio", badge: "bg-success text-success-foreground", border: "border-success/40", text: "text-success" }
  } else if (profitPercentage > 20 || difference > 5000) {
    status = { label: "Ocasión muy buena", badge: "bg-success/15 text-success", border: "border-success/30", text: "text-success" }
  } else if (profitPercentage > 10 || difference > 2000) {
    status = { label: "Buena opción", badge: "bg-success/10 text-success", border: "border-success/30", text: "text-success" }
  } else if ((profitPercentage >= 5 && profitPercentage <= 10) && (difference >= 1000 && difference <= 2000)) {
    status = { label: "Mejorable", badge: "bg-warning/10 text-warning", border: "border-warning/30", text: "text-warning" }
  } else if ((profitPercentage >= 0 && profitPercentage < 5) && (difference >= 0 && difference < 1000)) {
    status = { label: "Muy justo", badge: "bg-warning/10 text-warning", border: "border-warning/30", text: "text-warning" }
  } else if (difference > 0) {
    status = { label: "Buena opción", badge: "bg-success/10 text-success", border: "border-success/30", text: "text-success" }
  }

  return (
    <div className={`rounded-xl border bg-card p-4 shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5 ${status.border}`}>
      <div className="flex items-center justify-between gap-2">
        <Badge className={`border-transparent ${status.badge}`}>{status.label}</Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          title="Eliminar comparativa"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Importado vs España */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Importado</p>
          <p className="truncate text-sm font-medium">{importedCar.brand} {importedCar.model}</p>
          <p className="tabular mt-1 font-semibold">{eur(importedTotal)}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">España</p>
          <p className="truncate text-sm font-medium">{spainCar.brand} {spainCar.model}</p>
          <p className="tabular mt-1 font-semibold">{eur(spainAdjustedPrice)}</p>
        </div>
      </div>

      {/* Resultado */}
      <div className="mt-3 flex items-end justify-between border-t pt-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {difference > 0 ? "Ganancia" : "Pérdida"}
          </p>
          <p className={`tabular text-xl font-semibold tracking-tight ${status.text}`}>
            {difference > 0 ? "+" : ""}{eur(difference)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">ROI</p>
          <p className={`tabular font-semibold ${status.text}`}>
            {profitPercentage > 0 ? "+" : ""}{profitPercentage.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  )
}
