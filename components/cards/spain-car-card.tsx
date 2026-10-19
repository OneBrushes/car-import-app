"use client"

import { ExternalLink, Trash2, Pencil, Users, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ImageCarousel } from "@/components/ui/image-carousel"

interface SpainCarCardProps {
    car: any
    onDelete: () => void
    onEdit: () => void
    onShare?: () => void
    isShared?: boolean
    isOwner?: boolean
    isGodMode?: boolean
}

export function SpainCarCard({ car, onDelete, onEdit, onShare, isShared = false, isOwner = true, isGodMode = false }: SpainCarCardProps) {
    const images = car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : [])
    const _isOwner = isOwner || isGodMode;
    const fuelType = car.fuel_type ?? car.fuelType

    const meta = [
        car.year,
        car.mileage ? `${Number(car.mileage).toLocaleString('es-ES')} km` : null,
        car.cv ? `${car.cv} CV` : null,
    ].filter(Boolean).join(" · ")

    const details = [fuelType, car.transmission].filter(Boolean).join(" · ")

    return (
        <div
            className={`bg-card border rounded-xl overflow-hidden shadow-xs transition-all group relative hover:shadow-md hover:-translate-y-0.5 ${
                isShared ? 'border-primary/40' : 'border-border hover:border-foreground/15'
            }`}
        >
            {/* Badges de Estado */}
            {isShared && (
                <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="bg-background/90 backdrop-blur shadow-sm">
                        <Users className="w-3 h-3" /> Compartido
                    </Badge>
                </div>
            )}

            {/* Carrusel de Imágenes */}
            <div className="w-full aspect-[16/10] bg-muted">
                <ImageCarousel images={images} alt={`${car.brand} ${car.model}`} />
            </div>

            {/* Contenido */}
            <div className="p-4 space-y-3">
                {/* Encabezado */}
                <div className="min-w-0">
                    <h3 className="truncate font-semibold leading-snug">
                        {car.brand} {car.model}
                    </h3>
                    <p className="tabular mt-0.5 text-xs text-muted-foreground">
                        {meta || "Sin datos"}
                    </p>
                    {(details || car.location || car.seller) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {details && <span>{details}</span>}
                            {car.location && (
                                <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {car.location}
                                </span>
                            )}
                            {car.seller && <span>Vendedor: {car.seller}</span>}
                        </div>
                    )}
                </div>

                {/* Precio */}
                <div className="flex items-end justify-between border-t pt-3">
                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Precio España</p>
                        <p className="tabular text-xl font-semibold tracking-tight">
                            {Number(car.price || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €
                        </p>
                    </div>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-1.5">
                    {car.url && (
                        <a
                            href={car.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent"
                            title="Ver anuncio original"
                        >
                            <ExternalLink className="w-4 h-4" />
                            <span>Ver anuncio</span>
                        </a>
                    )}
                    {_isOwner && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent ${!car.url ? 'flex-1' : ''}`}
                                onClick={onEdit}
                                title="Editar"
                            >
                                <Pencil className="w-4 h-4" />
                            </Button>
                            {onShare && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    onClick={onShare}
                                    title="Compartir con otros usuarios"
                                >
                                    <Users className="w-4 h-4" />
                                </Button>
                            )}
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
            </div>
        </div>
    )
}
