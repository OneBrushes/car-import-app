"use client"

import { ExternalLink, Trash2, Edit, Users } from "lucide-react"
import { ImageCarousel } from "@/components/ui/image-carousel"

interface SpainCarCardProps {
    car: any
    onDelete: () => void
    onEdit: () => void
    onShare?: () => void
    isShared?: boolean
    isOwner?: boolean
}

export function SpainCarCard({ car, onDelete, onEdit, onShare, isShared = false, isOwner = true }: SpainCarCardProps) {
    const images = car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : [])

    return (
        <div className={`bg-card border rounded-lg overflow-hidden hover:border-primary/30 transition-colors ${isShared ? 'border-blue-500/50 shadow-blue-500/10 shadow-lg' : 'border-border'
            }`}>
            {/* Carrusel de Imágenes */}
            <div className="w-full aspect-video bg-muted/20">
                <ImageCarousel images={images} alt={`${car.brand} ${car.model}`} />
            </div>

            {/* Contenido */}
            <div className="p-4 space-y-4">
                {/* Encabezado */}
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-bold">
                            {car.brand} {car.model}
                        </h3>
                        {isShared && (
                            <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-xs font-medium rounded-full flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                Compartido
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {car.year} • {car.location}
                    </p>
                </div>

                {/* Datos principales */}
                <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                        <p className="text-muted-foreground text-xs">Precio</p>
                        <p className="font-semibold text-accent">{car.price?.toLocaleString()}€</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Km</p>
                        <p className="font-semibold">{car.mileage?.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">CV</p>
                        <p className="font-semibold">{car.cv}</p>
                    </div>
                </div>

                {/* Detalles */}
                <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Combustible:</span>
                        <span className="font-medium">{car.fuel_type}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Transmisión:</span>
                        <span className="font-medium">{car.transmission}</span>
                    </div>
                    {car.seller && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Vendedor:</span>
                            <span className="font-medium">{car.seller}</span>
                        </div>
                    )}
                </div>

                {/* Botones de acción */}
                <div className="flex gap-2 pt-2">
                    {isOwner && (
                        <>
                            <button
                                onClick={onEdit}
                                className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Edit className="w-4 h-4" />
                                Editar
                            </button>
                            {onShare && (
                                <button
                                    onClick={onShare}
                                    className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                                    title="Compartir con otros usuarios"
                                >
                                    <Users className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                onClick={onDelete}
                                className="px-3 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    )}
                    {car.url && (
                        <a
                            href={car.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${isOwner ? 'px-3' : 'flex-1'} py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium flex items-center justify-center gap-2`}
                        >
                            <ExternalLink className="w-4 h-4" />
                            {!isOwner && 'Ver anuncio'}
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}
