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

    const scrollPrev = useCallback(() => {
        if (emblaApi) emblaApi.scrollPrev()
    }, [emblaApi])

    const scrollNext = useCallback(() => {
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

    if (!images || images.length === 0) {
        return (
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Sin imagen</p>
            </div>
        )
    }

    if (images.length === 1) {
        return (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                <Zoom>
                    <img
                        src={images[0]}
                        alt={alt}
                        className="w-full h-full object-cover cursor-zoom-in"
                    />
                </Zoom>
            </div>
        )
    }

    return (
        <div className="relative">
            <div className="overflow-hidden rounded-lg" ref={emblaRef}>
                <div className="flex">
                    {images.map((image, index) => (
                        <div key={index} className="flex-[0_0_100%] min-w-0">
                            <div className="aspect-video bg-muted">
                                <Zoom>
                                    <img
                                        src={image}
                                        alt={`${alt} ${index + 1}`}
                                        className="w-full h-full object-cover cursor-zoom-in"
                                    />
                                </Zoom>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation Buttons */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background/90 backdrop-blur-sm"
                onClick={scrollPrev}
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background/90 backdrop-blur-sm"
                onClick={scrollNext}
            >
                <ChevronRight className="w-4 h-4" />
            </Button>

            {/* Dots Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_, index) => (
                    <button
                        key={index}
                        className={`w-2 h-2 rounded-full transition-all ${index === selectedIndex
                                ? 'bg-primary w-4'
                                : 'bg-background/60 hover:bg-background/80'
                            }`}
                        onClick={() => emblaApi?.scrollTo(index)}
                    />
                ))}
            </div>

            {/* Image Counter */}
            <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                {selectedIndex + 1} / {images.length}
            </div>
        </div>
    )
}
