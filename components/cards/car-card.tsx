"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Trash2, Share2, Users, Mail, MailOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ImageCarousel } from "@/components/ui/image-carousel"
import { supabase } from "@/lib/supabase"

interface CarCardProps {
  car: any
  onDelete: () => void
  onEdit: (car: any) => void
  onShare?: (car: any) => void
  currentUserId?: string
  isGodMode?: boolean
  onToggleContacted?: (carId: string, currentStatus: boolean) => void
}

export function CarCard({ car, onDelete, onEdit, onShare, currentUserId, isGodMode = false, onToggleContacted }: CarCardProps) {
  const [ownerName, setOwnerName] = useState<string>("")
  const finalPrice = (car.price || 0) + (car.totalExpenses || 0)
  const images = car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : [])

  const isOwner = currentUserId === car.user_id || isGodMode
  const isSharedWithMe = !isOwner && currentUserId && car.shared_with?.includes(currentUserId)
  const isSharedByMe = (currentUserId === car.user_id) && car.shared_with && car.shared_with.length > 0

  // Fetch owner name if car is shared with me
  useEffect(() => {
    const fetchOwnerName = async () => {
      if (isSharedWithMe && car.user_id) {
        const { data } = await supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', car.user_id)
          .single()

        if (data) {
          const name = data.first_name && data.last_name
            ? `${data.first_name} ${data.last_name.charAt(0)}.`
            : data.email
          setOwnerName(name)
        }
      }
    }

    fetchOwnerName()
  }, [isSharedWithMe, car.user_id])

  return (
    <div
      onClick={() => onEdit(car)} // Permitir ver tanto propios como compartidos
      className={`bg-card border rounded-xl overflow-hidden shadow-xs transition-all group relative cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
        car.contacted
          ? 'border-success/40'
          : isSharedWithMe
            ? 'border-primary/40'
            : 'border-border hover:border-foreground/15'
      }`}
    >
      {/* Badges de Estado */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1">
        {car.contacted && (
          <Badge className="border-transparent bg-success text-success-foreground shadow-sm">
            <MailOpen className="w-3 h-3" /> Contactado
          </Badge>
        )}
        {isSharedWithMe && (
          <Badge className="border-transparent bg-primary text-primary-foreground shadow-sm">
            <Users className="w-3 h-3" /> Compartido contigo
          </Badge>
        )}
        {isSharedByMe && (
          <Badge variant="secondary" className="bg-background/90 backdrop-blur shadow-sm">
            <Share2 className="w-3 h-3" /> Compartido
          </Badge>
        )}
      </div>

      {/* Carrusel de Imágenes */}
      <div className="w-full aspect-[16/10] bg-muted">
        <ImageCarousel images={images} alt={`${car.brand} ${car.model}`} />
      </div>

      {/* Contenido */}
      <div className="p-4 space-y-3">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold leading-snug">
              {car.brand} {car.model}
            </h3>
            <p className="tabular mt-0.5 text-xs text-muted-foreground">
              {[car.year, car.mileage ? `${Number(car.mileage).toLocaleString('es-ES')} km` : null, car.cv ? `${car.cv} CV` : null]
                .filter(Boolean)
                .join(" · ") || "Sin datos"}
            </p>
          </div>
        </div>

        {/* Precio final destacado */}
        <div className="flex items-end justify-between border-t pt-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Precio final</p>
            <p className="tabular text-xl font-semibold tracking-tight">{finalPrice.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</p>
          </div>
          {car.totalExpenses > 0 && (
            <p className="tabular text-xs text-muted-foreground">+{Number(car.totalExpenses).toLocaleString('es-ES')} € gastos</p>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {car.url && (
            <a
              href={car.url.startsWith('http') ? car.url : `https://${car.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent"
              title="Ver anuncio original"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Ver anuncio</span>
            </a>
          )}

          {isOwner && (
            <>
              {onToggleContacted && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 transition-colors ${
                    car.contacted
                      ? "text-success hover:text-success hover:bg-success/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  onClick={() => onToggleContacted(car.id, !!car.contacted)}
                  title={car.contacted ? "Desmarcar como contactado" : "Marcar como contactado (mail/mensaje enviado)"}
                >
                  {car.contacted ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={() => onShare && onShare(car)}
                title={isSharedByMe ? "Gestionar compartidos" : "Compartir"}
              >
                <Share2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
            Solo lectura • Compartido por {ownerName || "..."}
          </p>
        )}
      </div>
    </div>
  )
}
