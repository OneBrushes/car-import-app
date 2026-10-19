"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useReactToPrint } from 'react-to-print'
import {
    FileText, Printer, Check, X, Plus, Image as ImageIcon, MoveUp, MoveDown, Trash2, Eye, EyeOff,
    Type, Settings, Car as CarIcon, Info, Star,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { calculateImportCost, DEFAULT_IMPORT_COSTS } from "@/lib/import-costs"

// Radix Select no admite "" como valor de un item: centinela que se traduce a "" en el estado
const NONE_VALUE = "__none__"

const CHECKLIST_SECTIONS = {
    exterior: {
        title: "Exterior",
        items: [
            "Estado de la pintura (arañazos, golpes)",
            "Lunas y espejos",
            "Llantas y neumáticos (profundidad, marca)",
            "Luces y faros (funcionamiento, roturas)",
            "Ajuste de puertas y capó"
        ]
    },
    interior: {
        title: "Interior",
        items: [
            "Tapicería y asientos",
            "Volante y palanca de cambios",
            "Botones y mandos",
            "Aire acondicionado / Climatizador",
            "Cuadro de instrumentos (testigos)"
        ]
    },
    motor: {
        title: "Motor y Mecánica",
        items: [
            "Nivel de aceite",
            "Nivel de refrigerante",
            "Fugas visibles",
            "Ruidos extraños al arrancar",
            "Estado de correas (visual)"
        ]
    },
    prueba: {
        title: "Prueba Dinámica",
        items: [
            "Arranque en frío",
            "Frenada",
            "Dirección (holguras, ruidos)",
            "Cambio de marchas (suavidad)",
            "Suspensión (ruidos)"
        ]
    },
    documentacion: {
        title: "Documentación",
        items: [
            "Permiso de circulación",
            "Ficha técnica",
            "Libro de mantenimiento",
            "Número de llaves",
            "COC (Certificado de Conformidad)"
        ]
    },
    herramientas: {
        title: "Herramientas / Diagnóstico",
        items: [
            "Espesómetro (Pintura original)",
            "Lectura OBD (Códigos de error)"
        ]
    }
}

interface ReportCar {
    id: string
    brand: string
    model: string
    year: number | null
    month: number | null
    price: number
    totalCost: number
    expenses: { label: string; amount: number }[]
    mileage: number | null
    cv: number | null
    fuelType: string
    transmission: string
    color: string
    location: string
    origin: string
    motorType: string
    displacement: string
    doors: string
    traction: string
    co2: number | null
    images: string[]
    equipment: string[]
    notes: string
}

interface SpainCar {
    id: string
    brand: string
    model: string
    year: number | null
    price: number
    mileage: number | null
    cv: number | null
    equipmentLevel?: string
}

/** Ajustes de cada coche dentro del informe */
interface CarConfig {
    carId: string
    spainCarId: string
    equipmentLevel: string
    discount: number
}

type BlockId = 'summary' | 'pricing' | 'comparison' | 'specs' | 'features' | 'gallery' | 'inspection' | 'notes'

interface Block {
    id: BlockId
    title: string
    isVisible: boolean
}

interface CustomBlock {
    id: string
    type: 'text' | 'image'
    title: string
    content: string
    image?: string
    isVisible: boolean
}

const DEFAULT_BLOCKS: Block[] = [
    { id: 'summary', title: 'Presentación del vehículo', isVisible: true },
    { id: 'specs', title: 'Ficha técnica', isVisible: true },
    { id: 'pricing', title: 'Precio final en España', isVisible: true },
    { id: 'comparison', title: 'Comparativa con España', isVisible: true },
    { id: 'features', title: 'Equipamiento', isVisible: true },
    { id: 'gallery', title: 'Galería', isVisible: true },
    { id: 'inspection', title: 'Inspección técnica', isVisible: true },
    { id: 'notes', title: 'Observaciones', isVisible: true },
]

const BLOCK_HINTS: Record<BlockId, string> = {
    summary: 'Foto principal y cifras clave.',
    pricing: 'Siempre aparece. Si el coche no tiene gastos apuntados, se estima con la calculadora.',
    comparison: 'Solo si eliges un coche de España para ese vehículo.',
    specs: 'Datos técnicos del coche.',
    features: 'Solo si el coche tiene equipamiento apuntado.',
    gallery: 'Solo si el coche tiene más de una foto.',
    inspection: 'Solo si el coche tiene checklist de inspección.',
    notes: 'Solo si el coche tiene notas.',
}

// Colores del documento impreso (no dependen del tema claro/oscuro de la app)
const INK = "#18181b"
const MUTED = "#6b6b73"
const LINE = "#e5e5e1"
const SOFT = "#f7f7f5"
const ACCENT = "#2b4acb"
const SUCCESS = "#15803d"

/** Coches que caben en la portada; si hay más, se añade la página de resumen */
const COVER_MAX = 3

const eur = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`
const num = (v: any) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v))

interface PriceBreakdown {
    lines: { label: string; amount: number; hint?: string }[]
    subtotal: number
    discount: number
    final: number
    estimated: boolean
}

/** Precio final "llave en mano" en España: gastos apuntados o, si no hay, estimación de la calculadora */
function priceFor(car: ReportCar, discount: number): PriceBreakdown {
    const recorded = car.expenses.filter(e => e.amount)
    const recordedSum = recorded.reduce((sum, e) => sum + e.amount, 0)
    const lumpExpenses = car.totalCost > car.price ? car.totalCost - car.price : 0

    let lines: PriceBreakdown['lines']
    let estimated = false

    if (recorded.length > 0) {
        lines = [{ label: 'Precio del vehículo', amount: car.price }, ...recorded.map(e => ({ label: e.label, amount: e.amount }))]
        // Si el coste total guardado incluye más que los gastos detallados, se añade la diferencia
        const gap = car.totalCost - (car.price + recordedSum)
        if (gap > 1) lines.push({ label: 'Otros gastos de importación', amount: gap })
    } else if (lumpExpenses > 0) {
        lines = [
            { label: 'Precio del vehículo', amount: car.price },
            { label: 'Gastos de importación y matriculación', amount: lumpExpenses },
        ]
    } else {
        estimated = true
        const estimate = calculateImportCost({
            purchasePrice: car.price,
            firstRegistration: new Date(car.year || new Date().getFullYear(), (car.month || 1) - 1, 1),
            co2: car.co2,
            payVat: false,
            ...DEFAULT_IMPORT_COSTS,
            other: 0,
        })
        lines = estimate.lines.map(line => line.label === 'Precio de compra' ? { ...line, label: 'Precio del vehículo' } : line)
    }

    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0)
    return { lines, subtotal, discount, final: subtotal - discount, estimated }
}

/** Etiquetas "Recomendado" / "Mejor precio" del documento */
function CarTags({ recommended, cheapest, size = 9 }: { recommended?: boolean; cheapest?: boolean; size?: number }) {
    if (!recommended && !cheapest) return null
    const base = { fontSize: size, fontWeight: 700, letterSpacing: '.1em', borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1.4 } as const
    return (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {recommended && <span style={{ ...base, background: INK, color: '#fff' }}>★ RECOMENDADO</span>}
            {cheapest && <span style={{ ...base, border: `1px solid ${ACCENT}`, color: ACCENT }}>MEJOR PRECIO</span>}
        </span>
    )
}

export function ReportGenerator() {
    const [cars, setCars] = useState<ReportCar[]>([])
    const [spainCars, setSpainCars] = useState<SpainCar[]>([])
    const [configs, setConfigs] = useState<CarConfig[]>([])
    const [showPreview, setShowPreview] = useState(false)

    const [clientName, setClientName] = useState("")
    const [reportTitle, setReportTitle] = useState("Presupuesto de importación")
    const [validityDays, setValidityDays] = useState(15)
    const [recommendedId, setRecommendedId] = useState("")
    const [recommendReason, setRecommendReason] = useState("")
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
    const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS)
    const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([])
    const [checklists, setChecklists] = useState<Record<string, any>>({})
    const [imageBlobs, setImageBlobs] = useState<Record<string, string[]>>({})

    const [showFooterContact, setShowFooterContact] = useState(false)
    const [footerEmail, setFooterEmail] = useState("info@nordrive.es")
    const [footerPhone, setFooterPhone] = useState("+34 XXX XXX XXX")
    const [footerWeb, setFooterWeb] = useState("www.nordrive.es")

    const reportRef = useRef<HTMLDivElement>(null)

    // Cargar coches
    useEffect(() => {
        const fetchReportData = async () => {
            try {
                const { data: importedData, error: importedError } = await supabase
                    .from('imported_cars')
                    .select('*')
                    .order('created_at', { ascending: false })
                if (importedError) throw importedError

                setCars((importedData || []).map((car: any): ReportCar => {
                    const expenses = Array.isArray(car.expenses)
                        ? car.expenses.map((e: any) => ({ label: e.type || e.description || e.concept || 'Gasto', amount: Number(e.amount) || 0 }))
                        : []
                    return {
                        id: car.id,
                        brand: car.brand || '',
                        model: car.model || '',
                        year: num(car.year),
                        month: num(car.month),
                        price: Number(car.price) || 0,
                        totalCost: Number(car.total_cost) || 0,
                        expenses,
                        mileage: num(car.mileage),
                        cv: num(car.cv),
                        fuelType: car.fuel_type || '',
                        transmission: car.transmission || '',
                        color: car.color || '',
                        location: car.location || '',
                        origin: car.origin || '',
                        motorType: car.motor_type || '',
                        displacement: car.displacement ? String(car.displacement) : '',
                        doors: car.doors ? String(car.doors) : '',
                        traction: car.traction || '',
                        co2: num(car.co2),
                        images: car.images?.length ? car.images : (car.image_url ? [car.image_url] : []),
                        equipment: Array.isArray(car.equipment) ? car.equipment : [],
                        notes: car.notes || '',
                    }
                }))

                const { data: spainData, error: spainError } = await supabase
                    .from('spain_cars')
                    .select('*')
                    .order('created_at', { ascending: false })
                if (spainError) throw spainError

                setSpainCars((spainData || []).map((car: any) => ({
                    id: car.id,
                    brand: car.brand,
                    model: car.model,
                    year: num(car.year),
                    price: Number(car.price) || 0,
                    mileage: num(car.mileage),
                    cv: num(car.cv),
                    equipmentLevel: car.equipment_level || undefined,
                })))
            } catch (error) {
                console.error("Error loading report data:", error)
                toast.error("Error al cargar datos para informes")
            }
        }
        fetchReportData()
    }, [])

    const selectedIds = configs.map(c => c.carId)
    const selectedKey = selectedIds.join(',')

    // Checklists e imágenes (como blob para que se impriman sin problemas de CORS)
    useEffect(() => {
        if (selectedIds.length === 0) return
        supabase
            .from('car_checklists')
            .select('car_id, data')
            .in('car_id', selectedIds)
            .then(({ data }) => {
                const map: Record<string, any> = {}
                for (const row of data || []) map[row.car_id] = row.data
                setChecklists(map)
            })

        const missing = selectedIds.filter(id => !imageBlobs[id])
        missing.forEach(async (id) => {
            const car = cars.find(c => c.id === id)
            if (!car || car.images.length === 0) return
            const blobs = await Promise.all(car.images.slice(0, 7).map(async (url) => {
                try {
                    const response = await fetch(url)
                    return URL.createObjectURL(await response.blob())
                } catch {
                    return url
                }
            }))
            setImageBlobs(prev => ({ ...prev, [id]: blobs }))
        })
    }, [selectedKey, cars])

    const reportCars = useMemo(() => configs
        .map(config => {
            const car = cars.find(c => c.id === config.carId)
            if (!car) return null
            const spain = spainCars.find(s => s.id === config.spainCarId) || null
            const price = priceFor(car, config.discount || 0)
            const images = imageBlobs[car.id]?.length ? imageBlobs[car.id] : car.images
            return { car, config, spain, price, images, checklist: checklists[car.id] || null }
        })
        .filter(Boolean) as {
            car: ReportCar; config: CarConfig; spain: SpainCar | null; price: PriceBreakdown; images: string[]; checklist: any
        }[], [configs, cars, spainCars, imageBlobs, checklists])

    const cheapestId = reportCars.length > 1
        ? reportCars.reduce((best, item) => (item.price.final < best.price.final ? item : best)).car.id
        : null

    const recommended = reportCars.length > 1 ? reportCars.find(r => r.car.id === recommendedId) || null : null
    const highlightId = recommended?.car.id ?? cheapestId

    // --- Acciones ---

    const handlePrint = useReactToPrint({
        contentRef: reportRef,
        documentTitle: `Informe_${(clientName || reportCars.map(r => `${r.car.brand}_${r.car.model}`).join('_')).replace(/\s+/g, '_')}_${reportDate}`,
    })

    const addCar = (carId: string) => {
        if (!carId || selectedIds.includes(carId)) return
        setConfigs(prev => [...prev, { carId, spainCarId: '', equipmentLevel: '', discount: 0 }])
    }
    const updateConfig = (carId: string, patch: Partial<CarConfig>) =>
        setConfigs(prev => prev.map(c => (c.carId === carId ? { ...c, ...patch } : c)))
    const removeCar = (carId: string) => {
        setConfigs(prev => prev.filter(c => c.carId !== carId))
        if (carId === recommendedId) setRecommendedId("")
    }
    const moveCar = (index: number, direction: -1 | 1) => setConfigs(prev => {
        const next = [...prev]
        const target = index + direction
        if (target < 0 || target >= next.length) return prev
        ;[next[index], next[target]] = [next[target], next[index]]
        return next
    })

    const moveBlock = (index: number, direction: -1 | 1) => setBlocks(prev => {
        const next = [...prev]
        const target = index + direction
        if (target < 0 || target >= next.length) return prev
        ;[next[index], next[target]] = [next[target], next[index]]
        return next
    })
    const toggleBlock = (index: number) => setBlocks(prev => prev.map((b, i) => (i === index ? { ...b, isVisible: !b.isVisible } : b)))
    const renameBlock = (index: number, title: string) => setBlocks(prev => prev.map((b, i) => (i === index ? { ...b, title } : b)))

    const addCustomBlock = (type: CustomBlock['type']) => setCustomBlocks(prev => [...prev, {
        id: Date.now().toString(),
        type,
        title: type === 'text' ? 'Información adicional' : 'Imagen destacada',
        content: '',
        isVisible: true,
    }])
    const updateCustomBlock = (id: string, patch: Partial<CustomBlock>) =>
        setCustomBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)))
    const moveCustomBlock = (index: number, direction: -1 | 1) => setCustomBlocks(prev => {
        const next = [...prev]
        const target = index + direction
        if (target < 0 || target >= next.length) return prev
        ;[next[index], next[target]] = [next[target], next[index]]
        return next
    })
    const handleImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (event) => updateCustomBlock(id, { image: event.target?.result as string })
        reader.readAsDataURL(file)
    }

    // Una hoja por coche: si el contenido de un capítulo pasa de un A4, se escala para que quepa
    useEffect(() => {
        if (!showPreview) return
        const A4_PX = (297 * 96) / 25.4
        const fit = () => {
            document.querySelectorAll<HTMLElement>('.rp-fit').forEach(sheet => {
                const inner = sheet.querySelector<HTMLElement>('.rp-fit-inner')
                if (!inner) return
                inner.style.transform = ''
                inner.style.width = ''
                inner.style.marginBottom = ''
                const padding = sheet.getBoundingClientRect().height - inner.getBoundingClientRect().height
                const available = A4_PX - padding - 4
                const height = inner.getBoundingClientRect().height
                if (height > available) {
                    const scale = Math.max(0.6, available / height)
                    // Se maqueta más ancho y se reduce en bloque: así el texto vuelve a repartirse
                    // y el resultado ocupa exactamente el ancho de la hoja, sin salirse por la derecha
                    inner.style.width = `${100 / scale}%`
                    inner.style.transformOrigin = 'top left'
                    inner.style.transform = `scale(${scale})`
                    const scaledHeight = inner.getBoundingClientRect().height
                    // transform no cambia el espacio que ocupa en la página: se recupera con margen negativo
                    inner.style.marginBottom = `${-(inner.offsetHeight - scaledHeight)}px`
                }
            })
        }
        const timers = [50, 400, 1200, 2500].map(ms => setTimeout(fit, ms))
        const images = Array.from(document.querySelectorAll<HTMLImageElement>('.rp-fit img'))
        images.forEach(img => img.addEventListener('load', fit))
        return () => {
            timers.forEach(clearTimeout)
            images.forEach(img => img.removeEventListener('load', fit))
        }
    }, [showPreview, reportCars, blocks, customBlocks, recommendReason, showFooterContact])

    const isBlockVisible = (id: BlockId) => blocks.find(b => b.id === id)?.isVisible
    const blockTitle = (id: BlockId) => blocks.find(b => b.id === id)?.title || ''

    // --- Vista previa / documento ---

    if (showPreview && reportCars.length > 0) {
        const formattedDate = new Date(reportDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        const hero = reportCars[0].images[0]

        /** Portada: el recomendado primero y después los más baratos */
        const coverCars = [...reportCars]
            .sort((a, b) => {
                if (a.car.id === recommended?.car.id) return -1
                if (b.car.id === recommended?.car.id) return 1
                return a.price.final - b.price.final
            })
            .slice(0, COVER_MAX)

        /** Cabecera discreta de las hojas interiores */
        const runningHeader = (label: string) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 18, borderBottom: `1px solid ${LINE}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/NorDrive.png`} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>NorDrive</span>
                    {clientName && <span style={{ fontSize: 12, color: MUTED }}>· {clientName}</span>}
                </div>
                <span className="rp-label" style={{ color: ACCENT }}>{label}</span>
            </div>
        )

        return (
            <div className="fixed inset-0 z-50 overflow-auto bg-muted animate-in fade-in duration-200">
                <div className="sticky top-0 z-50 flex h-14 items-center justify-between gap-3 border-b bg-card/90 px-4 backdrop-blur-md print:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                            <X className="h-4 w-4" /> Volver al editor
                        </Button>
                        <div className="hidden h-4 w-px bg-border sm:block" />
                        <span className="hidden truncate text-sm font-medium sm:inline">
                            Vista previa · {reportCars.length} {reportCars.length === 1 ? 'vehículo' : 'vehículos'}
                        </span>
                    </div>
                    <Button size="sm" onClick={handlePrint}>
                        <Printer className="h-4 w-4" /> Descargar PDF
                    </Button>
                </div>

                <div className="py-8">
                    <div ref={reportRef} data-report-content style={{ color: INK, fontFamily: 'var(--font-geist-sans), -apple-system, "Segoe UI", Roboto, sans-serif' }}>
                        <style>{`
                            @page { size: A4 portrait; margin: 0; }
                            .rp-sheet { box-sizing: border-box; width: 210mm; background: #fff; margin: 0 auto 24px; padding: 16mm 15mm; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06); }
                            .rp-cover { height: 297mm; padding: 0; overflow: hidden; display: flex; flex-direction: column; }
                            .rp-num { font-variant-numeric: tabular-nums; }
                            .rp-avoid { break-inside: avoid; page-break-inside: avoid; }
                            .rp-keep, .rp-keep tr { break-inside: avoid !important; page-break-inside: avoid !important; }
                            .rp-h2 { break-after: avoid; page-break-after: avoid; }
                            .rp-label { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; color: ${MUTED}; }
                            .rp-h2 { font-size: 18px; font-weight: 750; letter-spacing: -.01em; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; }
                            .rp-h2::before { content: ""; width: 4px; height: 18px; border-radius: 4px; background: ${ACCENT}; }
                            .rp-block { margin-top: 30px; }
                            .rp-cblock { margin-top: 14px; }
                            .rp-fit { overflow: hidden; }
                            .rp-fit-inner { max-width: none; }
                            .rp-h3 { font-size: 13px; font-weight: 750; letter-spacing: -.005em; margin: 0 0 7px; display: flex; align-items: center; gap: 8px; break-after: avoid; }
                            .rp-h3::before { content: ""; width: 3px; height: 12px; border-radius: 3px; background: ${ACCENT}; }
                            @media print {
                                body { print-color-adjust: exact; -webkit-print-color-adjust: exact; margin: 0; }
                                .rp-sheet { margin: 0; box-shadow: none; padding: 14mm 14mm; }
                                .rp-cover { padding: 0; }
                                .rp-sheet + .rp-sheet { break-before: page; page-break-before: always; }
                            }
                        `}</style>

                        {/* PORTADA */}
                        {reportCars.length === 1 ? (
                        <section className="rp-sheet rp-cover">
                            <div style={{ position: 'relative', height: reportCars.length === 1 ? '62%' : '38%', background: SOFT }}>
                                {hero && <img src={hero} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 60%, rgba(0,0,0,.55) 100%)' }} />
                                <div style={{ position: 'absolute', top: '12mm', left: '15mm', right: '15mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', padding: 3 }}>
                                            <img src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/NorDrive.png`} alt="NorDrive" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>NorDrive</span>
                                    </div>
                                    <span style={{ color: 'rgba(255,255,255,.9)', fontSize: 12 }}>{formattedDate}</span>
                                </div>
                                {reportCars.length === 1 && (
                                    <div style={{ position: 'absolute', left: '15mm', right: '15mm', bottom: '12mm', color: '#fff' }}>
                                        <p style={{ fontSize: 13, opacity: .85, margin: 0 }}>{[reportCars[0].car.year, reportCars[0].car.mileage ? `${reportCars[0].car.mileage.toLocaleString('es-ES')} km` : null, reportCars[0].car.cv ? `${reportCars[0].car.cv} CV` : null].filter(Boolean).join(' · ')}</p>
                                        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.02em', margin: '4px 0 0', lineHeight: 1.05 }}>{reportCars[0].car.brand} {reportCars[0].car.model}</h1>
                                    </div>
                                )}
                            </div>

                            <div style={{ flex: 1, padding: '14mm 15mm 12mm', display: 'flex', flexDirection: 'column' }}>
                                <p className="rp-label">{clientName ? 'Preparado para' : 'Informe'}</p>
                                <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: '6px 0 4px' }}>{clientName || reportTitle}</h2>
                                {clientName && <p style={{ fontSize: 15, color: MUTED, margin: 0 }}>{reportTitle}</p>}

                                {reportCars.length === 1 ? (
                                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
                                        <div>
                                            <p className="rp-label">Precio final en España</p>
                                            <p className="rp-num" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', margin: '4px 0 0' }}>{eur(reportCars[0].price.final)}</p>
                                            <p style={{ fontSize: 12, color: MUTED, margin: '2px 0 0' }}>Llave en mano{reportCars[0].price.estimated ? ' · estimado' : ''}</p>
                                        </div>
                                        {reportCars[0].spain && reportCars[0].spain.price > reportCars[0].price.final && (
                                            <div style={{ textAlign: 'right' }}>
                                                <p className="rp-label">Ahorro frente a España</p>
                                                <p className="rp-num" style={{ fontSize: 26, fontWeight: 800, color: SUCCESS, margin: '4px 0 0' }}>{eur(reportCars[0].spain.price - reportCars[0].price.final)}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                                        {reportCars.slice(0, 6).map(({ car, price, images }) => (
                                            <div key={car.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${LINE}`, borderRadius: 10, padding: 8 }}>
                                                <div style={{ width: 64, height: 44, borderRadius: 6, overflow: 'hidden', background: SOFT, flexShrink: 0 }}>
                                                    {images[0] && <img src={images[0]} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ fontWeight: 600, fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{car.brand} {car.model}</p>
                                                    <p className="rp-num" style={{ fontSize: 12, color: MUTED, margin: 0 }}>{car.year} · {eur(price.final)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                        ) : (
                        /* PORTADA CON VARIOS COCHES: mosaico de fotos + lista de la propuesta */
                        <section className="rp-sheet rp-cover">
                            <div style={{ position: 'relative', height: '50%', background: INK, display: 'grid', gap: 3, gridTemplateColumns: reportCars.length === 2 ? '1fr 1fr' : '1.6fr 1fr', gridTemplateRows: reportCars.length === 2 ? '1fr' : '1fr 1fr' }}>
                                {reportCars.slice(0, 3).map(({ car, images }, i) => (
                                    <div key={car.id} style={{ position: 'relative', overflow: 'hidden', background: '#27272a', gridRow: reportCars.length > 2 && i === 0 ? '1 / span 2' : undefined }}>
                                        {images[0] && <img src={images[0]} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                                    </div>
                                ))}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.7) 100%)' }} />
                                <div style={{ position: 'absolute', top: '12mm', left: '15mm', right: '15mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', padding: 3 }}>
                                            <img src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/NorDrive.png`} alt="NorDrive" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>NorDrive</span>
                                    </div>
                                    <span style={{ color: 'rgba(255,255,255,.9)', fontSize: 12 }}>{formattedDate}</span>
                                </div>
                                <div style={{ position: 'absolute', left: '15mm', right: '15mm', bottom: '11mm', color: '#fff' }}>
                                    <p style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, opacity: .8, margin: 0 }}>{reportTitle}</p>
                                    <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.02em', margin: '4px 0 0', lineHeight: 1.05 }}>
                                        {reportCars.length} vehículos seleccionados
                                    </h1>
                                </div>
                            </div>

                            <div style={{ flex: 1, padding: '12mm 15mm 12mm', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                                    <div>
                                        <p className="rp-label" style={{ margin: 0 }}>{clientName ? 'Preparado para' : 'Presupuesto'}</p>
                                        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: '4px 0 0' }}>{clientName || 'Selección de vehículos'}</h2>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p className="rp-label" style={{ margin: 0 }}>Desde</p>
                                        <p className="rp-num" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: '4px 0 0', color: ACCENT }}>
                                            {eur(Math.min(...reportCars.map(r => r.price.final)))}
                                        </p>
                                    </div>
                                </div>

                                {recommended && (
                                    <div style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center', background: SOFT, borderRadius: 12, padding: 10, border: `1px solid ${LINE}` }}>
                                        <div style={{ width: 120, height: 78, borderRadius: 8, overflow: 'hidden', background: '#e4e4e7', flexShrink: 0 }}>
                                            {recommended.images[0] && <img src={recommended.images[0]} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <p className="rp-label" style={{ margin: 0, color: INK }}>★ Nuestra recomendación</p>
                                            <p style={{ fontSize: 17, fontWeight: 800, margin: '2px 0 0', letterSpacing: '-.01em' }}>{recommended.car.brand} {recommended.car.model}</p>
                                            {recommendReason ? (
                                                <p style={{ fontSize: 11.5, color: MUTED, margin: '3px 0 0', lineHeight: 1.45 }}>{recommendReason}</p>
                                            ) : (
                                                <p className="rp-num" style={{ fontSize: 11.5, color: MUTED, margin: '3px 0 0' }}>
                                                    {[recommended.car.year, recommended.car.mileage != null ? `${recommended.car.mileage.toLocaleString('es-ES')} km` : null, recommended.car.cv ? `${recommended.car.cv} CV` : null].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        <p className="rp-num" style={{ fontSize: 20, fontWeight: 800, margin: '0 6px 0 0', flexShrink: 0 }}>{eur(recommended.price.final)}</p>
                                    </div>
                                )}

                                <div style={{ marginTop: 16, borderTop: `1px solid ${LINE}` }}>
                                    {coverCars.map(({ car, price, images }) => (
                                        <div key={car.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1px solid ${LINE}` }}>
                                            <span className="rp-num" style={{ width: 22, height: 22, borderRadius: 999, background: car.id === highlightId ? (recommended ? INK : ACCENT) : SOFT, color: car.id === highlightId ? '#fff' : MUTED, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{reportCars.findIndex(r => r.car.id === car.id) + 1}</span>
                                            <div style={{ width: 52, height: 36, borderRadius: 6, overflow: 'hidden', background: SOFT, flexShrink: 0 }}>
                                                {images[0] && <img src={images[0]} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                            </div>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <p style={{ fontWeight: 650, fontSize: 14, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{car.brand} {car.model}</p>
                                                <p className="rp-num" style={{ fontSize: 11, color: MUTED, margin: 0 }}>
                                                    {[car.year, car.mileage != null ? `${car.mileage.toLocaleString('es-ES')} km` : null, car.cv ? `${car.cv} CV` : null, car.fuelType || null].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <p className="rp-num" style={{ fontWeight: 750, fontSize: 15, margin: 0 }}>{eur(price.final)}</p>
                                                <div style={{ marginTop: 2 }}><CarTags recommended={car.id === recommended?.car.id} cheapest={car.id === cheapestId} size={8} /></div>
                                            </div>
                                        </div>
                                    ))}
                                    {reportCars.length > COVER_MAX && (
                                        <p style={{ fontSize: 12, color: MUTED, margin: '10px 0 0' }}>
                                            Y {reportCars.length - COVER_MAX} {reportCars.length - COVER_MAX === 1 ? 'vehículo más' : 'vehículos más'}: todos comparados en la página siguiente.
                                        </p>
                                    )}
                                </div>

                                <p style={{ marginTop: 'auto', fontSize: 11, color: MUTED }}>Precios finales en España, llave en mano y matriculados.</p>
                            </div>
                        </section>
                        )}

                        {/* COMPARATIVA ENTRE COCHES: solo si en la portada no caben todos */}
                        {reportCars.length > COVER_MAX && (
                            <section className="rp-sheet">
                                {runningHeader('Resumen')}
                                <h2 className="rp-h2">Resumen del presupuesto</h2>
                                <p style={{ fontSize: 13, color: MUTED, margin: '-6px 0 16px' }}>
                                    Comparativa de los {reportCars.length} vehículos. Todos los precios son finales en España, llave en mano.
                                </p>
                                <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
                                <table className="rp-num" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            {['Vehículo', 'Año', 'Km', 'CV', 'Combustible', 'Precio final'].map((h, i) => (
                                                <th key={h} className="rp-label" style={{ textAlign: i >= 1 ? 'right' : 'left', padding: '10px 12px', background: SOFT, borderBottom: `1px solid ${LINE}` }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportCars.map(({ car, price, images }) => (
                                            <tr key={car.id} style={{ background: car.id === highlightId ? '#f2f5ff' : undefined }}>
                                                <td style={{ padding: '10px 12px', borderBottom: `1px solid ${LINE}` }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ width: 56, height: 38, borderRadius: 6, overflow: 'hidden', background: SOFT, flexShrink: 0 }}>
                                                            {images[0] && <img src={images[0]} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                        </div>
                                                        <div>
                                                            <p style={{ fontWeight: 600, margin: 0 }}>{car.brand} {car.model}</p>
                                                            <div style={{ marginTop: 3 }}><CarTags recommended={car.id === recommended?.car.id} cheapest={car.id === cheapestId} size={8} /></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '10px 12px', borderBottom: `1px solid ${LINE}` }}>{car.year ?? '—'}</td>
                                                <td style={{ textAlign: 'right', padding: '10px 12px', borderBottom: `1px solid ${LINE}` }}>{car.mileage != null ? car.mileage.toLocaleString('es-ES') : '—'}</td>
                                                <td style={{ textAlign: 'right', padding: '10px 12px', borderBottom: `1px solid ${LINE}` }}>{car.cv ?? '—'}</td>
                                                <td style={{ textAlign: 'right', padding: '10px 12px', borderBottom: `1px solid ${LINE}` }}>{car.fuelType || '—'}</td>
                                                <td style={{ textAlign: 'right', padding: '10px 12px', borderBottom: `1px solid ${LINE}`, fontWeight: 700, fontSize: 14 }}>
                                                    {eur(price.final)}{price.estimated && <span style={{ fontWeight: 400, color: MUTED }}> *</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                                {reportCars.some(r => r.price.estimated) && (
                                    <p style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>* Precio estimado: incluye impuesto de matriculación, transporte, ITV, homologación, tasas y gestoría.</p>
                                )}
                            </section>
                        )}

                        {/* UN CAPÍTULO POR COCHE */}
                        {reportCars.map(({ car, config, spain, price, images, checklist }, carIndex) => (
                            <section key={car.id} className="rp-sheet rp-fit">
                                <div className="rp-fit-inner">
                                {runningHeader(reportCars.length > 1 ? `Vehículo ${carIndex + 1} de ${reportCars.length}` : 'Detalle del vehículo')}

                                {(() => {
                                    // Ficha de UNA página por coche: foto y precio lado a lado, el resto compacto
                                    const visible = blocks.filter(b => b.isVisible)
                                    const showSummary = visible.some(b => b.id === 'summary')
                                    const pricingInSummary = showSummary && visible.some(b => b.id === 'pricing')

                                    const priceCard = (
                                        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                            <div style={{ padding: '4px 14px', flex: 1 }}>
                                                <p className="rp-label" style={{ margin: '8px 0 2px' }}>{blockTitle('pricing')}</p>
                                                {price.lines.map((line, i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: i < price.lines.length - 1 || price.discount > 0 ? `1px solid ${LINE}` : 'none', fontSize: 11.5 }}>
                                                        <span style={{ color: i === 0 ? INK : MUTED }}>{line.label}</span>
                                                        <span className="rp-num" style={{ fontWeight: i === 0 ? 600 : 500, whiteSpace: 'nowrap' }}>{eur(line.amount)}</span>
                                                    </div>
                                                ))}
                                                {price.discount > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11.5, color: SUCCESS, fontWeight: 600 }}>
                                                        <span>Descuento negociado</span>
                                                        <span className="rp-num">−{eur(price.discount)}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ background: INK, color: '#fff', padding: '12px 14px' }}>
                                                <p style={{ margin: 0, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7, fontWeight: 600 }}>Precio final en España</p>
                                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                                                    <span style={{ fontSize: 10.5, opacity: .7 }}>Llave en mano{price.estimated ? ' · estimado' : ''}</span>
                                                    <span className="rp-num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>{eur(price.final)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )

                                    return visible.map(block => {
                                        switch (block.id) {
                                            case 'summary':
                                                return (
                                                    <div key={block.id} className="rp-avoid">
                                                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, margin: '0 0 10px' }}>
                                                            <div style={{ minWidth: 0 }}>
                                                                <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: 0, lineHeight: 1.1 }}>{car.brand} {car.model}</h1>
                                                                <p style={{ fontSize: 12.5, color: MUTED, margin: '3px 0 0' }}>
                                                                    {[car.year ? `${car.month ? `${String(car.month).padStart(2, '0')}/` : ''}${car.year}` : null, car.origin || car.location].filter(Boolean).join(' · ')}
                                                                </p>
                                                            </div>
                                                            {reportCars.length > 1 && <CarTags recommended={car.id === recommended?.car.id} cheapest={car.id === cheapestId} />}
                                                        </div>
                                                        {reportCars.length > 1 && car.id === recommended?.car.id && recommendReason && (
                                                            <p style={{ fontSize: 11.5, color: INK, margin: '-4px 0 10px', lineHeight: 1.45 }}>{recommendReason}</p>
                                                        )}

                                                        <div style={{ display: 'grid', gridTemplateColumns: pricingInSummary ? '1.35fr 1fr' : '1fr', gap: 12, alignItems: 'stretch' }}>
                                                            <div style={{ borderRadius: 12, overflow: 'hidden', background: SOFT, aspectRatio: pricingInSummary ? '16 / 11' : '16 / 7' }}>
                                                                {images[0] && <img src={images[0]} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                                                            </div>
                                                            {pricingInSummary && priceCard}
                                                        </div>

                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
                                                            {[
                                                                ['Año', car.year ?? '—'],
                                                                ['Kilómetros', car.mileage != null ? car.mileage.toLocaleString('es-ES') : '—'],
                                                                ['Potencia', car.cv ? `${car.cv} CV` : '—'],
                                                                ['Combustible', car.fuelType || '—'],
                                                            ].map(([label, value]) => (
                                                                <div key={label as string} style={{ background: SOFT, borderRadius: 8, padding: '6px 10px' }}>
                                                                    <p className="rp-label" style={{ margin: 0, fontSize: 8.5 }}>{label}</p>
                                                                    <p className="rp-num" style={{ fontSize: 13.5, fontWeight: 700, margin: '1px 0 0' }}>{value}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {pricingInSummary && price.estimated && (
                                                            <p style={{ fontSize: 9.5, color: MUTED, margin: '6px 0 0' }}>
                                                                Precio estimado con los costes habituales de importación; se confirma con el presupuesto de transporte y la tasación de Hacienda.
                                                            </p>
                                                        )}
                                                    </div>
                                                )

                                            case 'pricing':
                                                if (pricingInSummary) return null
                                                return <div key={block.id} className="rp-cblock rp-avoid">{priceCard}</div>

                                            case 'comparison': {
                                                if (!spain) return null
                                                const saving = spain.price - price.final
                                                return (
                                                    <div key={block.id} className="rp-cblock rp-avoid">
                                                        <h3 className="rp-h3">{block.title}</h3>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                            <div style={{ borderRadius: 10, padding: '8px 12px', border: `1px solid ${ACCENT}`, background: '#f5f7ff' }}>
                                                                <p className="rp-label" style={{ margin: 0, color: ACCENT, fontSize: 8.5 }}>Importado con NorDrive</p>
                                                                <p className="rp-num" style={{ fontSize: 16, fontWeight: 800, margin: '1px 0 0' }}>{eur(price.final)}</p>
                                                                <p className="rp-num" style={{ fontSize: 10, color: MUTED, margin: 0 }}>{[car.year, car.mileage != null ? `${car.mileage.toLocaleString('es-ES')} km` : null, config.equipmentLevel].filter(Boolean).join(' · ')}</p>
                                                            </div>
                                                            <div style={{ borderRadius: 10, padding: '8px 12px', border: `1px solid ${LINE}` }}>
                                                                <p className="rp-label" style={{ margin: 0, fontSize: 8.5 }}>Equivalente en España</p>
                                                                <p className="rp-num" style={{ fontSize: 16, fontWeight: 800, margin: '1px 0 0' }}>{eur(spain.price)}</p>
                                                                <p className="rp-num" style={{ fontSize: 10, color: MUTED, margin: 0 }}>{[spain.year, spain.mileage != null ? `${spain.mileage.toLocaleString('es-ES')} km` : null, spain.equipmentLevel].filter(Boolean).join(' · ')}</p>
                                                            </div>
                                                            <div style={{ borderRadius: 10, padding: '8px 12px', background: saving > 0 ? '#ecfdf3' : SOFT, border: `1px solid ${saving > 0 ? '#bbf7d0' : LINE}` }}>
                                                                <p className="rp-label" style={{ margin: 0, fontSize: 8.5, color: saving > 0 ? SUCCESS : MUTED }}>{saving > 0 ? 'Ahorro' : 'Diferencia'}</p>
                                                                <p className="rp-num" style={{ fontSize: 16, fontWeight: 800, margin: '1px 0 0', color: saving > 0 ? SUCCESS : INK }}>{eur(Math.abs(saving))}</p>
                                                                <p className="rp-num" style={{ fontSize: 10, color: saving > 0 ? SUCCESS : MUTED, margin: 0 }}>
                                                                    {saving > 0 && spain.price > 0 ? `−${((saving / spain.price) * 100).toFixed(1)}% frente a España` : 'Ventaja en equipamiento o km'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            case 'specs': {
                                                const specs: [string, string][] = ([
                                                    ['Primera matriculación', car.year ? `${car.month ? `${String(car.month).padStart(2, '0')}/` : ''}${car.year}` : ''],
                                                    ['Kilómetros', car.mileage != null ? `${car.mileage.toLocaleString('es-ES')} km` : ''],
                                                    ['Potencia', car.cv ? `${car.cv} CV` : ''],
                                                    ['Combustible', car.fuelType],
                                                    ['Cambio', car.transmission],
                                                    ['Motor', car.motorType],
                                                    ['Cilindrada', car.displacement ? `${car.displacement} cc` : ''],
                                                    ['Tracción', car.traction],
                                                    ['Puertas', car.doors],
                                                    ['Color', car.color],
                                                    ['Emisiones CO₂', car.co2 ? `${car.co2} g/km` : ''],
                                                    ['Procedencia', car.origin || car.location],
                                                ] as [string, string][]).filter(([, value]) => value)
                                                const perRow = 3
                                                return (
                                                    <div key={block.id} className="rp-cblock rp-avoid rp-keep">
                                                        <h3 className="rp-h3">{block.title}</h3>
                                                        <table className="rp-num rp-keep" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                                            <tbody>
                                                                {Array.from({ length: Math.ceil(specs.length / perRow) }, (_, row) => (
                                                                    <tr key={row} className="rp-keep">
                                                                        {Array.from({ length: perRow }, (_, col) => {
                                                                            const pair = specs[row * perRow + col]
                                                                            return (
                                                                                <td key={col} style={{ width: `${100 / perRow}%`, padding: '5px 0', paddingRight: col < perRow - 1 ? 14 : 0, borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' }}>
                                                                                    {pair && (
                                                                                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                                                            <span style={{ color: MUTED }}>{pair[0]}</span>
                                                                                            <span style={{ fontWeight: 600, textAlign: 'right' }}>{pair[1]}</span>
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            )
                                                                        })}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )
                                            }

                                            case 'features': {
                                                if (car.equipment.length === 0) return null
                                                const maxItems = 18
                                                return (
                                                    <div key={block.id} className="rp-cblock rp-avoid">
                                                        <h3 className="rp-h3">{block.title}</h3>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                                            {car.equipment.slice(0, maxItems).map((item, i) => (
                                                                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '3px 8px', borderRadius: 999, background: SOFT, border: `1px solid ${LINE}` }}>
                                                                    <Check style={{ width: 10, height: 10, color: ACCENT }} /> {item}
                                                                </span>
                                                            ))}
                                                            {car.equipment.length > maxItems && (
                                                                <span style={{ fontSize: 10.5, padding: '3px 8px', color: MUTED }}>y {car.equipment.length - maxItems} más</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            case 'gallery':
                                                if (images.length <= 1) return null
                                                return (
                                                    <div key={block.id} className="rp-cblock rp-avoid">
                                                        <h3 className="rp-h3">{block.title}</h3>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                                                            {images.slice(1, 6).map((img, i) => (
                                                                <div key={i} style={{ aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden', background: SOFT }}>
                                                                    <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )

                                            case 'inspection': {
                                                if (!checklist) return null
                                                const groups = Object.entries(CHECKLIST_SECTIONS).map(([key, sec]) => {
                                                    const checked = sec.items
                                                        .map((item, idx) => ({ item, data: checklist[`${key}-${idx}`] }))
                                                        .filter(i => i.data?.checked)
                                                    return { title: sec.title, checked, notes: checked.filter(i => i.data.note) }
                                                }).filter(g => g.checked.length > 0)
                                                if (groups.length === 0) return null
                                                return (
                                                    <div key={block.id} className="rp-cblock rp-avoid">
                                                        <h3 className="rp-h3">{block.title}</h3>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                                            {groups.map(group => (
                                                                <div key={group.title} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 9px', fontSize: 10.5 }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                                                        <span style={{ fontWeight: 700 }}>{group.title}</span>
                                                                        <span className="rp-num" style={{ color: SUCCESS, fontWeight: 600, whiteSpace: 'nowrap' }}>✓ {group.checked.length - group.notes.length}/{group.checked.length}</span>
                                                                    </div>
                                                                    {group.notes.map(({ item, data }) => (
                                                                        <p key={item} style={{ margin: '3px 0 0', color: INK }}>
                                                                            <span style={{ color: MUTED }}>{item}:</span> {data.note}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            case 'notes':
                                                if (!car.notes) return null
                                                return (
                                                    <div key={block.id} className="rp-cblock rp-avoid">
                                                        <h3 className="rp-h3">{block.title}</h3>
                                                        <p style={{ fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{car.notes}</p>
                                                    </div>
                                                )
                                        }
                                        return null
                                    })
                                })()}

                                {/* Bloques personalizados y pie: al final de la última hoja, sin página propia */}
                                {carIndex === reportCars.length - 1 && (
                                    <div style={{ marginTop: 16 }}>
                            {customBlocks.filter(b => b.isVisible).map((block, i) => (
                                <div key={block.id} className="rp-avoid" style={{ marginTop: i === 0 ? 0 : 28 }}>
                                    {block.title && <h2 className="rp-h2">{block.title}</h2>}
                                    {block.type === 'image' && block.image && (
                                        <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
                                            <img src={block.image} alt={block.title} style={{ width: '100%', display: 'block' }} />
                                        </div>
                                    )}
                                    {block.content && <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{block.content}</p>}
                                </div>
                            ))}

                            <div className="rp-avoid" style={{ marginTop: customBlocks.some(b => b.isVisible) ? 32 : 8, background: SOFT, borderRadius: 12, padding: '18px 20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: showFooterContact ? '1.2fr 1fr 1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
                                    <div>
                                        <p style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>NorDrive</p>
                                        <p style={{ fontSize: 12, color: MUTED, margin: '2px 0 0' }}>Importación profesional de vehículos</p>
                                    </div>
                                    {showFooterContact && (
                                        <div style={{ fontSize: 12, display: 'grid', gap: 3 }}>
                                            <p className="rp-label" style={{ margin: '0 0 2px' }}>Contacto</p>
                                            <span>{footerEmail}</span>
                                            <span>{footerPhone}</span>
                                            <span>{footerWeb}</span>
                                        </div>
                                    )}
                                    <div style={{ fontSize: 11, color: MUTED, textAlign: showFooterContact ? 'left' : 'right' }}>
                                        <p style={{ margin: 0 }}>
                                            {validityDays > 0
                                                ? `Presupuesto válido ${validityDays} días desde su emisión (hasta el ${new Date(new Date(reportDate).getTime() + validityDays * 86400000).toLocaleDateString('es-ES')}).`
                                                : 'Documento informativo no vinculante.'}
                                        </p>
                                        <p style={{ margin: '2px 0 0' }}>Importes sujetos a la tasación oficial de Hacienda y a la disponibilidad del vehículo.</p>
                                    </div>
                                </div>
                                <p style={{ fontSize: 10, color: MUTED, margin: '14px 0 0', borderTop: `1px solid ${LINE}`, paddingTop: 10, textAlign: 'center' }}>
                                    © {new Date().getFullYear()} NorDrive · {formattedDate}
                                </p>
                            </div>
                                    </div>
                                )}
                                </div>
                            </section>
                        ))}

                    </div>
                </div>
            </div>
        )
    }

    // --- Editor ---

    const availableCars = cars.filter(c => !selectedIds.includes(c.id))

    return (
        <div className="space-y-6 animate-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">Generador de informes</h2>
                <p className="text-muted-foreground">Prepara un presupuesto en PDF con uno o varios coches para tu cliente.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Configuración general */}
                <div className="lg:col-span-4">
                    <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4 lg:sticky lg:top-20">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                <Settings className="h-4 w-4 text-primary" />
                            </div>
                            <h3 className="text-sm font-semibold">Configuración general</h3>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="report-client" className="text-[13px]">Cliente</Label>
                            <Input id="report-client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente" />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="report-title" className="text-[13px]">Título</Label>
                            <Input id="report-title" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="report-validity" className="text-[13px]">Validez (días)</Label>
                            <Input id="report-validity" type="number" min="0" className="tabular" value={validityDays}
                                onChange={(e) => setValidityDays(Math.max(0, Number(e.target.value) || 0))} />
                            <p className="text-xs text-muted-foreground">Se indica en el pie. Pon 0 para un documento solo informativo.</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="report-date" className="text-[13px]">Fecha</Label>
                            <Input id="report-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="tabular" />
                        </div>

                        <div className="space-y-3 border-t pt-4">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pie de página</p>
                            <label htmlFor="report-footer-contact" className="flex cursor-pointer items-center justify-between gap-3">
                                <span className="text-sm">Mostrar información de contacto</span>
                                <Switch id="report-footer-contact" checked={showFooterContact} onCheckedChange={setShowFooterContact} />
                            </label>
                            {showFooterContact && (
                                <div className="space-y-2">
                                    <Input type="email" value={footerEmail} onChange={(e) => setFooterEmail(e.target.value)} placeholder="Email" aria-label="Email de contacto" />
                                    <Input value={footerPhone} onChange={(e) => setFooterPhone(e.target.value)} placeholder="Teléfono" aria-label="Teléfono de contacto" />
                                    <Input value={footerWeb} onChange={(e) => setFooterWeb(e.target.value)} placeholder="Sitio web" aria-label="Sitio web" />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 border-t pt-4">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Añadir bloque al final</p>
                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" onClick={() => addCustomBlock('text')}>
                                    <Type className="h-4 w-4" /> Texto
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => addCustomBlock('image')}>
                                    <ImageIcon className="h-4 w-4" /> Imagen
                                </Button>
                            </div>
                        </div>

                        <Button onClick={() => setShowPreview(true)} disabled={reportCars.length === 0} className="w-full">
                            <FileText className="h-4 w-4" />
                            Generar informe{reportCars.length > 1 ? ` (${reportCars.length} coches)` : ''}
                        </Button>
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-6">
                    {/* Coches del informe */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">Coches del informe</h3>
                            <span className="tabular text-xs text-muted-foreground">{configs.length} seleccionados</span>
                        </div>

                        <Select value="" onValueChange={addCar}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={availableCars.length ? "Añadir un coche al informe…" : "No quedan coches por añadir"} />
                            </SelectTrigger>
                            <SelectContent>
                                {availableCars.map(car => (
                                    <SelectItem key={car.id} value={car.id}>
                                        {car.brand} {car.model} {car.year ? `(${car.year})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {reportCars.length === 0 ? (
                            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
                                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                    <CarIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <p className="font-medium">Añade uno o varios coches</p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Cada coche tendrá su propio capítulo y, si hay varios, una página comparándolos.</p>
                            </div>
                        ) : (
                            reportCars.map(({ car, config, price, images }, index) => (
                                <div key={car.id} className="rounded-xl border bg-card shadow-xs">
                                    <div className="flex items-center gap-3 border-b p-3">
                                        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                                            {images[0] ? <img src={images[0]} alt="" className="h-full w-full object-cover" /> : <CarIcon className="m-auto mt-3 h-5 w-5 text-muted-foreground" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium">{car.brand} {car.model}</p>
                                            <p className="tabular text-xs text-muted-foreground">
                                                Precio final en España: <span className="font-semibold text-foreground">{eur(price.final)}</span>
                                                {price.estimated && <span className="ml-1 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">estimado</span>}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                                            {reportCars.length > 1 && (
                                                <Button
                                                    variant={recommendedId === car.id ? "default" : "ghost"}
                                                    size="sm"
                                                    className="mr-1 h-8"
                                                    onClick={() => setRecommendedId(recommendedId === car.id ? "" : car.id)}
                                                    title={recommendedId === car.id ? "Quitar recomendación" : "Marcar como recomendado"}
                                                >
                                                    <Star className={`h-4 w-4 ${recommendedId === car.id ? "fill-current" : ""}`} />
                                                    <span className="hidden sm:inline">{recommendedId === car.id ? "Recomendado" : "Recomendar"}</span>
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon-sm" onClick={() => moveCar(index, -1)} disabled={index === 0} title="Subir"><MoveUp className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon-sm" onClick={() => moveCar(index, 1)} disabled={index === reportCars.length - 1} title="Bajar"><MoveDown className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => removeCar(car.id)} title="Quitar"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                    {reportCars.length > 1 && recommendedId === car.id && (
                                        <div className="space-y-1.5 border-b p-3">
                                            <Label className="text-[13px]">Por qué lo recomiendas (opcional)</Label>
                                            <Textarea rows={2} value={recommendReason} onChange={(e) => setRecommendReason(e.target.value)}
                                                placeholder="Mejor relación precio/kilómetros, equipamiento completo y revisiones al día." />
                                        </div>
                                    )}
                                    <div className="grid gap-3 p-3 sm:grid-cols-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[13px]">Comparar con coche de España</Label>
                                            <Select value={config.spainCarId || NONE_VALUE} onValueChange={(v) => updateConfig(car.id, { spainCarId: v === NONE_VALUE ? '' : v })}>
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={NONE_VALUE}>Sin comparativa</SelectItem>
                                                    {spainCars.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{s.brand} {s.model} {s.year ? `(${s.year})` : ''} · {eur(s.price)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[13px]">Descuento negociado (€)</Label>
                                            <Input type="number" min="0" className="tabular" value={config.discount || ''} placeholder="0"
                                                onChange={(e) => updateConfig(car.id, { discount: Number(e.target.value) || 0 })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[13px]">Nivel de equipamiento</Label>
                                            <Select value={config.equipmentLevel || NONE_VALUE} onValueChange={(v) => updateConfig(car.id, { equipmentLevel: v === NONE_VALUE ? '' : v })}>
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={NONE_VALUE}>Sin especificar</SelectItem>
                                                    <SelectItem value="Bajo">Bajo</SelectItem>
                                                    <SelectItem value="Medio">Medio</SelectItem>
                                                    <SelectItem value="Alto">Alto</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </section>

                    {/* Estructura */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">Contenido de cada coche</h3>
                            <span className="text-xs text-muted-foreground">Se aplica a todos los coches</span>
                        </div>
                        <div className="divide-y rounded-xl border bg-card shadow-xs">
                            {blocks.map((block, index) => (
                                <div key={block.id} className={`flex items-center gap-3 px-4 py-2.5 ${block.isVisible ? '' : 'opacity-60'}`}>
                                    <div className="min-w-0 flex-1">
                                        <input
                                            value={block.title}
                                            onChange={(e) => renameBlock(index, e.target.value)}
                                            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                            aria-label="Título del bloque"
                                        />
                                        <p className="px-2 text-xs text-muted-foreground">{BLOCK_HINTS[block.id]}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                                        <Button variant="ghost" size="icon-sm" onClick={() => moveBlock(index, -1)} disabled={index === 0} title="Subir"><MoveUp className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} title="Bajar"><MoveDown className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => toggleBlock(index)} title={block.isVisible ? 'Ocultar' : 'Mostrar'}>
                                            {block.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Bloques personalizados */}
                    {customBlocks.length > 0 && (
                        <section className="space-y-3">
                            <h3 className="text-sm font-semibold">Bloques al final del informe</h3>
                            {customBlocks.map((block, index) => (
                                <div key={block.id} className={`overflow-hidden rounded-xl border bg-card shadow-xs ${block.isVisible ? '' : 'opacity-60'}`}>
                                    <div className="flex items-center gap-3 border-b px-4 py-2.5">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            {block.type === 'text' ? <Type className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                                        </div>
                                        <input
                                            value={block.title}
                                            onChange={(e) => updateCustomBlock(block.id, { title: e.target.value })}
                                            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                            placeholder="Título del bloque"
                                        />
                                        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                                            <Button variant="ghost" size="icon-sm" onClick={() => moveCustomBlock(index, -1)} disabled={index === 0}><MoveUp className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon-sm" onClick={() => moveCustomBlock(index, 1)} disabled={index === customBlocks.length - 1}><MoveDown className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon-sm" onClick={() => updateCustomBlock(block.id, { isVisible: !block.isVisible })}>
                                                {block.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCustomBlocks(prev => prev.filter(b => b.id !== block.id))}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-3 p-4">
                                        {block.type === 'image' && (
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                                                    {block.image ? <img src={block.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageUpload(block.id, e)}
                                                    className="block w-full text-sm text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/15"
                                                />
                                            </div>
                                        )}
                                        <Textarea
                                            value={block.content}
                                            onChange={(e) => updateCustomBlock(block.id, { content: e.target.value })}
                                            placeholder={block.type === 'text' ? 'Escribe el contenido aquí…' : 'Descripción de la imagen (opcional)…'}
                                            rows={block.type === 'text' ? 4 : 2}
                                        />
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}

                    <div className="flex items-start gap-2 rounded-xl border bg-card p-4 text-xs text-muted-foreground shadow-xs">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <p>
                            El precio final en España sale de los gastos apuntados en cada coche. Si un coche no tiene gastos,
                            se estima con la calculadora de importación y aparece marcado como «estimado».
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
