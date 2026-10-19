'use client'

import Link from 'next/link'
import { Home, ArrowLeft, Car, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isHovering, setIsHovering] = useState(false)

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isHovering) {
                const x = (e.clientX / window.innerWidth - 0.5) * 20
                const y = (e.clientY / window.innerHeight - 0.5) * 20
                setPosition({ x, y })
            }
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [isHovering])

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            {/* Fondo decorativo sutil */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
            />

            <div
                className="relative z-10 mx-auto w-full max-w-md text-center animate-in fade-in duration-300"
                style={{
                    transform: `translate(${position.x * 0.4}px, ${position.y * 0.4}px)`,
                    transition: 'transform 0.3s ease-out'
                }}
            >
                <div className="mb-6 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Car className="h-6 w-6 text-primary" />
                    </div>
                </div>

                <p className="tabular mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Error 404
                </p>
                <h1 className="text-2xl font-semibold tracking-tight mb-2">
                    Esta ruta se ha perdido
                </h1>
                <p className="mx-auto mb-8 max-w-sm text-sm text-muted-foreground">
                    Parece que el coche que buscabas tomó un desvío equivocado.
                    No te preocupes, te ayudamos a volver al camino correcto.
                </p>

                <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                    <Button
                        asChild
                        className="w-full sm:w-auto"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                    >
                        <Link href="/">
                            <Home className="h-4 w-4" />
                            Volver al inicio
                        </Link>
                    </Button>

                    <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => window.history.back()}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Página anterior
                    </Button>
                </div>

                {/* Curiosidad */}
                <div className="mt-10 rounded-xl border bg-card p-5 text-left shadow-xs">
                    <div className="mb-2 flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">¿Sabías que...?</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Según la leyenda, el error 404 se originó en el CERN, donde la habitación 404 contenía el primer servidor web.
                        Cuando los archivos no se encontraban, ¡literalmente no estaban en la habitación 404!
                    </p>
                </div>
            </div>
        </div>
    )
}
