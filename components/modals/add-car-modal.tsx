"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { X, Plus, Trash2, ChevronUp, ChevronDown, ImageIcon, FileText, Gauge, ClipboardCheck, Euro, Settings, Tag } from "lucide-react"
import { toast } from "sonner"
import { ImageUpload } from "../image-upload"

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

export function AddCarModal({ isOpen, onClose, onSubmit, initialData }: AddCarModalProps) {
  const [activeMobileTab, setActiveMobileTab] = useState("photos")
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

  const [activeSection, setActiveSection] = useState("basic")
  const [newExpense, setNewExpense] = useState({ type: expenseTypes[0], amount: "" })
  const [expandedSection, setExpandedSection] = useState<string | null>("basic")

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
    onSubmit({
      ...formData,
      price: Number.parseFloat(formData.price),
      mileage: Number.parseInt(formData.mileage),
      cv: Number.parseInt(formData.cv),
      totalExpenses: calculateTotalExpenses(),
      finalPrice: calculateFinalPrice(),
    })
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

  const sections = [
    { id: "basic", label: "Básica" },
    { id: "technical", label: "Técnica" },
    { id: "itv", label: "ITV" },
    { id: "pricing", label: "Precio" },
    { id: "equipment", label: "Equipamiento" },
    { id: "tags", label: "Etiquetas" },
    { id: "notes", label: "Notas" },
    { id: "photos", label: "Fotos" },
  ]

  const mobileTabs = [
    { id: "photos", label: "Fotos", icon: ImageIcon },
    { id: "basic", label: "Básica", icon: FileText },
    { id: "technical", label: "Técnica", icon: Gauge },
    { id: "itv", label: "Estado", icon: ClipboardCheck },
    { id: "pricing", label: "Costes", icon: Euro },
    { id: "equipment", label: "Extras", icon: Settings },
    { id: "tags", label: "Notas", icon: Tag },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg w-full max-w-6xl shadow-xl border border-border flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-background rounded-t-lg">
          <h2 className="text-xl font-bold">{initialData ? "Editar Coche" : "Añadir Coche"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Tabs Navigation */}
        <div className="lg:hidden flex overflow-x-auto border-b border-border bg-muted/5 p-2 gap-2 no-scrollbar">
          {mobileTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMobileTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeMobileTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground border border-border"
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Columna Izquierda: Imágenes (4 cols) */}
          <div className={`lg:col-span-4 p-6 border-r border-border overflow-y-auto bg-muted/5 ${activeMobileTab === 'photos' ? 'block' : 'hidden lg:block'}`}>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Galería de Fotos
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sube las fotos del coche aquí. La primera foto será la principal.
            </p>
            <ImageUpload images={formData.images} onImagesChange={handleImagesChange} />
          </div>

          {/* Columna Derecha: Formulario (8 cols) */}
          <div className={`lg:col-span-8 p-6 overflow-y-auto bg-background ${activeMobileTab !== 'photos' ? 'block' : 'hidden lg:block'}`}>
            <form id="car-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Información Básica */}
              <div className={activeMobileTab === 'basic' ? 'block' : 'hidden lg:block'}>
                <CollapsibleSection
                  title="Información Básica"
                  id="basic"
                  expanded={expandedSection}
                  onToggle={setExpandedSection}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      name="brand"
                      placeholder="Marca"
                      value={formData.brand}
                      onChange={handleChange}
                      required
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="text"
                      name="model"
                      placeholder="Modelo"
                      value={formData.model}
                      onChange={handleChange}
                      required
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <select
                      name="vehicleType"
                      value={formData.vehicleType}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="">Tipo de vehículo</option>
                      {vehicleTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        name="year"
                        placeholder="Año"
                        value={formData.year}
                        onChange={handleChange}
                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                      />
                      <select
                        name="month"
                        value={formData.month}
                        onChange={handleChange}
                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {new Date(0, m - 1).toLocaleString("es-ES", { month: "long" })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select
                      name="platform"
                      value={formData.platform}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="">Plataforma</option>
                      {platforms.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      type="url"
                      name="url"
                      placeholder="URL del anuncio"
                      value={formData.url}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="text"
                      name="location"
                      placeholder="Ubicación"
                      value={formData.location}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="text"
                      name="origin"
                      placeholder="País de origen"
                      value={formData.origin}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                  </div>
                </CollapsibleSection>
              </div>

              {/* Especificaciones Técnicas */}
              <div className={activeMobileTab === 'technical' ? 'block' : 'hidden lg:block'}>
                <CollapsibleSection
                  title="Especificaciones Técnicas"
                  id="technical"
                  expanded={expandedSection}
                  onToggle={setExpandedSection}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                      <select
                        name="color"
                        value={formData.color}
                        onChange={handleChange}
                        className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                      >
                        <option value="">Color</option>
                        {colors.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        name="doors"
                        value={formData.doors}
                        onChange={handleChange}
                        className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                      >
                        <option value="">Puertas</option>
                        {doorsOptions.map((d) => (
                          <option key={d} value={d}>
                            {d} puertas
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      name="motorType"
                      placeholder="Tipo de Motor (ej: V6, I4, Híbrido...)"
                      value={formData.motorType}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="text"
                      name="displacement"
                      placeholder="Cilindrada (cc)"
                      value={formData.displacement}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="text"
                      name="co2"
                      placeholder="Emisiones CO2 (g/km)"
                      value={formData.co2}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="number"
                      name="cv"
                      placeholder="Potencia (CV)"
                      value={formData.cv}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <input
                      type="number"
                      name="mileage"
                      placeholder="Kilometraje"
                      value={formData.mileage}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <select
                      name="fuelType"
                      value={formData.fuelType}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="">Combustible</option>
                      {fuelTypes.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <select
                      name="transmission"
                      value={formData.transmission}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="">Transmisión</option>
                      {transmissionTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      name="traction"
                      value={formData.traction}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="">Tracción</option>
                      {tractionTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      name="steering"
                      value={formData.steering}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      {steeringOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </CollapsibleSection>
              </div>

              {/* Estado e ITV */}
              <div className={activeMobileTab === 'itv' ? 'block' : 'hidden lg:block'}>
                <CollapsibleSection
                  title="Estado e ITV"
                  id="itv"
                  expanded={expandedSection}
                  onToggle={setExpandedSection}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      name="inspectionName"
                      placeholder="Nombre Inspección (ej: TÜV)"
                      value={formData.inspectionName}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <select
                      name="inspectionStatus"
                      value={formData.inspectionStatus}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="aprobada">Aprobada</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="caducada">Caducada</option>
                    </select>
                    <input
                      type="date"
                      name="inspectionExpiry"
                      placeholder="Fecha caducidad"
                      value={formData.inspectionExpiry}
                      onChange={handleChange}
                      className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                    <textarea
                      name="defects"
                      placeholder="Defectos o daños conocidos..."
                      value={formData.defects}
                      onChange={handleChange}
                      rows={3}
                      className="sm:col-span-2 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none"
                    />
                  </div>
                </CollapsibleSection>
              </div>

              {/* Precio y Costes */}
              <div className={activeMobileTab === 'pricing' ? 'block' : 'hidden lg:block'}>
                <CollapsibleSection
                  title="Precio y Costes"
                  id="pricing"
                  expanded={expandedSection}
                  onToggle={setExpandedSection}
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Precio Base</label>
                        <div className="relative">
                          <input
                            type="number"
                            name="price"
                            placeholder="0"
                            value={formData.price}
                            onChange={handleChange}
                            className="w-full pl-8 pr-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                          />
                          <span className="absolute left-3 top-2 text-muted-foreground">€</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Coste Transferencia</label>
                        <div className="relative">
                          <input
                            type="number"
                            name="transferCost"
                            placeholder="0"
                            value={formData.transferCost}
                            onChange={handleChange}
                            className="w-full pl-8 pr-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                          />
                          <span className="absolute left-3 top-2 text-muted-foreground">€</span>
                        </div>
                      </div>
                    </div>

                    {/* Lista de Gastos */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Gastos Adicionales</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <select
                          value={newExpense.type}
                          onChange={(e) => setNewExpense({ ...newExpense, type: e.target.value })}
                          className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          {expenseTypes.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          placeholder="€"
                          value={newExpense.amount}
                          onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                          className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                          type="button"
                          onClick={handleAddExpense}
                          className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>

                      {formData.expenses.length > 0 && (
                        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
                          {formData.expenses.map((expense) => (
                            <div key={expense.id} className="flex justify-between items-center text-sm p-1 hover:bg-muted/50 rounded">
                              <span>{expense.type}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{expense.amount}€</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExpense(expense.id)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Totales */}
                    <div className="bg-primary/5 p-4 rounded-lg space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Precio Base:</span>
                        <span>{Number(formData.price || 0).toLocaleString()}€</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gastos Totales:</span>
                        <span>{calculateTotalExpenses().toLocaleString()}€</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg pt-2 border-t border-primary/10">
                        <span>Precio Final:</span>
                        <span className="text-primary">{calculateFinalPrice().toLocaleString()}€</span>
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
              </div>

              {/* Equipamiento */}
              <div className={activeMobileTab === 'equipment' ? 'block' : 'hidden lg:block'}>
                <CollapsibleSection
                  title="Equipamiento"
                  id="equipment"
                  expanded={expandedSection}
                  onToggle={setExpandedSection}
                >
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Añadir equipamiento..."
                        value={formData.newEquipment}
                        onChange={(e) => setFormData({ ...formData, newEquipment: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddEquipment())}
                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddEquipment}
                        className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.equipment.map((item) => (
                        <span
                          key={item}
                          className="px-2 py-1 bg-secondary/50 text-secondary-foreground rounded-md text-sm flex items-center gap-1"
                        >
                          {item}
                          <button onClick={() => handleRemoveEquipment(item)} className="hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>
              </div>

              {/* Etiquetas y Notas */}
              <div className={activeMobileTab === 'tags' ? 'block' : 'hidden lg:block'}>
                <CollapsibleSection
                  title="Etiquetas y Notas"
                  id="tags"
                  expanded={expandedSection}
                  onToggle={setExpandedSection}
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Etiquetas</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nueva etiqueta..."
                          value={formData.newTag}
                          onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                          className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleAddTag}
                          className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formData.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-accent/20 text-accent rounded-md text-sm flex items-center gap-1"
                          >
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Notas Privadas</label>
                      <textarea
                        name="notes"
                        placeholder="Notas internas sobre el coche..."
                        value={formData.notes}
                        onChange={handleChange}
                        rows={4}
                        className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none"
                      />
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background rounded-b-lg flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => document.getElementById('car-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            {initialData ? "Guardar Cambios" : "Añadir Coche"}
          </button>
        </div>
      </div>
    </div>
  )
}

function CollapsibleSection({
  title,
  id,
  expanded,
  onToggle,
  children,
}: {
  title: string
  id: string
  expanded: string | null
  onToggle: (id: string | null) => void
  children: React.ReactNode
}) {
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
        {title}
      </h3>
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {children}
      </div>
    </div>
  )
}
