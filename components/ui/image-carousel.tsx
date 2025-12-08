"use client"

import { useState, useCallback, useEffect } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Zoom from 'react-medium-image-zoom'
import 'react-medium-image-zoom/dist/styles.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageCarouselProps {
    images: string[]
    alt?: string
}

export function ImageCarousel({ images, alt = "Car image" }: ImageCarouselProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })
    const [selectedIndex, setSelectedIndex] = useState(0)

    const scrollPrev = useCallback((e: React.MouseEvent) => {
        e.stopPropagation() // Evitar abrir el editor
        if (emblaApi) emblaApi.scrollPrev()
    }, [emblaApi])

    const scrollNext = useCallback((e: React.MouseEvent) => {
        e.stopPropagation() // Evitar abrir el editor
        if (emblaApi) emblaApi.scrollNext()
    }, [emblaApi])

    const onSelect = useCallback(() => {
        if (!emblaApi) return
        setSelectedIndex(emblaApi.selectedScrollSnap())
    }, [emblaApi])

    useEffect(() => {
        if (!emblaApi) return
        onSelect()
        emblaApi.on('select', onSelect)
        return () => {
            emblaApi.off('select', onSelect)
        }
    }, [emblaApi, onSelect])

    // Manejar click en la imagen para evitar propagación al card
    const handleImageClick = (e: React.MouseEvent) => {
        e.stopPropagation()
    }

    if (!images || images.length === 0) {
        return (
            <div className="w-full h-full bg-muted flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Sin imagen</p>
            </div>
        )
    }

    if (images.length === 1) {
        return (
            <div className="relative w-full h-full overflow-hidden bg-muted" onClick={handleImageClick}>
                <Zoom>
                    <img
                        src={images[0]}
                        alt={alt}
                        className="w-full h-full object-cover"
                    />
                </Zoom>
            </div>
        )
    }

    return (
        <div className="relative w-full h-full group z-0" onClick={handleImageClick}>
            <div className="overflow-hidden w-full h-full rounded-lg" ref={emblaRef}>
                <div className="flex w-full h-full">
                    {images.map((image, index) => (
                        <div key={index} className="flex-[0_0_100%] min-w-0 w-full h-full relative">
                            <div className="w-full h-full">
                                <Zoom>
                                    <img
                                        src={image}
                                        alt={`${alt} ${index + 1}`}
                                        className="w-full h-full object-cover block rounded-lg"
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </Zoom>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation Buttons - Solo visibles en hover */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8"
                onClick={scrollPrev}
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8"
                onClick={scrollNext}
            >
                <ChevronRight className="w-4 h-4" />
            </Button>

            {/* Dots Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {images.map((_, index) => (
                    <button
                        key={index}
                        className={`w-1.5 h-1.5 rounded-full transition-all shadow-sm ${index === selectedIndex
                            ? 'bg-white w-3'
                            : 'bg-white/50 hover:bg-white/80'
                            }`}
                        onClick={(e) => {
                            e.stopPropagation()
                            emblaApi?.scrollTo(index)
                        }}
                    />
                ))}
            </div>

            {/* Image Counter */}
            <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-0.5 rounded text-[10px] font-medium z-10 pointer-events-none">
                {selectedIndex + 1}/{images.length}
            </div>
        </div>
    )
}
