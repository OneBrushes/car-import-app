// Lectura de un anuncio de coche a partir de su HTML (JSON-LD de schema.org → OpenGraph → texto).
// Lo usan el Worker car-scrape (en el servidor) y la app (en el navegador, con lo que copia el botón
// "Copiar para NorDrive" en portales que bloquean las lecturas automáticas, como mobile.de).

export interface ScrapedCar {
    url: string
    platform?: string
    title?: string
    brand?: string
    model?: string
    year?: number
    month?: number
    price?: number
    currency?: string
    mileage?: number
    cv?: number
    fuelType?: string
    transmission?: string
    color?: string
    co2?: number
    location?: string
    images: string[]
}

// ---------------------------------------------------------------------------
// Parsing: JSON-LD (schema.org Car/Vehicle/Product) → OpenGraph → texto
// ---------------------------------------------------------------------------

export function parseListing(html: string, url: string): ScrapedCar {
    const car: ScrapedCar = { url, images: [] }

    for (const node of extractJsonLd(html)) {
        const types = ([] as string[]).concat(node['@type'] || []).map(String)
        if (!types.some(t => /^(Car|Vehicle|Product|Offer|MotorizedBicycle)$/i.test(t))) continue

        car.title ??= str(node.name)
        car.brand ??= str(node.brand?.name ?? node.brand ?? node.manufacturer?.name ?? node.manufacturer)
        car.model ??= str(node.model?.name ?? node.model)
        car.color ??= str(node.color)
        car.fuelType ??= str(node.fuelType ?? node.vehicleEngine?.fuelType)
        car.transmission ??= str(node.vehicleTransmission)
        car.mileage ??= num(node.mileageFromOdometer?.value ?? node.mileageFromOdometer)
        car.co2 ??= num(node.emissionsCO2)

        const date = str(node.dateVehicleFirstRegistered ?? node.productionDate ?? node.vehicleModelDate ?? node.modelDate)
        if (date && !car.year) {
            const match = date.match(/(\d{4})(?:-(\d{1,2}))?/)
            if (match) {
                car.year = Number(match[1])
                if (match[2]) car.month = Number(match[2])
            }
        }

        const power = node.vehicleEngine?.enginePower
        const powerValue = num(power?.value ?? power)
        if (powerValue && !car.cv) {
            const unit = String(power?.unitCode ?? power?.unitText ?? '').toUpperCase()
            car.cv = unit.includes('KW') || unit === 'KWT' ? Math.round(powerValue * 1.35962) : Math.round(powerValue)
        }

        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers
        car.price ??= num(offer?.price ?? offer?.priceSpecification?.price ?? node.price)
        car.currency ??= str(offer?.priceCurrency ?? node.priceCurrency)

        const images = ([] as any[]).concat(node.image || [])
            .map(img => (typeof img === 'string' ? img : img?.url || img?.contentUrl))
            .filter(Boolean)
        car.images.push(...images)
    }

    // OpenGraph / meta como respaldo
    car.title ??= meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    const ogImage = meta(html, 'og:image')
    if (ogImage) car.images.push(ogImage)
    car.price ??= num(meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount'))
    car.currency ??= meta(html, 'product:price:currency') ?? meta(html, 'og:price:currency')

    // Heurísticas sobre el título: "BMW 320d Touring 2019"
    if (car.title && (!car.brand || !car.model)) {
        const words = decodeEntities(car.title).split(/[\s|·,–-]+/).filter(Boolean)
        car.brand ??= words[0]
        car.model ??= words.slice(1, 3).join(' ') || undefined
    }
    if (!car.year && car.title) {
        const year = car.title.match(/\b(19[89]\d|20[0-4]\d)\b/)
        if (year) car.year = Number(year[1])
    }

    // Texto plano: datos con su etiqueta (de, es, fr, en, it, nl) y, si no, km y CV sueltos
    const text = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
    const after = (labels: string, value: string) => text.match(new RegExp(`(?:${labels})\\s*:?\\s*${value}`, 'i'))
    if (!car.year) {
        const reg = after('Erstzulassung|Primera matriculaci[oó]n|Matriculaci[oó]n|Fecha de matriculaci[oó]n|Mise en circulation|First registration|Immatricolazione|Bouwjaar|EZ', '(\\d{1,2})\\s*[/.-]\\s*((?:19|20)\\d{2})')
        if (reg) { car.month = Number(reg[1]); car.year = Number(reg[2]) }
    }
    if (!car.mileage) {
        const km = after('Kilometerstand|Kilometraje|Kilom[eé]trage|Mileage|Chilometraggio|Kilometers?', '(\\d{1,3}(?:[.\\s,]\\d{3})+|\\d{1,6})\\s*km')
        if (km) car.mileage = Number(km[1].replace(/[.\s,]/g, ''))
    }
    if (!car.cv) {
        const kwPs = text.match(/(\d{2,4})\s*kW\s*\(\s*(\d{2,4})\s*(?:PS|CV|ch|HP|pk)\s*\)/i)
        if (kwPs) car.cv = Number(kwPs[2])
    }
    if (!car.price) {
        const price = text.match(/(\d{1,3}(?:[.,\s]\d{3})+)\s*(?:€|EUR)/)
        if (price) { car.price = Number(price[1].replace(/[.,\s]/g, '')); car.currency ??= 'EUR' }
    }
    if (!car.fuelType) {
        const fuel = after('Kraftstoffart|Kraftstoff|Combustible|Carburant|Energie|Fuel type|Alimentazione|Brandstof', '([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ/ -]{2,24})')
        if (fuel) car.fuelType = fuel[1].trim().split(/\s{2,}|\n/)[0]
    }
    if (!car.transmission) {
        const gear = after('Getriebe|Cambio|Bo[iî]te de vitesses?|Transmission|Gearbox|Transmissie', '([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]{2,24})')
        if (gear) car.transmission = gear[1].trim().split(/\s{2,}|\n/)[0]
    }
    if (!car.mileage) {
        const km = text.match(/(\d{1,3}(?:[.\s,]\d{3})+|\d{4,6})\s*km\b/i)
        if (km) car.mileage = Number(km[1].replace(/[.\s,]/g, ''))
    }
    if (!car.cv) {
        const cv = text.match(/(\d{2,4})\s*(?:CV|PS|HP|ch)\b/)
        if (cv) car.cv = Number(cv[1])
    }

    car.images = Array.from(new Set(car.images.map(i => absolute(i, url)).filter(Boolean) as string[])).slice(0, 20)
    if (car.title) car.title = decodeEntities(car.title)
    return car
}

function extractJsonLd(html: string): any[] {
    const nodes: any[] = []
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
        try {
            const parsed = JSON.parse(m[1].trim())
            const walk = (value: any) => {
                if (Array.isArray(value)) value.forEach(walk)
                else if (value && typeof value === 'object') {
                    nodes.push(value)
                    if (value['@graph']) walk(value['@graph'])
                    if (value.itemOffered) walk(value.itemOffered)
                }
            }
            walk(parsed)
        } catch {
            // JSON-LD mal formado: se ignora
        }
    }
    return nodes
}

function meta(html: string, property: string): string | undefined {
    const escaped = property.replace(/[.:]/g, m => '\\' + m)
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'))
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'))
    const value = a?.[1] ?? b?.[1]
    return value ? decodeEntities(value) : undefined
}

function str(value: unknown): string | undefined {
    if (value == null) return undefined
    if (typeof value === 'object') return undefined
    const s = String(value).trim()
    return s ? s : undefined
}

function num(value: unknown): number | undefined {
    if (value == null) return undefined
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    const cleaned = String(value).replace(/[^\d.,]/g, '')
    if (!cleaned) return undefined
    // "18.500" / "18,500" / "18500.00"
    const normalized = /[.,]\d{1,2}$/.test(cleaned)
        ? cleaned.replace(/[.,](?=\d{3})/g, '').replace(',', '.')
        : cleaned.replace(/[.,]/g, '')
    const n = Number(normalized)
    return Number.isFinite(n) ? n : undefined
}

function absolute(src: string, base: string): string | null {
    try {
        return new URL(src, base).toString()
    } catch {
        return null
    }
}

function decodeEntities(s: string) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .trim()
}
