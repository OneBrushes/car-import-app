"use client"

import { ExternalLink, Trash2, Share2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ImageCarousel } from "@/components/ui/image-carousel"

interface CarCardProps {
  car: any
  onDelete: () => void
  onEdit: (car: any) => void
  onShare?: (car: any) => void
  currentUserId?: string
}

export function CarCard({ car, onDelete, onEdit, onShare, currentUserId }: CarCardProps) {
  const finalPrice = (car.price || 0) + (car.totalExpenses || 0)
  const images = car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : [])

  const isOwner = currentUserId === car.user_id
  const isSharedWithMe = !isOwner && currentUserId && car.shared_with?.includes(currentUserId)
  const isSharedByMe = isOwner && car.shared_with && car.shared_with.length > 0

  return (
    <div
      onClick={() => isOwner ? onEdit(car) : null}
      className={`bg-card border rounded-lg overflow-hidden transition-all group relative ${isOwner ? 'cursor-pointer hover:border-primary/30' : 'cursor-default border-blue-500/30 bg-blue-500/5'
        } ${isSharedByMe ? 'border-blue-500/50' : 'border-border'}`}
    >
      {/* Badges de Estado */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {isSharedWithMe && (
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/20">
            <Users className="w-3 h-3 mr-1" /> Compartido contigo
          </Badge>
        )}
        {isSharedByMe && (
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/20">
            <Share2 className="w-3 h-3 mr-1" /> Compartido
          </Badge>
        )}
      </div>

      {/* Carrusel de Imágenes */}
      <div className="w-full aspect-video bg-muted/20">
        <ImageCarousel images={images} alt={`${car.brand} ${car.model}`} />
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
        <div className={`rounded-lg p-3 ${isSharedWithMe ? 'bg-blue-500/10' : 'bg-primary/10'}`}>
          <p className="text-xs text-muted-foreground">Precio Final</p>
          <p className={`text-2xl font-bold ${isSharedWithMe ? 'text-blue-400' : 'text-primary'}`}>{finalPrice.toFixed(0)}€</p>
          {car.totalExpenses > 0 && (
            <p className="text-xs text-muted-foreground mt-1">(Gastos: {car.totalExpenses}€)</p>
          )}
        </div>

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

          {isOwner && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                onClick={() => onShare && onShare(car)}
                title={isSharedByMe ? "Gestionar compartidos" : "Compartir"}
              >
                <Share2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                onClick={onDelete}
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {/* Info Compartido */}
        {isSharedWithMe && (
          <p className="text-xs text-center text-muted-foreground">
            Solo lectura (Compartido por propietario)
          </p>
        )}
      </div>
    </div>
  )
}
