"use client"

import { Trash2 } from "lucide-react"

interface ComparativeCardMinimalProps {
  id: string
  importedCar: any
  spainCar: any
  steringAdjustment: number
  onDelete: () => void
}

export function ComparativeCardMinimal({ id, importedCar, spainCar, steringAdjustment, onDelete }: ComparativeCardMinimalProps) {
  const importedTotal = (importedCar.price || 0) + (importedCar.totalExpenses || 0)
  const hasRightSteering = importedCar.steering === "Volante a la derecha"
  const spainAdjustedPrice = spainCar.price - (hasRightSteering ? steringAdjustment : 0)

  const difference = spainAdjustedPrice - importedTotal
  
  let color = "text-destructive"
  if (difference > 5000) color = "text-emerald-500"
  else if (difference > 2000) color = "text-accent"
  else if (difference > 0) color = "text-blue-500"

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors gap-4">
      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 w-full">
         <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Importación</span>
            <p className="text-sm font-semibold truncate max-w-[200px]">{importedCar.brand} {importedCar.model}</p>
         </div>
         <span className="hidden sm:inline text-muted-foreground">vs</span>
         <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">España</span>
            <p className="text-sm font-semibold truncate max-w-[200px]">{spainCar.brand} {spainCar.model}</p>
         </div>
      </div>
      
      <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
         <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Margen Bruto</span>
            <p className={`font-black text-lg ${color}`}>
              {difference > 0 ? "+" : ""}{difference.toLocaleString()}€
            </p>
         </div>
         <button onClick={onDelete} className="p-2 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded transition-colors">
            <Trash2 className="w-4 h-4" />
         </button>
      </div>
    </div>
  )
}
