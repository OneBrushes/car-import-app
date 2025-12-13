"use client"

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, RefreshCw } from 'lucide-react'

export function ConnectionStatus() {
    const [isOnline, setIsOnline] = useState(true)
    const [showReconnecting, setShowReconnecting] = useState(false)

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true)
            setShowReconnecting(false)
        }

        const handleOffline = () => {
            setIsOnline(false)
            setShowReconnecting(true)
        }

        // Detectar cambios de conexión
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Detectar cuando la página vuelve a estar visible
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // Verificar conexión cuando vuelves a la pestaña
                if (!navigator.onLine) {
                    setShowReconnecting(true)
                }
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [])

    return (
        <AnimatePresence>
            {showReconnecting && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-orange-500 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3"
                >
                    {isOnline ? (
                        <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span className="font-medium">Reconectando...</span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="w-5 h-5" />
                            <span className="font-medium">Sin conexión a internet</span>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
