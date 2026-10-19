"use client"

import { Trash2, ExternalLink, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ComparativeCardProps {
  id: string
  importedCar: any
  spainCar: any
  steringAdjustment: number
  onDelete: () => void
}

const eur = (value: number) => `${Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`

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
    label: "Mala opción",
    badge: "bg-destructive/10 text-destructive",
    border: "border-destructive/30",
    text: "text-destructive",
  }

  if (profitPercentage > 50 || difference > 10000) {
    status = {
      label: "Unicornio",
      badge: "bg-success text-success-foreground",
      border: "border-success/40",
      text: "text-success",
    }
  } else if (profitPercentage > 20 || difference > 5000) {
    status = {
      label: "Ocasión muy buena",
      badge: "bg-success/15 text-success",
      border: "border-success/30",
      text: "text-success",
    }
  } else if (profitPercentage > 10 || difference > 2000) {
    status = {
      label: "Buena opción",
      badge: "bg-success/10 text-success",
      border: "border-success/30",
      text: "text-success",
    }
  } else if (
    (profitPercentage >= 5 && profitPercentage <= 10) &&
    (difference >= 1000 && difference <= 2000)
  ) {
    status = {
      label: "Válida pero mejorable",
      badge: "bg-warning/10 text-warning",
      border: "border-warning/30",
      text: "text-warning",
    }
  } else if (
    (profitPercentage >= 0 && profitPercentage < 5) &&
    (difference >= 0 && difference < 1000)
  ) {
    status = {
      label: "Muy justo",
      badge: "bg-warning/10 text-warning",
      border: "border-warning/30",
      text: "text-warning",
    }
  } else if (difference > 0) {
    status = {
      label: "Buena opción",
      badge: "bg-success/10 text-success",
      border: "border-success/30",
      text: "text-success",
    }
  }

  return (
    <div className={`rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${status.border}`}>
      <div className="p-5 space-y-4">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`border-transparent ${status.badge}`}>{status.label}</Badge>
              {hasRightSteering && (
                <Badge variant="secondary" className="border-transparent">Volante a la derecha</Badge>
              )}
            </div>
            <p className="mt-2 truncate font-semibold leading-snug">
              {importedCar.brand} {importedCar.model}
              <span className="text-muted-foreground font-normal"> vs </span>
              {spainCar.brand} {spainCar.model}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            title="Eliminar comparativa"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Comparación de precios */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
          {/* Coche importado */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Importado</p>
              <p className="truncate font-medium">{importedCar.brand} {importedCar.model}</p>
              <p className="tabular text-xs text-muted-foreground">
                {[importedCar.year, importedCar.mileage ? `${Number(importedCar.mileage).toLocaleString('es-ES')} km` : null, importedCar.cv ? `${importedCar.cv} CV` : null]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos"}
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio base</span>
                <span className="tabular">{eur(importedCar.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gastos totales</span>
                <span className="tabular">{eur(importedCar.totalExpenses || 0)}</span>
              </div>
            </div>
            <div className="flex items-end justify-between border-t pt-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coste total</span>
              <span className="tabular text-lg font-semibold tracking-tight">{eur(importedTotal)}</span>
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
          </div>

          <div className="hidden sm:flex items-center justify-center text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Coche España */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">España</p>
              <p className="truncate font-medium">{spainCar.brand} {spainCar.model}</p>
              <p className="tabular text-xs text-muted-foreground">
                {[spainCar.year, spainCar.mileage ? `${Number(spainCar.mileage).toLocaleString('es-ES')} km` : null, spainCar.cv ? `${spainCar.cv} CV` : null]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos"}
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio base</span>
                <span className="tabular">{eur(spainCar.price)}</span>
              </div>
              {hasRightSteering && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ajuste volante derecha</span>
                  <span className="tabular text-destructive">-{eur(steringAdjustment)}</span>
                </div>
              )}
            </div>
            <div className="flex items-end justify-between border-t pt-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Precio referencia</span>
              <span className="tabular text-lg font-semibold tracking-tight">{eur(spainAdjustedPrice)}</span>
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
          </div>
        </div>

        {/* Resultado */}
        <div className="grid grid-cols-2 gap-3 border-t pt-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {difference > 0 ? "Ganancia" : "Pérdida"}
            </p>
            <p className={`tabular text-2xl font-semibold tracking-tight ${status.text}`}>
              {difference > 0 ? "+" : ""}
              {eur(difference)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rentabilidad</p>
            <p className={`tabular text-2xl font-semibold tracking-tight ${status.text}`}>
              {profitPercentage > 0 ? "+" : ""}
              {profitPercentage.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
