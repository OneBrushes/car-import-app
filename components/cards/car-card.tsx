"use client"

import { ExternalLink, Trash2 } from "lucide-react"

interface CarCardProps {
  car: any
  onDelete: () => void
  onEdit: (car: any) => void
}

export function CarCard({ car, onDelete, onEdit }: CarCardProps) {
  const finalPrice = (car.price || 0) + (car.totalExpenses || 0)
  const photoUrl = car.images?.[0]

  return (
    <div
      onClick={() => onEdit(car)}
      className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-colors group cursor-pointer"
    >
      {/* Imagen */}
      <div className="w-full h-40 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-4xl overflow-hidden">
        {photoUrl ? (
          <img
            src={photoUrl || "/placeholder.svg"}
            alt={`${car.brand} ${car.model}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>🚗</span>
        )}
      </div>

      {/* Contenido */}
      <div className="p-4 space-y-4">
        {/* Encabezado */}
        <div>
          <h3 className="text-lg font-bold">
            {car.brand} {car.model}
          </h3>
          <p className="text-sm text-muted-foreground">{car.year}</p>
        </div>

        {/* Datos principales */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Km</p>
            <p className="font-semibold">{car.mileage?.toLocaleString() || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">CV</p>
            <p className="font-semibold">{car.cv || "—"}</p>
          </div>
        </div>

        {/* Precio final destacado */}
        <div className="bg-primary/10 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Precio Final</p>
          <p className="text-2xl font-bold text-primary">{finalPrice.toFixed(0)}€</p>
          {car.totalExpenses > 0 && (
            <p className="text-xs text-muted-foreground mt-1">(Gastos: {car.totalExpenses}€)</p>
          )}
        </div>

        {/* Etiquetas */}
        {car.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {car.tags.map((tag: string) => (
              <span key={tag} className="px-2 py-1 bg-accent/20 text-accent text-xs rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
          {car.url && (
            <a
              href={car.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm font-medium"
              title="Ver anuncio original"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Ver</span>
            </a>
          )}
          <button
            onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>
      </div>
    </div>
  )
}
