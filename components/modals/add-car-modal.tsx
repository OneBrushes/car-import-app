"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  X,
  Plus,
  Trash2,
  ImageIcon,
  FileText,
  Gauge,
  ClipboardCheck,
  Euro,
  Settings,
  Tag,
  Link2,
  Car,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  ExternalLink,
  Loader2,
  StickyNote,
} from "lucide-react"
import { toast } from "sonner"
import { ImageUpload } from "../image-upload"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Users, Eye } from "lucide-react"
import { convertCurrency } from "@/lib/currency"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { usePageVisibility } from "@/hooks/use-page-visibility"
import { ImportFromUrl, type ScrapedCar } from "@/components/import-from-url"
import { cn } from "@/lib/utils"

interface AddCarModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  initialData?: any
}

interface ExpenseItem {
  id: string
  type: string
  amount: number
  description?: string
}

const expenseTypes = ["Importación", "Matriculación", "Circulación", "DGT", "ITV", "Matrículas", "Transferencia", "Otro"]

const vehicleTypes = ["Sedán", "SUV", "Deportivo", "Coupé", "Familiar", "Monovolumen", "Pickup"]
const motorTypes = ["V6", "V8", "I4", "V12", "Híbrido", "Eléctrico", "Diesel", "Gasolina"]
const fuelTypes = ["Gasolina", "Diésel", "Híbrido", "Eléctrico", "Gas"]
const transmissionTypes = ["Manual", "Automática", "Secuencial", "CVT"]
const tractionTypes = ["Delantera", "Trasera", "4x4", "AWD"]
const platforms = ["AutoScout24", "Mobile.de", "Coches.net", "Milanuncios", "Otro"]
const currencies = ["€", "£", "$", "CHF"]
const steeringOptions = ["Volante a la izquierda", "Volante a la derecha"]
const colors = ["Blanco", "Negro", "Gris", "Plata", "Azul", "Rojo", "Verde", "Marrón", "Beige", "Naranja", "Amarillo", "Violeta", "Oro"]
const doorsOptions = ["2", "3", "4", "5", "6", "7"]

const STEPS = [
  { id: "listing", label: "Anuncio", icon: Link2 },
  { id: "vehicle", label: "Vehículo", icon: Car },
  { id: "technical", label: "Técnico", icon: Gauge },
  { id: "costs", label: "Costes", icon: Euro },
  { id: "media", label: "Fotos y notas", icon: ImageIcon },
] as const

const MAX_IMAGES = 10

/* ---------- Normalización de datos importados desde un anuncio ---------- */

const firstMatch = (value: string, rules: [string[], string][]) => {
  const lower = value.toLowerCase()
  for (const [needles, result] of rules) {
    if (needles.some((n) => lower.includes(n))) return result
  }
  return value
}

export const normalisePlatform = (value: string) =>
  firstMatch(value, [
    [["autoscout24"], "AutoScout24"],
    [["mobile.de"], "Mobile.de"],
    [["coches.net"], "Coches.net"],
    [["milanuncios"], "Milanuncios"],
  ])

export const normaliseFuel = (value: string) =>
  firstMatch(value, [
    [["hybr", "híbr", "hibr"], "Híbrido"],
    [["diesel", "diésel", "gasoil", "gasóleo"], "Diésel"],
    [["elect", "elekt", "élect"], "Eléctrico"],
    [["benzin", "petrol", "gasolin", "essence", "super"], "Gasolina"],
    [["lpg", "cng", "gpl", "glp", "gas"], "Gas"],
  ])

export const normaliseTransmission = (value: string) =>
  firstMatch(value, [
    [["cvt"], "CVT"],
    [["sequen", "secuen", "séquen"], "Secuencial"],
    [["auto"], "Automática"],
    [["manu", "schalt"], "Manual"],
  ])

export const normaliseColor = (value: string) =>
  firstMatch(value, [
    [["silver", "silber", "argent", "plata"], "Plata"],
    [["white", "weiß", "weiss", "blanc"], "Blanco"],
    [["black", "schwarz", "noir", "negro"], "Negro"],
    [["grey", "gray", "grau", "gris"], "Gris"],
    [["blue", "blau", "bleu", "azul"], "Azul"],
    [["red", "rot", "rouge", "rojo"], "Rojo"],
    [["green", "grün", "gruen", "vert", "verde"], "Verde"],
    [["brown", "braun", "marron", "marrón"], "Marrón"],
    [["beige"], "Beige"],
    [["orange", "naranja"], "Naranja"],
    [["yellow", "gelb", "jaune", "amarillo"], "Amarillo"],
    [["violet", "purple", "lila", "violeta"], "Violeta"],
    [["gold", "oro"], "Oro"],
  ])

const currencyFromCode: Record<string, string> = { EUR: "€", GBP: "£", USD: "$", CHF: "CHF" }

const money = (value: number) => `${value.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`

/** Lista de opciones + el valor actual si no está en ella (p. ej. un valor importado). */
const withCurrent = (options: readonly string[], current: string) =>
  current && !options.includes(current) ? [...options, current] : [...options]

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"

export function AddCarModal({ isOpen, onClose, onSubmit, initialData }: AddCarModalProps) {
  const { user } = useAuth()
  const [isSharedCar, setIsSharedCar] = useState(false)
  const [ownerName, setOwnerName] = useState<string>("")
  const [step, setStep] = useState(0)
  const [convertedPrice, setConvertedPrice] = useState<number | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [formData, setFormData] = useState({
    // Información Básica
    brand: "",
    model: "",
    vehicleType: "",
    year: new Date().getFullYear(),
    month: 1, // Added month
    origin: "",
    platform: "",
    url: "",
    location: "",
    color: "",
    doors: "4",

    // Especificaciones
    motorType: "",
    displacement: "",
    co2: "",
    cv: "",
    mileage: "",
    fuelType: "",
    transmission: "",
    traction: "",
    steering: steeringOptions[0],

    // ITV
    inspectionName: "",
    inspectionStatus: "aprobada",
    inspectionExpiry: "",
    inspectionPdf: "",
    itv_link: "",

    // Precio
    price: "",
    currency: "€",
    transferCost: "", // Added transferCost

    // Otros
    defects: "",
    maintenance: [] as any[],
    tags: [] as string[],
    newTag: "",
    notes: "",
    images: [] as string[],

    // Gastos
    expenses: [] as ExpenseItem[],

    // Equipamiento
    equipment: [] as string[],
    newEquipment: "",
  })

  const [newExpense, setNewExpense] = useState({ type: expenseTypes[0], amount: "" })

  // Volver al primer paso cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) setStep(0)
  }, [isOpen])

  // Dialog states
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<any>(null)
  const [draftChecked, setDraftChecked] = useState(false)


  // Load initial data if provided
  // Load initial data if provided
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        brand: initialData.brand || "",
        model: initialData.model || "",
        vehicleType: initialData.vehicle_type || initialData.vehicleType || "",
        year: initialData.year || new Date().getFullYear(),
        month: initialData.month || 1,
        origin: initialData.origin || "",
        platform: initialData.platform || "",
        url: initialData.url || "",
        location: initialData.location || "",
        color: initialData.color || "",
        doors: initialData.doors || "",
        price: initialData.price?.toString() || "",
        mileage: initialData.mileage?.toString() || "",
        cv: initialData.cv?.toString() || "",
        motorType: initialData.motor_type || initialData.motorType || "",
        displacement: initialData.displacement || "",
        co2: initialData.co2 || "",
        fuelType: initialData.fuel_type || initialData.fuelType || "",
        transmission: initialData.transmission || "",
        traction: initialData.traction || "",
        steering: initialData.steering || steeringOptions[0],
        inspectionName: initialData.inspection_name || initialData.inspectionName || "",
        inspectionStatus: initialData.inspection_status || initialData.inspectionStatus || "aprobada",
        inspectionExpiry: initialData.inspection_expiry || initialData.inspectionExpiry || "",
        itv_link: initialData.itv_link || "",
        transferCost: initialData.transfer_cost?.toString() || initialData.transferCost || "",
        defects: initialData.defects || "",
        notes: initialData.notes || "",
        tags: initialData.tags || [],
        equipment: initialData.equipment || [],
        expenses: initialData.expenses || [],
        images: initialData.images && initialData.images.length > 0 ? initialData.images : (initialData.image_url ? [initialData.image_url] : []),
      }))
    } else {
      // Reset form if no initialData
      setFormData({
        brand: "",
        model: "",
        vehicleType: "",
        year: new Date().getFullYear(),
        month: 1,
        origin: "",
        platform: "",
        url: "",
        location: "",
        color: "",
        doors: "4",
        motorType: "",
        displacement: "",
        co2: "",
        cv: "",
        mileage: "",
        fuelType: "",
        transmission: "",
        traction: "",
        steering: steeringOptions[0],
        inspectionName: "",
        inspectionStatus: "aprobada",
        inspectionExpiry: "",
        inspectionPdf: "",
        itv_link: "",
        price: "",
        currency: "€",
        transferCost: "",
        defects: "",
        maintenance: [],
        tags: [],
        newTag: "",
        notes: "",
        images: [],
        expenses: [],
        equipment: [],
        newEquipment: "",
      })
    }
  }, [initialData])

  // Detect if car is shared and get owner name
  useEffect(() => {
    const checkIfShared = async () => {
      if (initialData && user) {
        // Check if this car is shared with current user (not owned by them)
        const isShared = initialData.user_id !== user.id &&
          initialData.shared_with?.includes(user.id)

        setIsSharedCar(isShared)

        if (isShared && initialData.user_id) {
          // Fetch owner name
          const { data } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', initialData.user_id)
            .single()

          if (data) {
            const name = data.first_name && data.last_name
              ? `${data.first_name} ${data.last_name}`
              : data.email
            setOwnerName(name)
          }
        }
      }
    }

    checkIfShared()
  }, [initialData, user])

  // Convert currency in real-time
  useEffect(() => {
    const convertPrice = async () => {
      const price = parseFloat(formData.price)

      if (!price || isNaN(price)) {
        setConvertedPrice(null)
        return
      }

      // Si ya está en EUR, no convertir
      if (formData.currency === '€') {
        setConvertedPrice(price)
        return
      }

      setIsConverting(true)
      try {
        // Mapear símbolos a códigos de moneda
        const currencyMap: { [key: string]: string } = {
          '€': 'EUR',
          '$': 'USD',
          '£': 'GBP',
          'CHF': 'CHF'
        }

        const fromCurrency = currencyMap[formData.currency] || 'EUR'
        const converted = await convertCurrency(price, fromCurrency, 'EUR')
        setConvertedPrice(converted)
      } catch (error) {
        console.error('Error converting currency:', error)
        setConvertedPrice(null)
      } finally {
        setIsConverting(false)
      }
    }

    convertPrice()
  }, [formData.price, formData.currency])

  // Auto-save to localStorage (only for new cars, not edits)
  useEffect(() => {
    if (!initialData && isOpen) {
      // Save draft every time formData changes
      const draftKey = 'car-draft-autosave'
      localStorage.setItem(draftKey, JSON.stringify({
        formData,
        timestamp: Date.now()
      }))
    }
  }, [formData, initialData, isOpen])

  // Force save when page becomes hidden (changing tabs/windows)
  usePageVisibility((isVisible) => {
    if (!isVisible && !initialData && isOpen) {
      // Force save immediately when hiding page
      const draftKey = 'car-draft-autosave'
      const hasRealData = formData.brand || formData.model || formData.price ||
        formData.mileage || formData.cv

      if (hasRealData) {
        localStorage.setItem(draftKey, JSON.stringify({
          formData,
          timestamp: Date.now()
        }))
        console.log('Draft saved before page hidden')
      }
    }
  })

  // Clean up old drafts (no restoration)
  useEffect(() => {
    if (!initialData && isOpen) {
      const draftKey = 'car-draft-autosave'
      const saved = localStorage.getItem(draftKey)

      if (saved) {
        try {
          const { timestamp } = JSON.parse(saved)
          const hourAgo = Date.now() - (60 * 60 * 1000)

          // Remove old drafts
          if (timestamp < hourAgo) {
            localStorage.removeItem(draftKey)
          }
        } catch (error) {
          localStorage.removeItem(draftKey)
        }
      }
    }
  }, [initialData, isOpen])

  const handleRestoreDraft = () => {
    setShowRestoreDialog(false)
    setPendingDraft(null)
  }

  const handleDiscardDraft = () => {
    localStorage.removeItem('car-draft-autosave')
    setShowRestoreDialog(false)
    setPendingDraft(null)
  }


  const handleClose = () => {
    // Don't ask if editing (initialData exists)
    if (initialData) {
      onClose()
      return
    }

    // Check if there's unsaved data (more comprehensive check)
    const hasData = formData.brand || formData.model || formData.price ||
      formData.mileage || formData.cv || formData.year !== new Date().getFullYear() ||
      formData.images.length > 0 || formData.expenses.length > 0

    if (hasData) {
      setShowCloseDialog(true)
    } else {
      // No data, just close and clean
      localStorage.removeItem('car-draft-autosave')
      onClose()
    }
  }

  const handleConfirmClose = () => {
    setShowCloseDialog(false)
    onClose()
  }

  const handleCancelClose = () => {
    setShowCloseDialog(false)
  }

  const handleChange = (e: any) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleAddTag = () => {
    if (formData.newTag.trim() && !formData.tags.includes(formData.newTag)) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, prev.newTag],
        newTag: "",
      }))
    }
  }

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }))
  }

  const handleAddEquipment = () => {
    if (formData.newEquipment.trim() && !formData.equipment.includes(formData.newEquipment)) {
      setFormData((prev) => ({
        ...prev,
        equipment: [...prev.equipment, prev.newEquipment],
        newEquipment: "",
      }))
    }
  }

  const handleRemoveEquipment = (item: string) => {
    setFormData((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((e) => e !== item),
    }))
  }

  const handleAddExpense = () => {
    if (newExpense.amount && !isNaN(parseFloat(newExpense.amount))) {
      const newExpenseItem = {
        id: crypto.randomUUID(),
        type: newExpense.type,
        amount: parseFloat(newExpense.amount),
      }

      setFormData((prev) => ({
        ...prev,
        expenses: [...prev.expenses, newExpenseItem],
      }))

      setNewExpense({ type: expenseTypes[0], amount: "" })
    } else {
      toast.error("Introduce un monto válido")
    }
  }

  const handleRemoveExpense = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== id),
    }))
  }

  const handleImagesChange = (images: string[]) => {
    setFormData((prev) => ({
      ...prev,
      images,
    }))
  }

  // Rellenar desde un anuncio: solo campos presentes y, al editar, solo campos vacíos
  const handleImported = (car: ScrapedCar) => {
    const isNew = !initialData
    setFormData((prev) => {
      const next = { ...prev }
      const canSet = (current: unknown) => isNew || current === "" || current === null || current === undefined
      const put = <K extends keyof typeof prev>(key: K, value: (typeof prev)[K] | undefined | null) => {
        if (value === undefined || value === null || value === "") return
        if (!canSet(prev[key])) return
        next[key] = value
      }

      put("url", car.url)
      put("platform", car.platform ? normalisePlatform(car.platform) : undefined)
      put("location", car.location)
      put("brand", car.brand)
      put("model", car.model)
      put("year", car.year)
      put("month", car.month)
      put("mileage", car.mileage != null ? String(car.mileage) : undefined)
      put("cv", car.cv != null ? String(car.cv) : undefined)
      put("fuelType", car.fuelType ? normaliseFuel(car.fuelType) : undefined)
      put("transmission", car.transmission ? normaliseTransmission(car.transmission) : undefined)
      put("color", car.color ? normaliseColor(car.color) : undefined)
      put("co2", car.co2 != null ? String(car.co2) : undefined)

      if (car.price != null && canSet(prev.price)) {
        next.price = String(car.price)
        const symbol = car.currency ? currencyFromCode[car.currency.toUpperCase()] : undefined
        if (symbol && currencies.includes(symbol)) next.currency = symbol
      }

      if (car.images?.length) {
        const merged = [...prev.images]
        for (const img of car.images) {
          if (img && !merged.includes(img)) merged.push(img)
        }
        next.images = merged.slice(0, Math.max(MAX_IMAGES, prev.images.length))
      }

      return next
    })
  }

  const calculateTotalExpenses = () => {
    const expensesSum = formData.expenses.reduce((sum, e) => sum + e.amount, 0)
    const transfer = Number.parseFloat(formData.transferCost || "0")
    return expensesSum + transfer
  }

  const calculateFinalPrice = () => {
    return Number.parseFloat(formData.price || "0") + calculateTotalExpenses()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Usar el precio convertido si no está en EUR, sino el precio original
    const priceInEUR = formData.currency !== '€' && convertedPrice
      ? convertedPrice
      : Number.parseFloat(formData.price)

    onSubmit({
      ...formData,
      price: priceInEUR, // Siempre guardar en EUR
      mileage: Number.parseInt(formData.mileage),
      cv: Number.parseInt(formData.cv),
      totalExpenses: calculateTotalExpenses(),
      finalPrice: priceInEUR + calculateTotalExpenses(),
    })

    // Clear draft from localStorage after successful submit
    localStorage.removeItem('car-draft-autosave')

    // Only reset if not editing (or maybe just close)
    if (!initialData) {
      setFormData({
        brand: "",
        model: "",
        vehicleType: "",
        year: new Date().getFullYear(),
        month: 1,
        origin: "",
        platform: "",
        url: "",
        location: "",
        color: "",
        doors: "4",
        motorType: "",
        displacement: "",
        co2: "",
        cv: "",
        mileage: "",
        fuelType: "",
        transmission: "",
        traction: "",
        steering: steeringOptions[0],
        inspectionName: "",
        inspectionStatus: "aprobada",
        inspectionExpiry: "",
        inspectionPdf: "",
        itv_link: "",
        price: "",
        currency: "€",
        transferCost: "",
        defects: "",
        maintenance: [],
        tags: [],
        newTag: "",
        notes: "",
        images: [],
        expenses: [],
        equipment: [],
        newEquipment: "",
      })
    }
  }

  if (!isOpen) return null

  const isLastStep = step === STEPS.length - 1
  const totalExpenses = calculateTotalExpenses()
  const finalPrice = calculateFinalPrice()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background w-full max-w-4xl rounded-xl border shadow-xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{initialData ? "Editar coche" : "Añadir coche"}</h2>
            <p className="text-sm text-muted-foreground">
              {initialData
                ? [formData.brand, formData.model].filter(Boolean).join(" ") || "Modifica los datos del coche"
                : "Rellena los datos por pasos o impórtalos desde un anuncio"}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Step indicator */}
        <nav className="border-b px-3 sm:px-5 py-3 overflow-x-auto no-scrollbar" aria-label="Pasos del formulario">
          <ol className="flex items-center gap-1 min-w-max">
            {STEPS.map((s, i) => {
              const isActive = i === step
              const isDone = i < step
              return (
                <li key={s.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={isActive ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs tabular",
                        isActive && "border-primary bg-primary text-primary-foreground",
                        isDone && "border-primary/40 bg-primary/10 text-primary",
                      )}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={cn(!isActive && "hidden sm:inline")}>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && <span className="h-px w-4 sm:w-6 bg-border" aria-hidden />}
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-muted/30 px-4 sm:px-5 py-5 space-y-4">
          {/* Warning Banner for New Cars */}
          {!initialData && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <p className="text-sm text-foreground">
                <strong className="font-medium">Importante:</strong> para guardar este coche, rellena al menos la marca y el modelo y pulsa «Guardar coche». Después podrás modificarlo editándolo. Si cierras sin guardar, se perderán los datos.
              </p>
            </div>
          )}

          {/* Read-Only Banner for Shared Cars */}
          {isSharedCar && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Eye className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-primary flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4" />
                  Coche compartido · Solo lectura
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Este coche ha sido compartido contigo por <span className="font-medium text-foreground">{ownerName}</span>. Puedes ver toda la información pero no editarla.
                </p>
              </div>
            </div>
          )}

          <form id="car-form" onSubmit={handleSubmit} className="space-y-4">
            {/* ---------- Paso 1: Anuncio ---------- */}
            <div className={cn("space-y-4", step !== 0 && "hidden")}>
              <ImportFromUrl onImported={handleImported} className="bg-card" />

              <FormSection icon={Link2} title="Anuncio" description="De dónde sale el coche">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="URL del anuncio" htmlFor="car-url" className="sm:col-span-2">
                    <Input
                      id="car-url"
                      type="url"
                      name="url"
                      placeholder="https://…"
                      value={formData.url}
                      onChange={handleChange}
                    />
                    {formData.url && (
                      <a
                        href={formData.url.startsWith("http") ? formData.url : `https://${formData.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Abrir anuncio
                      </a>
                    )}
                  </Field>
                  <Field label="Plataforma" htmlFor="car-platform">
                    <select
                      id="car-platform"
                      name="platform"
                      value={formData.platform}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(platforms, formData.platform).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ubicación" htmlFor="car-location">
                    <Input
                      id="car-location"
                      type="text"
                      name="location"
                      placeholder="Ciudad, región"
                      value={formData.location}
                      onChange={handleChange}
                    />
                  </Field>
                  <Field label="País de origen" htmlFor="car-origin">
                    <Input
                      id="car-origin"
                      type="text"
                      name="origin"
                      placeholder="Alemania, Francia…"
                      value={formData.origin}
                      onChange={handleChange}
                    />
                  </Field>
                </div>
              </FormSection>
            </div>

            {/* ---------- Paso 2: Vehículo ---------- */}
            <div className={cn("space-y-4", step !== 1 && "hidden")}>
              <FormSection icon={Car} title="Vehículo" description="Identificación y carrocería">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Marca" htmlFor="car-brand">
                    <Input
                      id="car-brand"
                      type="text"
                      name="brand"
                      placeholder="BMW"
                      value={formData.brand}
                      onChange={handleChange}
                      required
                    />
                  </Field>
                  <Field label="Modelo" htmlFor="car-model">
                    <Input
                      id="car-model"
                      type="text"
                      name="model"
                      placeholder="M3 Competition"
                      value={formData.model}
                      onChange={handleChange}
                      required
                    />
                  </Field>
                  <Field label="Año" htmlFor="car-year">
                    <Input
                      id="car-year"
                      type="number"
                      name="year"
                      placeholder="Año"
                      value={formData.year}
                      onChange={handleChange}
                      className="tabular"
                    />
                  </Field>
                  <Field label="Mes de matriculación" htmlFor="car-month">
                    <select
                      id="car-month"
                      name="month"
                      value={formData.month}
                      onChange={handleChange}
                      className={cn(selectClass, "capitalize")}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {new Date(0, m - 1).toLocaleString("es-ES", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tipo de vehículo" htmlFor="car-vehicle-type">
                    <select
                      id="car-vehicle-type"
                      name="vehicleType"
                      value={formData.vehicleType}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(vehicleTypes, formData.vehicleType).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Color" htmlFor="car-color">
                    <select
                      id="car-color"
                      name="color"
                      value={formData.color}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(colors, formData.color).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Puertas" htmlFor="car-doors">
                    <select
                      id="car-doors"
                      name="doors"
                      value={formData.doors}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(doorsOptions, formData.doors).map((d) => (
                        <option key={d} value={d}>
                          {d} puertas
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </FormSection>
            </div>

            {/* ---------- Paso 3: Técnico ---------- */}
            <div className={cn("space-y-4", step !== 2 && "hidden")}>
              <FormSection icon={Gauge} title="Especificaciones técnicas" description="Motor, potencia y transmisión">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Potencia (CV)" htmlFor="car-cv">
                    <Input
                      id="car-cv"
                      type="number"
                      name="cv"
                      placeholder="0"
                      value={formData.cv}
                      onChange={handleChange}
                      className="tabular"
                    />
                  </Field>
                  <Field label="Kilometraje (km)" htmlFor="car-mileage">
                    <Input
                      id="car-mileage"
                      type="number"
                      name="mileage"
                      placeholder="0"
                      value={formData.mileage}
                      onChange={handleChange}
                      className="tabular"
                    />
                  </Field>
                  <Field label="Combustible" htmlFor="car-fuel">
                    <select
                      id="car-fuel"
                      name="fuelType"
                      value={formData.fuelType}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(fuelTypes, formData.fuelType).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Transmisión" htmlFor="car-transmission">
                    <select
                      id="car-transmission"
                      name="transmission"
                      value={formData.transmission}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(transmissionTypes, formData.transmission).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tracción" htmlFor="car-traction">
                    <select
                      id="car-traction"
                      name="traction"
                      value={formData.traction}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="">Selecciona…</option>
                      {withCurrent(tractionTypes, formData.traction).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Dirección" htmlFor="car-steering">
                    <select
                      id="car-steering"
                      name="steering"
                      value={formData.steering}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      {withCurrent(steeringOptions, formData.steering).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tipo de motor" htmlFor="car-motor">
                    <Input
                      id="car-motor"
                      type="text"
                      name="motorType"
                      placeholder="V6, I4, Híbrido…"
                      value={formData.motorType}
                      onChange={handleChange}
                    />
                  </Field>
                  <Field label="Cilindrada (cc)" htmlFor="car-displacement">
                    <Input
                      id="car-displacement"
                      type="text"
                      name="displacement"
                      placeholder="2998"
                      value={formData.displacement}
                      onChange={handleChange}
                      className="tabular"
                    />
                  </Field>
                  <Field label="Emisiones CO₂ (g/km)" htmlFor="car-co2">
                    <Input
                      id="car-co2"
                      type="text"
                      name="co2"
                      placeholder="0"
                      value={formData.co2}
                      onChange={handleChange}
                      className="tabular"
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={ClipboardCheck} title="Inspección / ITV" description="Estado de la inspección técnica en origen">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nombre de la inspección" htmlFor="car-inspection-name">
                    <Input
                      id="car-inspection-name"
                      type="text"
                      name="inspectionName"
                      placeholder="TÜV, Contrôle technique…"
                      value={formData.inspectionName}
                      onChange={handleChange}
                    />
                  </Field>
                  <Field label="Estado" htmlFor="car-inspection-status">
                    <select
                      id="car-inspection-status"
                      name="inspectionStatus"
                      value={formData.inspectionStatus}
                      onChange={handleChange}
                      className={selectClass}
                    >
                      <option value="aprobada">Aprobada</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="caducada">Caducada</option>
                    </select>
                  </Field>
                  <Field label="Fecha de caducidad" htmlFor="car-inspection-expiry">
                    <Input
                      id="car-inspection-expiry"
                      type="date"
                      name="inspectionExpiry"
                      value={formData.inspectionExpiry}
                      onChange={handleChange}
                      className="tabular"
                    />
                  </Field>
                  <Field label="Enlace ITV" htmlFor="car-itv-link">
                    <Input
                      id="car-itv-link"
                      type="url"
                      name="itv_link"
                      placeholder="https://…"
                      value={formData.itv_link}
                      onChange={handleChange}
                    />
                    {formData.itv_link && (
                      <a
                        href={formData.itv_link.startsWith("http") ? formData.itv_link : `https://${formData.itv_link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Abrir enlace ITV
                      </a>
                    )}
                  </Field>
                </div>
              </FormSection>
            </div>

            {/* ---------- Paso 4: Costes ---------- */}
            <div className={cn("space-y-4", step !== 3 && "hidden")}>
              <FormSection icon={Euro} title="Precio" description="Precio de compra en origen">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Precio base" htmlFor="car-price">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {formData.currency}
                        </span>
                        <Input
                          id="car-price"
                          type="number"
                          name="price"
                          placeholder="0"
                          value={formData.price}
                          onChange={handleChange}
                          step="0.01"
                          className={cn("tabular", formData.currency.length > 1 ? "pl-12" : "pl-8")}
                        />
                      </div>
                      <select
                        name="currency"
                        aria-label="Moneda"
                        value={formData.currency}
                        onChange={handleChange}
                        className={cn(selectClass, "w-24")}
                      >
                        {currencies.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Conversion indicator */}
                    {formData.price && formData.currency !== '€' && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground">
                        {isConverting ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            Convirtiendo…
                          </span>
                        ) : convertedPrice ? (
                          <>
                            <span className="tabular font-medium text-foreground">≈ {money(convertedPrice)}</span>
                            <span className="text-[11px]">Tasa en tiempo real</span>
                          </>
                        ) : null}
                      </div>
                    )}
                  </Field>
                  <Field label="Coste de transferencia" htmlFor="car-transfer">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                      <Input
                        id="car-transfer"
                        type="number"
                        name="transferCost"
                        placeholder="0"
                        value={formData.transferCost}
                        onChange={handleChange}
                        className="pl-8 tabular"
                      />
                    </div>
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={FileText} title="Gastos adicionales" description="Importación, matriculación, impuestos…">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Tipo de gasto"
                      value={newExpense.type}
                      onChange={(e) => setNewExpense({ ...newExpense, type: e.target.value })}
                      className={cn(selectClass, "w-auto flex-1 min-w-[10rem]")}
                    >
                      {expenseTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="relative w-32">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                      <Input
                        type="number"
                        aria-label="Importe"
                        placeholder="0"
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                        className="pl-8 tabular"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={handleAddExpense}>
                      <Plus className="h-4 w-4" />
                      Añadir
                    </Button>
                  </div>

                  {formData.expenses.length > 0 ? (
                    <ul className="divide-y rounded-lg border">
                      {formData.expenses.map((expense) => (
                        <li key={expense.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span>{expense.type}</span>
                          <div className="flex items-center gap-2">
                            <span className="tabular font-medium">{money(expense.amount)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveExpense(expense.id)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Eliminar gasto ${expense.type}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                      Aún no hay gastos añadidos
                    </p>
                  )}
                </div>
              </FormSection>

              {/* Totales */}
              <div className="rounded-xl border bg-card p-5 shadow-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Precio base</span>
                  <span className="tabular">{money(Number(formData.price || 0))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gastos totales</span>
                  <span className="tabular">{money(totalExpenses)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Precio final</span>
                  <span className="tabular text-xl font-semibold">{money(finalPrice)}</span>
                </div>
              </div>
            </div>

            {/* ---------- Paso 5: Fotos y notas ---------- */}
            <div className={cn("space-y-4", step !== 4 && "hidden")}>
              <FormSection icon={ImageIcon} title="Fotos" description="La primera foto será la principal">
                <ImageUpload images={formData.images} onImagesChange={handleImagesChange} />
              </FormSection>

              <FormSection icon={StickyNote} title="Estado y notas">
                <div className="space-y-4">
                  <Field label="Defectos o daños conocidos" htmlFor="car-defects">
                    <Textarea
                      id="car-defects"
                      name="defects"
                      placeholder="Arañazos, golpes, testigos encendidos…"
                      value={formData.defects}
                      onChange={handleChange}
                      rows={3}
                      className="resize-none"
                    />
                  </Field>
                  <Field label="Notas privadas" htmlFor="car-notes">
                    <Textarea
                      id="car-notes"
                      name="notes"
                      placeholder="Notas internas sobre el coche…"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={4}
                      className="resize-none"
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={Tag} title="Etiquetas">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      aria-label="Nueva etiqueta"
                      placeholder="Nueva etiqueta…"
                      value={formData.newTag}
                      onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={handleAddTag} aria-label="Añadir etiqueta">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {formData.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="gap-1 border-transparent bg-primary/10 text-primary">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="rounded-sm hover:text-destructive"
                            aria-label={`Quitar etiqueta ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </FormSection>

              <FormSection icon={Settings} title="Equipamiento">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      aria-label="Nuevo equipamiento"
                      placeholder="Añadir equipamiento…"
                      value={formData.newEquipment}
                      onChange={(e) => setFormData({ ...formData, newEquipment: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddEquipment())}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={handleAddEquipment} aria-label="Añadir equipamiento">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {formData.equipment.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {formData.equipment.map((item) => (
                        <Badge key={item} variant="secondary" className="gap-1">
                          {item}
                          <button
                            type="button"
                            onClick={() => handleRemoveEquipment(item)}
                            className="rounded-sm hover:text-destructive"
                            aria-label={`Quitar ${item}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </FormSection>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background px-4 sm:px-5 py-3">
          <Button type="button" variant="ghost" onClick={handleClose} className="hidden sm:inline-flex">
            Cancelar
          </Button>
          <span className="text-xs text-muted-foreground tabular sm:hidden">
            Paso {step + 1} de {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Atrás</span>
            </Button>
            {!isLastStep && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            <span title={isSharedCar ? 'No puedes editar coches compartidos' : undefined}>
              <Button
                type="button"
                onClick={() => document.getElementById('car-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
                disabled={isSharedCar}
              >
                {isSharedCar ? (
                  <>
                    <Eye className="h-4 w-4" />
                    Solo lectura
                  </>
                ) : (
                  initialData ? "Guardar cambios" : "Guardar coche"
                )}
              </Button>
            </span>
          </div>
        </div>
      </div>

      {/* Close Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCloseDialog}
        title="¿Cerrar sin guardar?"
        message="El borrador no se guardará automáticamente. ¿Estás seguro?"
        confirmText="Cerrar"
        cancelText="Seguir editando"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        type="warning"
      />
    </div>
  )
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
      </Label>
      {children}
    </div>
  )
}
