import { useState, useEffect, useRef } from "react"
import { useReactToPrint } from 'react-to-print'
import {
    FileText, Printer, Check, X, Plus, Image as ImageIcon,
    Calendar, User, MoveUp, MoveDown, Trash2, Eye, EyeOff,
    Type, Layout, Settings, TrendingDown
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

// ... Imports

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

// ... Imports

// ... CHECKLIST_SECTIONS (ya está ahí)

interface Car {
    id: string
    brand: string
    model: string
    year: number
    month?: number
    price: number
    totalExpenses: number
    finalPrice: number
    mileage: number
    cv: number
    fuel?: string
    fuelType?: string
    transmission: string
    images: string[]
    equipment: string[]
    url: string
    color: string
    location: string
    notes?: string
    motorType?: string
    displacement?: string
    doors?: string
    traction?: string
}

interface SpainCar {
    id: string
    brand: string
    model: string
    year: number
    price: number
    mileage: number
    cv: number
    equipmentLevel?: string
}

type SectionType = 'header' | 'car-summary' | 'gallery' | 'features' | 'text-block' | 'image-block' | 'pricing' | 'comparison' | 'inspection'

interface ReportSection {
    // ...
    id: string
    type: SectionType
    title: string
    content?: string
    image?: string
    isVisible: boolean
    data?: any
}

// --- Components ---

export function ReportGenerator() {
    const [cars, setCars] = useState<Car[]>([])
    const [spainCars, setSpainCars] = useState<SpainCar[]>([])
    const [selectedCarId, setSelectedCarId] = useState<string>("")
    const [selectedSpainCarId, setSelectedSpainCarId] = useState<string>("")
    const [showPreview, setShowPreview] = useState(false)
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

    // Report State
    const [clientName, setClientName] = useState("")
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
    const [negotiationDiscount, setNegotiationDiscount] = useState<number>(0)
    const [importedCarEquipmentLevel, setImportedCarEquipmentLevel] = useState<string>("")
    const [sections, setSections] = useState<ReportSection[]>([])
    const [checklistData, setChecklistData] = useState<any>(null)
    const [imageBlobs, setImageBlobs] = useState<string[]>([])

    const reportRef = useRef<HTMLDivElement>(null)

    // Load Checklist and Images when car changes
    useEffect(() => {
        if (selectedCarId) {
            const fetchChecklist = async () => {
                const { data } = await supabase
                    .from('car_checklists')
                    .select('data')
                    .eq('car_id', selectedCarId)
                    .single()
                setChecklistData(data?.data || null)
            }
            fetchChecklist()

            const car = cars.find(c => c.id === selectedCarId)
            if (car && car.images?.length > 0) {
                const loadImages = async () => {
                    const promises = car.images.map(async (url) => {
                        try {
                            const response = await fetch(url)
                            const blob = await response.blob()
                            return URL.createObjectURL(blob)
                        } catch (e) {
                            console.error("Error loading image blob:", e)
                            return url
                        }
                    })
                    const blobs = await Promise.all(promises)
                    setImageBlobs(blobs)
                }
                loadImages()
            } else {
                setImageBlobs([])
            }
        } else {
            setChecklistData(null)
            setImageBlobs([])
        }
    }, [selectedCarId, cars])

    // Load Cars from Supabase
    useEffect(() => {
        const fetchReportData = async () => {
            try {
                // Fetch Imported Cars
                const { data: importedData, error: importedError } = await supabase
                    .from('imported_cars')
                    .select('*')
                    .order('created_at', { ascending: false })

                if (importedError) throw importedError

                // ... (resto del formateo de coches)

                // Si hay coche seleccionado, cargar su checklist
                if (selectedCarId) {
                    const { data: checkData } = await supabase
                        .from('car_checklists')
                        .select('data')
                        .eq('car_id', selectedCarId)
                        .single()

                    if (checkData) setChecklistData(checkData.data)
                    else setChecklistData(null)
                }

                // ... (resto del código)

                const formattedCars: Car[] = (importedData || []).map((car: any) => ({
                    id: car.id,
                    brand: car.brand,
                    model: car.model,
                    year: car.year,
                    month: 1, // Default or add to DB
                    price: Number(car.price),
                    totalExpenses: Number(car.total_cost) - Number(car.price), // Aprox
                    finalPrice: Number(car.total_cost),
                    mileage: Number(car.mileage),
                    cv: Number(car.cv),
                    fuel: car.fuel_type || "Gasolina", // Add to DB if missing
                    fuelType: car.fuel_type || "Gasolina",
                    transmission: car.transmission || "Manual", // Add to DB
                    images: car.images || (car.image_url ? [car.image_url] : []), // Usar array de imágenes si existe
                    equipment: car.equipment || [], // Add to DB
                    url: "",
                    color: car.color || "",
                    location: car.location || "",
                    notes: "",
                    motorType: "",
                    displacement: "",
                    doors: "",
                    traction: ""
                }))
                setCars(formattedCars)

                // Fetch Spain Cars
                const { data: spainData, error: spainError } = await supabase
                    .from('spain_cars')
                    .select('*')
                    .order('created_at', { ascending: false })

                if (spainError) throw spainError

                const formattedSpainCars: SpainCar[] = (spainData || []).map((car: any) => ({
                    id: car.id,
                    brand: car.brand,
                    model: car.model,
                    year: car.year,
                    price: Number(car.price),
                    mileage: Number(car.mileage),
                    cv: Number(car.cv),
                    equipmentLevel: "Medio" // Default
                }))
                setSpainCars(formattedSpainCars)

            } catch (error) {
                console.error("Error loading report data:", error)
                toast.error("Error al cargar datos para informes")
            }
        }

        fetchReportData()
    }, [])

    const selectedCar = cars.find((c) => c.id === selectedCarId)
    const selectedSpainCar = spainCars.find((c) => c.id === selectedSpainCarId)

    // Initialize Sections when Car is Selected
    useEffect(() => {
        if (selectedCar) {
            const baseSections: ReportSection[] = [
                { id: 'header', type: 'header', title: 'Encabezado', isVisible: true },
                { id: 'summary', type: 'car-summary', title: 'Resumen del Vehículo', isVisible: true },
                { id: 'features', type: 'features', title: 'Equipamiento Destacado', isVisible: true },
                { id: 'gallery', type: 'gallery', title: 'Galería de Imágenes', isVisible: true, data: { images: selectedCar.images } },
                { id: 'pricing', type: 'pricing', title: 'Oferta Económica', isVisible: true }
            ]

            // Add comparison section if Spain car is selected
            if (selectedSpainCarId) {
                baseSections.push({
                    id: 'comparison',
                    type: 'comparison',
                    title: 'Comparativa con España',
                    isVisible: true
                })
            }

            if (selectedCar.notes) {
                baseSections.push({
                    id: 'notes',
                    type: 'text-block',
                    title: 'Observaciones',
                    content: selectedCar.notes,
                    isVisible: true
                })
            }

            if (checklistData) {
                baseSections.push({
                    id: 'inspection',
                    type: 'inspection',
                    title: 'Inspección Técnica',
                    isVisible: true
                })
            }

            setSections(baseSections)
        } else {
            setSections([])
        }
    }, [selectedCarId, selectedSpainCarId, checklistData])

    // --- Actions ---

    const handlePrint = useReactToPrint({
        contentRef: reportRef,
        documentTitle: `Informe_${selectedCar?.brand}_${selectedCar?.model}_${new Date().toISOString().split('T')[0]}`,
        pageStyle: `
            @page {
                size: A4 portrait;
                margin: 0mm;
            }
            @media print {
                body {
                    print-color-adjust: exact;
                    -webkit-print-color-adjust: exact;
                    margin: 0;
                    padding: 0;
                }
                .report-page {
                    page-break-after: always;
                }
                .report-page:last-child {
                    page-break-after: auto;
                }
            }
        `
    })

    const moveSection = (index: number, direction: 'up' | 'down') => {
        const newSections = [...sections]
        if (direction === 'up' && index > 0) {
            [newSections[index], newSections[index - 1]] = [newSections[index - 1], newSections[index]]
        } else if (direction === 'down' && index < newSections.length - 1) {
            [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]]
        }
        setSections(newSections)
    }

    const toggleVisibility = (index: number) => {
        const newSections = [...sections]
        newSections[index].isVisible = !newSections[index].isVisible
        setSections(newSections)
    }

    const deleteSection = (index: number) => {
        const newSections = sections.filter((_, i) => i !== index)
        setSections(newSections)
    }

    const addSection = (type: SectionType) => {
        const newSection: ReportSection = {
            id: Date.now().toString(),
            type,
            title: type === 'text-block' ? 'Información Adicional' : 'Imagen Destacada',
            content: '',
            isVisible: true,
            data: {}
        }
        setSections([...sections, newSection])
    }

    const updateSection = (index: number, field: keyof ReportSection, value: any) => {
        const newSections = [...sections]
        newSections[index] = { ...newSections[index], [field]: value }
        setSections(newSections)
    }

    const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                updateSection(index, 'image', event.target?.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    // --- Renderers ---

    if (showPreview && selectedCar) {
        return (
            <div className="fixed inset-0 bg-white z-50 overflow-auto animate-in fade-in duration-200">
                {/* Toolbar */}
                <div className="sticky top-0 left-0 right-0 bg-slate-900 text-white p-4 flex justify-between items-center print:hidden shadow-lg z-50">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowPreview(false)}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" /> Volver al Editor
                        </button>
                        <span className="font-medium">Vista Previa del Informe</span>
                    </div>
                    <button
                        onClick={handlePrint}
                        disabled={isGeneratingPDF}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Printer className="w-4 h-4" />
                        {isGeneratingPDF ? 'Generando PDF...' : 'Descargar PDF'}
                    </button>
                </div>

                {/* Report Content */}
                <div ref={reportRef} data-report-content className="bg-white text-slate-800">
                    <style>{`
            @page {
                size: A4 portrait;
                margin: 0mm;
            }
            @media print {
                body {
                    print-color-adjust: exact;
                    -webkit-print-color-adjust: exact;
                    margin: 0;
                    padding: 0;
                }
                .report-page {
                    position: relative;
                    padding: 10mm 15mm;
                    page-break-after: auto;
                    min-height: auto;
                }
                .force-break {
                    page-break-after: always;
                    min-height: 297mm;
                }
                .page-break {
                    page-break-before: always;
                }
                .avoid-break {
                    page-break-inside: avoid;
                }
            }
            @media screen {
                .report-page {
                    width: 210mm;
                    min-height: auto;
                    padding: 20mm 15mm;
                    margin: 0 auto 20px;
                    background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                .force-break {
                    min-height: 297mm;
                }
            }
        `}</style>

                    {/* PORTADA - Página 1 */}
                    <div className="report-page force-break flex flex-col items-center justify-center text-center">
                        <div className="mb-8">
                            <h1 className="text-5xl font-extrabold text-slate-900 mb-2">NorDrive</h1>
                            <p className="text-lg text-slate-500">Importación de Vehículos</p>
                        </div>

                        <div className="my-8 w-full max-w-md">
                            <h2 className="text-4xl font-bold text-slate-900 mb-4">
                                {selectedCar.brand} {selectedCar.model}
                            </h2>
                            <p className="text-2xl text-slate-600 mb-8">
                                {selectedCar.year}{selectedCar.month ? `/${selectedCar.month}` : ''}
                            </p>

                            {(imageBlobs[0] || selectedCar.images?.[0]) && (
                                <div className="w-full aspect-video bg-slate-100 rounded-xl overflow-hidden border-2 border-slate-200 shadow-lg">
                                    <img src={imageBlobs[0] || selectedCar.images[0]} alt="Portada" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                </div>
                            )}
                        </div>

                        <div className="mt-auto pt-8">
                            <p className="text-sm text-slate-500">Informe preparado para</p>
                            <p className="text-xl font-semibold text-blue-600">{clientName || "Cliente"}</p>
                            <p className="text-sm text-slate-400 mt-4">{new Date(reportDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                    </div>

                    {/* ÍNDICE - Página 2 */}
                    <div className="report-page force-break">
                        <h2 className="text-3xl font-bold text-slate-900 mb-8 pb-4 border-b-4 border-blue-600">Índice</h2>
                        <div className="space-y-3">
                            {sections.filter(s => s.isVisible).map((section, idx) => (
                                <div key={section.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                                    <span className="text-slate-700">{idx + 1}. {section.title}</span>
                                    <span className="text-slate-400">{idx + 3}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CONTENIDO - Páginas siguientes */}
                    {sections.filter(s => s.isVisible).map((section, idx) => {
                        // Filter empty sections
                        if (section.type === 'pricing' && !selectedSpainCar) return null;
                        if (section.type === 'features' && (!selectedCar.equipment || selectedCar.equipment.length === 0)) return null;
                        if (section.type === 'gallery' && (!selectedCar.images || selectedCar.images.length <= 1)) return null;

                        return (
                            <div key={section.id} className="report-page avoid-break">
                                {/* Header Section */}
                                {section.type === 'header' && (
                                    <div>
                                        <div className="flex justify-between items-start border-b-4 border-blue-600 pb-6 mb-8">
                                            <div>
                                                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">NorDrive</h1>
                                                <p className="text-slate-500 font-medium mt-1">Importación de Vehículos</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-400 uppercase tracking-wider">Fecha</p>
                                                <p className="font-semibold">{new Date(reportDate).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Car Summary */}
                                {section.type === 'car-summary' && (
                                    <div>
                                        <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b-4 border-blue-600">
                                            Especificaciones del Vehículo
                                        </h2>

                                        <div className="mb-8">
                                            <h3 className="text-2xl font-bold text-slate-900 mb-2">
                                                {selectedCar.brand} {selectedCar.model}
                                            </h3>
                                            <p className="text-xl text-slate-500">
                                                {selectedCar.year}{selectedCar.month ? `/${selectedCar.month}` : ''} • {selectedCar.mileage?.toLocaleString()} km • {selectedCar.cv} CV
                                            </p>
                                        </div>

                                        <div className="mb-8">
                                            <h4 className="text-lg font-bold text-slate-900 mb-4">Datos Técnicos</h4>
                                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Año:</span>
                                                    <span className="font-semibold">{selectedCar.year}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Kilometraje:</span>
                                                    <span className="font-semibold">{selectedCar.mileage?.toLocaleString()} km</span>
                                                </div>
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Potencia:</span>
                                                    <span className="font-semibold">{selectedCar.cv} CV</span>
                                                </div>
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Combustible:</span>
                                                    <span className="font-semibold">{selectedCar.fuel || selectedCar.fuelType || "-"}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Transmisión:</span>
                                                    <span className="font-semibold">{selectedCar.transmission || "-"}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Color:</span>
                                                    <span className="font-semibold">{selectedCar.color || "-"}</span>
                                                </div>
                                                {selectedCar.motorType && (
                                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                                        <span className="text-slate-600">Motor:</span>
                                                        <span className="font-semibold">{selectedCar.motorType}</span>
                                                    </div>
                                                )}
                                                {selectedCar.displacement && (
                                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                                        <span className="text-slate-600">Cilindrada:</span>
                                                        <span className="font-semibold">{selectedCar.displacement} cc</span>
                                                    </div>
                                                )}
                                                {selectedCar.traction && (
                                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                                        <span className="text-slate-600">Tracción:</span>
                                                        <span className="font-semibold">{selectedCar.traction}</span>
                                                    </div>
                                                )}
                                                {selectedCar.doors && (
                                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                                        <span className="text-slate-600">Puertas:</span>
                                                        <span className="font-semibold">{selectedCar.doors}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Ubicación:</span>
                                                    <span className="font-semibold">{selectedCar.location || "-"}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Pricing */}
                                {section.type === 'pricing' && selectedSpainCar && (
                                    <div>
                                        <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b-4 border-blue-600">
                                            Oferta Económica
                                        </h2>
                                        <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 space-y-4">
                                            <div className="flex justify-between items-center text-lg border-b border-slate-200 pb-3">
                                                <span className="text-slate-700">Precio base del vehículo</span>
                                                <span className="font-semibold">{selectedCar.price?.toLocaleString()}€</span>
                                            </div>
                                            <div className="flex justify-between items-center text-lg border-b border-slate-200 pb-3">
                                                <span className="text-slate-700">Gastos de importación</span>
                                                <span className="font-semibold">{selectedCar.totalExpenses?.toLocaleString()}€</span>
                                            </div>
                                            {negotiationDiscount > 0 && (
                                                <div className="flex justify-between items-center text-lg border-b border-green-200 pb-3 bg-green-50 -mx-8 px-8 py-3">
                                                    <span className="text-green-700 flex items-center gap-2">
                                                        <TrendingDown className="w-5 h-5" />
                                                        Descuento negociado
                                                    </span>
                                                    <span className="font-bold text-green-700">-{negotiationDiscount?.toLocaleString()}€</span>
                                                </div>
                                            )}
                                            <div className="border-t-2 border-slate-300 pt-6 mt-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xl text-slate-700">Precio Final "Llave en mano"</span>
                                                    <p className="text-4xl font-bold text-blue-600">
                                                        {((selectedCar.finalPrice || 0) - negotiationDiscount).toLocaleString()}€
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-500 leading-relaxed border-t border-slate-200 pt-4 mt-4">
                                                Incluye: Vehículo, transporte internacional, matriculación, ITV, tasas de tráfico, gestión documental y garantía (si aplica).
                                            </p>
                                        </div>
                                        {/* Comparison with Spain */}
                                        <div className="avoid-break">
                                            <h3 className="text-lg font-bold text-slate-900 border-b-2 border-slate-100 pb-2 mb-4 flex items-center gap-6">
                                                <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                                                Comparativa con España
                                            </h3>
                                            <div className="grid grid-cols-2 gap-6">
                                                {/* Imported Car */}
                                                <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                                                    <p className="text-xs text-blue-600 uppercase font-semibold mb-2">Vehículo Importado</p>
                                                    <p className="text-2xl font-bold text-blue-900 mb-3">
                                                        {((selectedCar.finalPrice || 0) - negotiationDiscount).toLocaleString()}€
                                                    </p>
                                                    <dl className="space-y-1 text-sm">
                                                        <div className="flex justify-between"><dt className="text-blue-700">Año:</dt><dd className="font-medium">{selectedCar.year}</dd></div>
                                                        <div className="flex justify-between"><dt className="text-blue-700">Kilometraje:</dt><dd className="font-medium">{selectedCar.mileage?.toLocaleString()} km</dd></div>
                                                        <div className="flex justify-between"><dt className="text-blue-700">Potencia:</dt><dd className="font-medium">{selectedCar.cv} CV</dd></div>
                                                        {importedCarEquipmentLevel && (
                                                            <div className="flex justify-between"><dt className="text-blue-700">Equipamiento:</dt><dd className="font-medium">{importedCarEquipmentLevel}</dd></div>
                                                        )}
                                                    </dl>
                                                </div>

                                                {/* Spain Car */}
                                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                                                    <p className="text-xs text-slate-600 uppercase font-semibold mb-2">Vehículo en España</p>
                                                    <p className="text-2xl font-bold text-slate-900 mb-3">
                                                        {selectedSpainCar.price?.toLocaleString()}€
                                                    </p>
                                                    <dl className="space-y-1 text-sm">
                                                        <div className="flex justify-between"><dt className="text-slate-600">Año:</dt><dd className="font-medium">{selectedSpainCar.year}</dd></div>
                                                        <div className="flex justify-between"><dt className="text-slate-600">Kilometraje:</dt><dd className="font-medium">{selectedSpainCar.mileage?.toLocaleString()} km</dd></div>
                                                        <div className="flex justify-between"><dt className="text-slate-600">Potencia:</dt><dd className="font-medium">{selectedSpainCar.cv} CV</dd></div>
                                                        {selectedSpainCar.equipmentLevel && (
                                                            <div className="flex justify-between"><dt className="text-slate-600">Equipamiento:</dt><dd className="font-medium">{selectedSpainCar.equipmentLevel}</dd></div>
                                                        )}
                                                    </dl>
                                                </div>
                                            </div>

                                            {/* Savings */}
                                            <div className="mt-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm text-green-700 font-medium mb-1">💰 Te ahorras</p>
                                                        <p className="text-4xl font-extrabold text-green-600">
                                                            {(selectedSpainCar.price - ((selectedCar.finalPrice || 0) - negotiationDiscount)).toLocaleString()}€
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-green-700 uppercase tracking-wide mb-1">Diferencia</p>
                                                        <p className="text-2xl font-bold text-green-700">
                                                            {(((selectedSpainCar.price - ((selectedCar.finalPrice || 0) - negotiationDiscount)) / selectedSpainCar.price) * 100).toFixed(1)}%
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-green-700 mt-4 leading-relaxed">
                                                    Importando este vehículo ahorras significativamente en comparación con un vehículo similar en España.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                )}


                                {/* Features */}
                                {section.type === 'features' && selectedCar.equipment?.length > 0 && (
                                    <div className="avoid-break">
                                        <h3 className="text-lg font-bold text-slate-900 border-b-2 border-slate-100 pb-2 mb-4">Equipamiento</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            {selectedCar.equipment.map((item, idx) => (
                                                <div key={idx} className="flex items-start gap-2 text-sm">
                                                    <Check className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                                    <span className="text-slate-700">{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Gallery */}
                                {section.type === 'gallery' && (imageBlobs.length > 1 || selectedCar.images?.length > 1) && (
                                    <div className="avoid-break">
                                        <h3 className="text-lg font-bold text-slate-900 border-b-2 border-slate-100 pb-2 mb-4">Galería</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {(imageBlobs.length > 0 ? imageBlobs : selectedCar.images).slice(1, 7).map((img, idx) => (
                                                <div key={idx} className="aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                    <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Text Block */}
                                {section.type === 'text-block' && (
                                    <div>
                                        {section.title && <h3 className="text-lg font-bold text-slate-900 border-b-2 border-slate-100 pb-2 mb-4">{section.title}</h3>}
                                        <div className="prose max-w-none text-slate-700 whitespace-pre-wrap">
                                            {section.content}
                                        </div>
                                    </div>
                                )}

                                {/* Image Block */}
                                {section.type === 'image-block' && (
                                    <div>
                                        {section.title && <h3 className="text-lg font-bold text-slate-900 border-b-2 border-slate-100 pb-2 mb-4">{section.title}</h3>}
                                        {section.image && (
                                            <div className="w-full bg-slate-100 rounded-xl overflow-hidden mb-4 border border-slate-200">
                                                <img src={section.image} alt={section.title} className="w-full h-auto object-cover" />
                                            </div>
                                        )}
                                        {section.content && (
                                            <p className="text-slate-700">{section.content}</p>
                                        )}
                                    </div>
                                )}

                                {/* Inspection Checklist */}
                                {section.type === 'inspection' && checklistData && (
                                    <div className="avoid-break">
                                        <h3 className="text-lg font-bold text-slate-900 border-b-2 border-slate-100 pb-2 mb-4">Inspección Técnica</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {Object.entries(CHECKLIST_SECTIONS).map(([key, sec]: any) => {
                                                const items = sec.items.map((item: string, idx: number) => {
                                                    const itemKey = `${key}-${idx}`
                                                    const data = checklistData[itemKey]
                                                    if (data?.checked) {
                                                        return { item, note: data.note }
                                                    }
                                                    return null
                                                }).filter(Boolean)

                                                if (items.length === 0) return null

                                                return (
                                                    <div key={key} className="mb-4 break-inside-avoid">
                                                        <h4 className="font-semibold text-blue-600 mb-2 text-sm">{sec.title}</h4>
                                                        <ul className="space-y-2">
                                                            {items.map((i: any, idx: number) => (
                                                                <li key={idx} className="text-sm flex flex-col">
                                                                    <div className="flex items-start gap-2">
                                                                        <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                                                        <span className="text-slate-700">{i.item}</span>
                                                                    </div>
                                                                    {i.note && (
                                                                        <p className="text-xs text-slate-500 ml-6 italic mt-0.5 bg-yellow-50 px-2 py-1 rounded">
                                                                            {i.note}
                                                                        </p>
                                                                    )}
                                                                    {!i.note && (
                                                                        <p className="text-xs text-green-600 ml-6 mt-0.5">✓ Todo bien</p>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {/* Footer */}
                    <div className="mt-auto pt-12 avoid-break -mx-[15mm]">
                        <div className="flex justify-between items-end border-t border-slate-200 pt-4 px-[15mm]">
                            <div>
                                <h4 className="font-bold text-slate-900 text-lg">NorDrive</h4>
                                <p className="text-sm text-slate-500">Importación profesional de vehículos</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400 mb-1">Documento informativo no vinculante</p>
                                <p className="text-xs font-medium text-slate-600">
                                    {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in">
            <div>
                <h2 className="text-3xl font-bold mb-2">Generador de Informes</h2>
                <p className="text-muted-foreground">Personaliza y genera informes profesionales PDF para tus clientes.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Sidebar: Settings */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-card border border-border rounded-lg p-6 space-y-4 sticky top-6">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Configuración General
                        </h3>

                        <div>
                            <label className="block text-sm font-medium mb-1">Vehículo</label>
                            <select
                                value={selectedCarId}
                                onChange={(e) => setSelectedCarId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="">-- Selecciona un coche --</option>
                                {cars.map((car) => (
                                    <option key={car.id} value={car.id}>
                                        {car.brand} {car.model}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Cliente</label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Nombre del cliente"
                                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Fecha</label>
                            <input
                                type="date"
                                value={reportDate}
                                onChange={(e) => setReportDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div className="pt-4 border-t border-border">
                            <label className="block text-sm font-medium mb-1">Descuento Negociación (€)</label>
                            <input
                                type="number"
                                value={negotiationDiscount}
                                onChange={(e) => setNegotiationDiscount(Number(e.target.value))}
                                placeholder="0"
                                min="0"
                                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Se restará del precio final</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Coche de España (Comparativa)</label>
                            <select
                                value={selectedSpainCarId}
                                onChange={(e) => setSelectedSpainCarId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="">-- Sin comparativa --</option>
                                {spainCars.map((car) => (
                                    <option key={car.id} value={car.id}>
                                        {car.brand} {car.model} ({car.year})
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">Opcional: para mostrar ahorro</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Nivel Equipamiento Importado</label>
                            <select
                                value={importedCarEquipmentLevel}
                                onChange={(e) => setImportedCarEquipmentLevel(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="">-- Seleccionar nivel --</option>
                                <option value="Sin equipamiento">Sin equipamiento</option>
                                <option value="Bajo">Bajo</option>
                                <option value="Medio">Medio</option>
                                <option value="Alto">Alto</option>
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">Nivel de equipamiento del coche importado</p>
                        </div>

                        <div className="pt-4 border-t border-border">
                            <p className="text-sm font-medium mb-2">Añadir Sección</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => addSection('text-block')}
                                    disabled={!selectedCar}
                                    className="flex items-center justify-center gap-2 px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors disabled:opacity-50"
                                >
                                    <Type className="w-4 h-4" /> Texto
                                </button>
                                <button
                                    onClick={() => addSection('image-block')}
                                    disabled={!selectedCar}
                                    className="flex items-center justify-center gap-2 px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors disabled:opacity-50"
                                >
                                    <ImageIcon className="w-4 h-4" /> Imagen
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowPreview(true)}
                            disabled={!selectedCarId}
                            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20 mt-4"
                        >
                            <FileText className="w-5 h-5" />
                            Generar Informe
                        </button>
                    </div>
                </div>

                {/* Main Content: Section Editor */}
                <div className="lg:col-span-8 space-y-4">
                    {selectedCar ? (
                        <>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-lg">Estructura del Informe</h3>
                                <span className="text-sm text-muted-foreground">{sections.length} secciones</span>
                            </div>

                            <div className="space-y-4">
                                {sections.map((section, index) => (
                                    <div
                                        key={section.id}
                                        className={`bg-card border rounded-lg transition-all ${section.isVisible ? 'border-border' : 'border-border/50 opacity-60'
                                            }`}
                                    >
                                        {/* Section Header */}
                                        <div className="flex items-center justify-between p-4 bg-secondary/20 border-b border-border/50 rounded-t-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-background rounded-md border border-border">
                                                    {section.type === 'header' && <Layout className="w-4 h-4" />}
                                                    {section.type === 'car-summary' && <ImageIcon className="w-4 h-4" />}
                                                    {section.type === 'features' && <Check className="w-4 h-4" />}
                                                    {section.type === 'gallery' && <ImageIcon className="w-4 h-4" />}
                                                    {section.type === 'text-block' && <Type className="w-4 h-4" />}
                                                    {section.type === 'image-block' && <ImageIcon className="w-4 h-4" />}
                                                    {section.type === 'pricing' && <FileText className="w-4 h-4" />}
                                                    {section.type === 'comparison' && <TrendingDown className="w-4 h-4" />}
                                                </div>
                                                <input
                                                    value={section.title}
                                                    onChange={(e) => updateSection(index, 'title', e.target.value)}
                                                    className="bg-transparent font-medium focus:outline-none focus:underline"
                                                    placeholder="Título de la sección"
                                                />
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button onClick={() => moveSection(index, 'up')} disabled={index === 0} className="p-1.5 hover:bg-secondary rounded disabled:opacity-30">
                                                    <MoveUp className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => moveSection(index, 'down')} disabled={index === sections.length - 1} className="p-1.5 hover:bg-secondary rounded disabled:opacity-30">
                                                    <MoveDown className="w-4 h-4" />
                                                </button>
                                                <div className="w-px h-4 bg-border mx-1" />
                                                <button onClick={() => toggleVisibility(index)} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
                                                    {section.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                </button>
                                                {['text-block', 'image-block'].includes(section.type) && (
                                                    <button onClick={() => deleteSection(index)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded ml-1">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Section Body (Editable Content) */}
                                        {section.isVisible && (
                                            <div className="p-4 space-y-4">
                                                {section.type === 'text-block' && (
                                                    <textarea
                                                        value={section.content}
                                                        onChange={(e) => updateSection(index, 'content', e.target.value)}
                                                        placeholder="Escribe el contenido aquí..."
                                                        rows={4}
                                                        className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                                    />
                                                )}

                                                {section.type === 'image-block' && (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-24 h-24 bg-secondary rounded-lg overflow-hidden flex-shrink-0 border border-border flex items-center justify-center">
                                                                {section.image ? (
                                                                    <img src={section.image} alt="Preview" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="block text-sm font-medium mb-1">Imagen</label>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={(e) => handleImageUpload(index, e)}
                                                                    className="text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                                                />
                                                            </div>
                                                        </div>
                                                        <textarea
                                                            value={section.content}
                                                            onChange={(e) => updateSection(index, 'content', e.target.value)}
                                                            placeholder="Descripción de la imagen (opcional)..."
                                                            rows={2}
                                                            className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                                        />
                                                    </div>
                                                )}

                                                {/* Read-only previews for standard sections */}
                                                {['header', 'car-summary', 'features', 'gallery', 'pricing', 'comparison'].includes(section.type) && (
                                                    <p className="text-sm text-muted-foreground italic">
                                                        El contenido de esta sección se genera automáticamente a partir de los datos del coche.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 bg-secondary/20 rounded-lg border-2 border-dashed border-border text-center min-h-[400px]">
                            <FileText className="w-16 h-16 text-muted-foreground/50 mb-4" />
                            <h3 className="text-xl font-medium">Editor de Informes</h3>
                            <p className="text-muted-foreground max-w-sm mt-2">
                                Selecciona un vehículo en el panel izquierdo para comenzar a editar la estructura del informe.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
