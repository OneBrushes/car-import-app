import { supabase } from './supabase'

// Timeout wrapper para queries de Supabase
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = 10000 // 10 segundos por defecto
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
    ])
}

// Helper para queries con timeout automático
export async function supabaseQuery<T>(
    queryFn: () => Promise<{ data: T | null; error: any }>,
    timeoutMs: number = 10000
) {
    try {
        const result = await withTimeout(queryFn(), timeoutMs)
        return result
    } catch (error: any) {
        if (error.message === 'Request timeout') {
            console.error('Supabase query timeout')
            return { data: null, error: { message: 'La petición tardó demasiado. Intenta de nuevo.' } }
        }
        return { data: null, error }
    }
}

export { supabase }
