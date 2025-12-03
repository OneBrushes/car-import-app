"use client"

import { X, ExternalLink } from "lucide-react"

interface ComparativeCardProps {
  id: string
  importedCar: any
  spainCar: any
  steringAdjustment: number
  onDelete: () => void
}

export function ComparativeCard({ id, importedCar, spainCar, steringAdjustment, onDelete }: ComparativeCardProps) {
  // Calcular costes
  const importedTotal = (importedCar.price || 0) + (importedCar.totalExpenses || 0)

  // Ajuste por volante derecha
  const hasRightSteering = importedCar.steering === "Volante a la derecha"
  const spainAdjustedPrice = spainCar.price - (hasRightSteering ? steringAdjustment : 0)

  // Diferencia y rentabilidad
  const difference = spainAdjustedPrice - importedTotal
  const profitPercentage = (difference / importedTotal) * 100

  // Lógica de valoración
  let status = {
    label: "MALA OPCIÓN",
    color: "destructive",
    icon: "✗",
    bg: "bg-destructive/10",
    border: "border-destructive",
    text: "text-destructive",
  }

  if (importedCar.price > 10000) {
    if (profitPercentage > 50 || difference > 10000) {
      status = {
        label: "UNICORNIO",
        color: "purple-500",
        icon: "🦄",
        bg: "bg-purple-500/10",
        border: "border-purple-500",
        text: "text-purple-500",
      }
    } else if (profitPercentage > 20 || difference > 5000) {
      status = {
        label: "OCASIÓN MUY BUENA",
        color: "emerald-500",
        icon: "✓✓",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500",
        text: "text-emerald-500",
      }
    } else if (profitPercentage > 10 || difference > 2000) {
      status = {
        label: "BUENA OPCIÓN",
        color: "accent",
        icon: "✓",
        bg: "bg-accent/10",
        border: "border-accent",
        text: "text-accent",
      }
    } else if (
      (profitPercentage >= 5 && profitPercentage <= 10) &&
      (difference >= 1000 && difference <= 2000)
    ) {
      status = {
        label: "OPCIÓN VÁLIDA PERO MEJORABLE",
        color: "blue-500",
        icon: "!",
        bg: "bg-blue-500/10",
        border: "border-blue-500",
        text: "text-blue-500",
      }
    } else if (
      (profitPercentage >= 0 && profitPercentage < 5) &&
      (difference >= 0 && difference < 1000)
    ) {
      status = {
        label: "MUY JUSTO",
        color: "orange-500",
        icon: "⚠",
        bg: "bg-orange-500/10",
        border: "border-orange-500",
        text: "text-orange-500",
      }
    }
  } else {
    // Lógica simple para coches baratos
    if (difference > 0) {
      status = {
        label: "BUENA OPCIÓN",
        color: "accent",
        icon: "✓",
        bg: "bg-accent/10",
        border: "border-accent",
        text: "text-accent",
      }
    }
  }

  return (
    <div
      className={`rounded-lg overflow-hidden border-2 transition-all ${status.border} ${status.bg.replace("/10", "/5")
        } to-transparent bg-gradient-to-r`}
    >
      <div className="p-6 space-y-6">
        {/* Header con botón eliminar */}
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Comparativa #{id}</h3>
          <button onClick={onDelete} className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grid de comparación */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Coche Importado - Lado Izquierdo */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm text-muted-foreground">Coche Importado</h4>
                <h3 className="text-lg font-bold">
                  {importedCar.brand} {importedCar.model}
                </h3>
                <p className="text-xs text-muted-foreground">{importedCar.year}</p>
              </div>
              <span className="text-2xl">🚗</span>
            </div>

            {importedCar.url && (
              <a
                href={importedCar.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Ver anuncio original
              </a>
            )}

            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Precio base:</span>
                <span className="font-semibold">{importedCar.price}€</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gastos totales:</span>
                <span className="font-semibold">{importedCar.totalExpenses || 0}€</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                <span className="font-bold">COSTE TOTAL:</span>
                <span className="text-lg font-bold text-primary">{importedTotal}€</span>
              </div>
            </div>
          </div>

          {/* Coche España - Lado Derecho */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm text-muted-foreground">Coche España</h4>
                <h3 className="text-lg font-bold">
                  {spainCar.brand} {spainCar.model}
                </h3>
                <p className="text-xs text-muted-foreground">{spainCar.year}</p>
              </div>
              <span className="text-2xl">🚗</span>
            </div>

            {spainCar.url && (
              <a
                href={spainCar.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Ver anuncio original
              </a>
            )}

            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Precio base:</span>
                <span className="font-semibold">{spainCar.price}€</span>
              </div>
              {hasRightSteering && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ajuste volante derecha:</span>
                  <span className="font-semibold text-destructive">-{steringAdjustment}€</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                <span className="font-bold">PRECIO REFERENCIA:</span>
                <span className="text-lg font-bold text-accent">{spainAdjustedPrice}€</span>
              </div>
            </div>
          </div>
        </div>

        {/* Resultado central - Rentabilidad */}
        <div
          className={`rounded-lg p-6 text-center border-2 ${status.bg} ${status.border}`}
        >
          <div className="mb-3">
            <p className={`text-2xl font-bold ${status.text}`}>
              {status.icon} {status.label}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Rentabilidad</p>
              <p className={`text-2xl font-bold ${status.text}`}>
                {profitPercentage > 0 ? "+" : ""}
                {profitPercentage.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{difference > 0 ? "Ganancias" : "Pérdida"}</p>
              <p className={`text-2xl font-bold ${status.text}`}>
                {difference > 0 ? "+" : ""}
                {difference.toFixed(0)}€
              </p>
            </div>
          </div>
        </div>

        {/* Datos adicionales */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">km (imp)</p>
            <p className="font-semibold">{(importedCar.mileage || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">km (esp)</p>
            <p className="font-semibold">{(spainCar.mileage || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CV (imp)</p>
            <p className="font-semibold">{importedCar.cv || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CV (esp)</p>
            <p className="font-semibold">{spainCar.cv || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
