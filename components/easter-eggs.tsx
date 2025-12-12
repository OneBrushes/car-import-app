"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Car } from 'lucide-react'

interface EasterEggsProps {
    onLogoClick: () => void
}

export function EasterEggs({ onLogoClick }: EasterEggsProps) {
    const [clickCount, setClickCount] = useState(0)
    const [showStats, setShowStats] = useState(false)
    const [showCar, setShowCar] = useState(false)
    const [lastClickTime, setLastClickTime] = useState(0)
    const [sessionStartTime] = useState(Date.now())
    const [sessionTime, setSessionTime] = useState(0)
    const [totalTimeSpent, setTotalTimeSpent] = useState(0)
    const [initialTotalTime, setInitialTotalTime] = useState(0)

    useEffect(() => {
        // Load total time from localStorage only once
        const savedTime = localStorage.getItem('totalTimeSpent')
        const initialTime = savedTime ? parseInt(savedTime) : 0
        setInitialTotalTime(initialTime)
        setTotalTimeSpent(initialTime)
    }, [])

    useEffect(() => {
        // Update session time every second
        const interval = setInterval(() => {
            const currentSessionTime = Math.floor((Date.now() - sessionStartTime) / 1000)
            setSessionTime(currentSessionTime)

            // Update total time display (initial + current session)
            setTotalTimeSpent(initialTotalTime + currentSessionTime)
        }, 1000)

        return () => clearInterval(interval)
    }, [sessionStartTime, initialTotalTime])

    useEffect(() => {
        // Save total time when component unmounts
        return () => {
            const finalTotalTime = initialTotalTime + Math.floor((Date.now() - sessionStartTime) / 1000)
            localStorage.setItem('totalTimeSpent', finalTotalTime.toString())
        }
    }, [initialTotalTime, sessionStartTime])

    useEffect(() => {
        // Reset click count after 2 seconds of inactivity
        const timer = setTimeout(() => {
            if (Date.now() - lastClickTime > 2000) {
                setClickCount(0)
            }
        }, 2000)

        return () => clearTimeout(timer)
    }, [lastClickTime])

    const handleClick = () => {
        const now = Date.now()
        const newCount = now - lastClickTime < 1000 ? clickCount + 1 : 1
        setClickCount(newCount)
        setLastClickTime(now)
        onLogoClick()

        // 3 clicks = stats (but don't reset counter)
        if (newCount === 3) {
            setShowStats(true)
            setTimeout(() => setShowStats(false), 5000)
            // Don't reset here, let it continue to 5
        }

        // 5 clicks = car animation
        if (newCount === 5) {
            setShowCar(true)
            setTimeout(() => setShowCar(false), 3000)
            setClickCount(0) // Reset after car animation
        }
    }

    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60

        if (hours > 0) return `${hours}h ${mins}m`
        if (mins > 0) return `${mins}m ${secs}s`
        return `${secs}s`
    }

    return (
        <>
            <div onClick={handleClick}>
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-white flex items-center justify-center p-1">
                    <img src="/NorDrive.png" alt="NorDrive Logo" className="w-full h-full object-contain" />
                </div>
            </div>

            {/* Stats Modal */}
            <AnimatePresence>
                {showStats && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-br from-purple-500 to-pink-500 text-white p-6 rounded-2xl shadow-2xl border-2 border-white/20"
                    >
                        <h3 className="text-xl font-bold mb-3">🎉 ¡Easter Egg Encontrado!</h3>
                        <div className="space-y-2 text-sm">
                            <p>🚗 <strong>Estadísticas secretas:</strong></p>
                            <p>• Tiempo total en la app: {formatTime(totalTimeSpent)}</p>
                            <p>• Sesión actual: {formatTime(sessionTime)}</p>
                            <p>• Nivel de curiosidad: ⭐⭐⭐⭐⭐</p>
                        </div>
                        <p className="mt-3 text-xs opacity-80">Haz 5 clicks para más sorpresas...</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Car Animation */}
            <AnimatePresence>
                {showCar && (
                    <>
                        {/* Prevent horizontal scroll */}
                        <style jsx global>{`
                            body {
                                overflow-x: hidden !important;
                            }
                        `}</style>

                        {/* Car emoji */}
                        <motion.div
                            initial={{ x: '-10%', y: '50vh' }}
                            animate={{
                                x: '110vw',
                                y: ['50vh', '30vh', '50vh', '20vh', '50vh']
                            }}
                            exit={{ opacity: 0 }}
                            transition={{
                                duration: 3,
                                ease: 'linear',
                                y: {
                                    duration: 3,
                                    repeat: 0,
                                    ease: 'easeInOut'
                                }
                            }}
                            className="fixed z-50 text-6xl pointer-events-none select-none"
                            style={{ willChange: 'transform' }}
                        >
                            🚗
                        </motion.div>

                        {/* Message */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ delay: 0.5 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-2xl shadow-2xl border-2 border-white/20"
                        >
                            <p className="text-2xl font-bold">🏎️ ¡VROOM VROOM!</p>
                            <p className="text-sm mt-2">¡Has desbloqueado el coche secreto!</p>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}
