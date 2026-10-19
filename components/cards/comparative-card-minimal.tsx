"use client"

import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ComparativeCardMinimalProps {
  id: string
  importedCar: any
  spainCar: any
  steringAdjustment: number
  onDelete: () => void
}

const eur = (value: number) => `${Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`

export function ComparativeCardMinimal({ id, importedCar, spainCar, steringAdjustment, onDelete }: ComparativeCardMinimalProps) {
  const importedTotal = (importedCar.price || 0) + (importedCar.totalExpenses || 0)
  const hasRightSteering = importedCar.steering === "Volante a la derecha"
  const spainAdjustedPrice = spainCar.price - (hasRightSteering ? steringAdjustment : 0)

  const difference = spainAdjustedPrice - importedTotal

  let color = "text-destructive"
  if (difference > 5000) color = "text-success"
  else if (difference > 2000) color = "text-success"
  else if (difference > 0) color = "text-warning"

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:border-foreground/15">
      <div className="grid w-full flex-1 grid-cols-2 gap-4 sm:max-w-xl">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Importado</p>
          <p className="truncate text-sm font-medium">{importedCar.brand} {importedCar.model}</p>
          <p className="tabular text-xs text-muted-foreground">{eur(importedTotal)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">España</p>
          <p className="truncate text-sm font-medium">{spainCar.brand} {spainCar.model}</p>
          <p className="tabular text-xs text-muted-foreground">{eur(spainAdjustedPrice)}</p>
        </div>
      </div>

      <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-4">
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Margen bruto</p>
          <p className={`tabular text-lg font-semibold tracking-tight ${color}`}>
            {difference > 0 ? "+" : ""}{eur(difference)}
          </p>
        </div>
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
    </div>
  )
}
