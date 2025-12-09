'use client'

import Link from 'next/link'
import { Home, ArrowLeft, Car, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 overflow-hidden relative">
            {/* Animated background elements */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>

            {/* Floating cars */}
            <div className="absolute inset-0 pointer-events-none">
                <Car
                    className="absolute top-20 left-10 text-blue-400/20 animate-bounce"
                    size={60}
                    style={{ animationDelay: '0s', animationDuration: '3s' }}
                />
                <Car
                    className="absolute bottom-20 right-20 text-purple-400/20 animate-bounce"
                    size={80}
                    style={{ animationDelay: '1s', animationDuration: '4s' }}
                />
                <Car
                    className="absolute top-1/2 right-10 text-blue-300/20 animate-bounce"
                    size={50}
                    style={{ animationDelay: '2s', animationDuration: '3.5s' }}
                />
            </div>

            {/* Main content */}
            <div
                className="relative z-10 text-center max-w-2xl mx-auto"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    transition: 'transform 0.3s ease-out'
                }}
            >
                {/* 404 Number */}
                <div className="mb-8">
                    <h1 className="text-[180px] md:text-[240px] font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 leading-none animate-gradient">
                        404
                    </h1>
                </div>

                {/* Message */}
                <div className="space-y-4 mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                        ¡Oops! Esta ruta se ha perdido
                    </h2>
                    <p className="text-lg text-slate-300 max-w-md mx-auto">
                        Parece que el coche que buscabas tomó un desvío equivocado.
                        No te preocupes, te ayudamos a volver al camino correcto.
                    </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <Link
                        href="/"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                        className="group relative px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105 flex items-center gap-3"
                    >
                        <Home className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                        Volver al Inicio
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity"></div>
                    </Link>

                    <button
                        onClick={() => window.history.back()}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                        className="group px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl border-2 border-white/20 hover:bg-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105 flex items-center gap-3"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        Página Anterior
                    </button>
                </div>

                {/* Fun fact */}
                <div className="mt-16 p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <Search className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-semibold text-white">¿Sabías que...?</h3>
                    </div>
                    <p className="text-sm text-slate-300">
                        El error 404 se originó en el CERN, donde la habitación 404 contenía el primer servidor web.
                        Cuando los archivos no se encontraban, ¡literalmente no estaban en la habitación 404!
                    </p>
                </div>
            </div>

            {/* Animated gradient background */}
            <style jsx>{`
                @keyframes gradient {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                .animate-gradient {
                    background-size: 200% 200%;
                    animation: gradient 3s ease infinite;
                }
            `}</style>
        </div>
    )
}
