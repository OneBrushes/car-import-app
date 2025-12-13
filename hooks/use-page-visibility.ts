"use client"

import { useEffect, useCallback } from 'react'

/**
 * Hook para manejar visibilidad de página y prevenir pérdida de datos
 */
export function usePageVisibility(onVisibilityChange?: (isVisible: boolean) => void) {
    const handleVisibilityChange = useCallback(() => {
        const isVisible = document.visibilityState === 'visible'

        if (onVisibilityChange) {
            onVisibilityChange(isVisible)
        }

        // Log para debugging
        console.log(`Page ${isVisible ? 'visible' : 'hidden'}`)
    }, [onVisibilityChange])

    useEffect(() => {
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [handleVisibilityChange])
}

/**
 * Hook para guardar datos antes de que el usuario se vaya
 */
export function useBeforeUnload(shouldWarn: boolean, onBeforeUnload?: () => void) {
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (shouldWarn) {
                // Ejecutar callback si existe
                if (onBeforeUnload) {
                    onBeforeUnload()
                }

                // Mostrar advertencia del navegador
                e.preventDefault()
                e.returnValue = ''
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [shouldWarn, onBeforeUnload])
}

/**
 * Hook combinado para auto-guardar cuando cambias de pestaña
 */
export function useAutoSaveOnBlur(
    hasUnsavedChanges: boolean,
    onSave: () => void
) {
    // Guardar cuando la página se oculta
    usePageVisibility((isVisible) => {
        if (!isVisible && hasUnsavedChanges) {
            console.log('Saving before page hidden...')
            onSave()
        }
    })

    // Guardar antes de cerrar/recargar
    useBeforeUnload(hasUnsavedChanges, onSave)
}
