// API de tasas de cambio (gratis, sin API key necesaria)
const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest/EUR'

interface ExchangeRates {
    EUR: number
    USD: number
    GBP: number
    CHF: number
    [key: string]: number
}

let cachedRates: ExchangeRates | null = null
let lastFetch: number = 0
const CACHE_DURATION = 3600000 // 1 hora en milisegundos

/**
 * Obtiene las tasas de cambio actuales
 * @returns Promise<ExchangeRates>
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
    const now = Date.now()

    // Usar caché si es reciente (menos de 1 hora)
    if (cachedRates && (now - lastFetch) < CACHE_DURATION) {
        return cachedRates
    }

    try {
        const response = await fetch(EXCHANGE_API_URL)
        if (!response.ok) {
            throw new Error('Error fetching exchange rates')
        }

        const data = await response.json()
        cachedRates = data.rates
        lastFetch = now

        return data.rates
    } catch (error) {
        console.error('Error fetching exchange rates:', error)

        // Fallback a tasas aproximadas si falla la API
        return {
            EUR: 1,
            USD: 1.08,
            GBP: 0.85,
            CHF: 0.95,
        }
    }
}

/**
 * Convierte una cantidad de una moneda a otra
 * @param amount - Cantidad a convertir
 * @param from - Moneda origen (EUR, USD, GBP, CHF)
 * @param to - Moneda destino (EUR, USD, GBP, CHF)
 * @returns Promise<number> - Cantidad convertida
 */
export async function convertCurrency(
    amount: number,
    from: string,
    to: string
): Promise<number> {
    if (from === to) return amount

    const rates = await getExchangeRates()

    // Convertir a EUR primero (base)
    const amountInEUR = from === 'EUR' ? amount : amount / rates[from]

    // Luego convertir de EUR a la moneda destino
    const convertedAmount = to === 'EUR' ? amountInEUR : amountInEUR * rates[to]

    return Math.round(convertedAmount * 100) / 100 // Redondear a 2 decimales
}

/**
 * Obtiene el símbolo de una moneda
 */
export function getCurrencySymbol(currency: string): string {
    const symbols: { [key: string]: string } = {
        EUR: '€',
        USD: '$',
        GBP: '£',
        CHF: 'CHF',
    }
    return symbols[currency] || currency
}

/**
 * Formatea una cantidad con su símbolo de moneda
 */
export function formatCurrency(amount: number, currency: string): string {
    const symbol = getCurrencySymbol(currency)
    const formatted = amount.toLocaleString('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })

    // EUR va después, otros antes
    return currency === 'EUR' ? `${formatted}${symbol}` : `${symbol}${formatted}`
}
