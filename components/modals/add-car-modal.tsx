"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { X, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react"
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
// const motorTypes = ["V6", "V8", "I4", "V12", "Híbrido", "Eléctrico", "Diesel"] // Removed as per request
const fuelTypes = ["Gasolina", "Diésel", "Híbrido", "Eléctrico", "Gas"]
const transmissionTypes = ["Manual", "Automática", "Secuencial", "CVT"]
const tractionTypes = ["Delantera", "Trasera", "4x4", "AWD"]
const platforms = ["AutoScout24", "Mobile.de", "Coches.net", "Milanuncios", "Otro"]
const currencies = ["€", "£", "$", "CHF"]
const steeringOptions = ["Volante a la izquierda", "Volante a la derecha"]

export function AddCarModal({ isOpen, onClose, onSubmit, initialData }: AddCarModalProps) {
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
        ...initialData,
        month: initialData.month || 1,
        transferCost: initialData.transferCost || "",
        tags: initialData.tags || [],
        expenses: initialData.expenses || [],
        images: initialData.images || [],
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
    if (newExpense.amount) {
      setFormData((prev) => ({
        ...prev,
        expenses: [
          ...prev.expenses,
          {
            id: Date.now().toString(),
            ...newExpense,
            amount: Number.parseFloat(newExpense.amount),
          },
        ],
      }))
      setNewExpense({ type: expenseTypes[0], amount: "" })
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-background rounded-lg w-full max-w-2xl shadow-xl border border-border my-8">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 sm:p-6 border-b border-border bg-background">
          <h2 className="text-xl sm:text-2xl font-bold">{initialData ? "Editar Coche" : "Añadir Coche"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs móviles */}
        <div className="md:hidden flex gap-1 px-4 pt-4 border-b border-border overflow-x-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${expandedSection === section.id ? "bg-primary/10 text-primary" : "bg-secondary/50 text-muted-foreground"
                }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]"
        >
          {/* Información Básica */}
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
              <input
                type="text"
                name="color"
                placeholder="Color"
                value={formData.color}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <select
                name="doors"
                value={formData.doors}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              >
                <option value="">Puertas</option>
                {["2", "3", "4", "5"].map((d) => (
                  <option key={d} value={d}>
                    {d} puertas
                  </option>
                ))}
              </select>
            </div>
          </CollapsibleSection>

          {/* Especificaciones Técnicas */}
          <CollapsibleSection
            title="Especificaciones Técnicas"
            id="technical"
            expanded={expandedSection}
            onToggle={setExpandedSection}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                name="motorType"
                placeholder="Tipo de motor"
                value={formData.motorType}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <input
                type="number"
                name="displacement"
                placeholder="Cilindrada (cc)"
                value={formData.displacement}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <input
                type="number"
                name="co2"
                placeholder="CO2 (g/km)"
                value={formData.co2}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <input
                type="number"
                name="cv"
                placeholder="Caballos (CV)"
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
                <option value="">Volante</option>
                {steeringOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </CollapsibleSection>

          {/* ITV / Inspección */}
          <CollapsibleSection
            title="ITV / Inspección"
            id="itv"
            expanded={expandedSection}
            onToggle={setExpandedSection}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                name="inspectionName"
                placeholder="Nombre inspección"
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
                <option value="noAprobada">No aprobada</option>
              </select>
              <input
                type="date"
                name="inspectionExpiry"
                placeholder="Fecha expiración"
                value={formData.inspectionExpiry}
                onChange={handleChange}
                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
          </CollapsibleSection>

          {/* Precio y Gastos */}
          <CollapsibleSection
            title="Precio y Gastos"
            id="pricing"
            expanded={expandedSection}
            onToggle={setExpandedSection}
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="number"
                  name="price"
                  placeholder="Precio"
                  value={formData.price}
                  onChange={handleChange}
                  className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                >
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">Desglose de Gastos</h4>

                <div className="flex gap-2 items-center">
                  <span className="text-sm min-w-24">Transferencia:</span>
                  <input
                    type="number"
                    name="transferCost"
                    placeholder="Coste transferencia"
                    value={formData.transferCost}
                    onChange={handleChange}
                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="text-sm">€</span>
                </div>

                <div className="flex gap-2 flex-col sm:flex-row">
                  <select
                    value={newExpense.type}
                    onChange={(e) => setNewExpense({ ...newExpense, type: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                    className="w-full sm:w-24 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                  <div className="space-y-2">
                    {formData.expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between bg-background p-3 rounded-lg border border-border/50 text-sm"
                      >
                        <span>
                          {expense.type}: {expense.amount}€
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpense(expense.id)}
                          className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total Gastos:</span>
                    <span className="font-semibold">{calculateTotalExpenses()}€</span>
                  </div>
                  <div className="flex justify-between text-sm p-3 bg-primary/10 rounded-lg">
                    <span className="font-bold">Precio Final:</span>
                    <span className="text-lg font-bold text-primary">{calculateFinalPrice().toFixed(0)}€</span>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Equipamiento */}
          <CollapsibleSection
            title="Equipamiento"
            id="equipment"
            expanded={expandedSection}
            onToggle={setExpandedSection}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.newEquipment}
                  onChange={(e) => setFormData({ ...formData, newEquipment: e.target.value })}
                  onKeyPress={(e) => e.key === "Enter" && handleAddEquipment()}
                  placeholder="Añadir equipamiento (ej. Techo solar)..."
                  className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddEquipment}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {formData.equipment.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.equipment.map((item) => (
                    <span
                      key={item}
                      className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm flex items-center gap-2 border border-border"
                    >
                      {item}
                      <button type="button" onClick={() => handleRemoveEquipment(item)} className="hover:opacity-70">
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Etiquetas */}
          <CollapsibleSection title="Etiquetas" id="tags" expanded={expandedSection} onToggle={setExpandedSection}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.newTag}
                  onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                  onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                  placeholder="Añadir etiqueta..."
                  className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm flex items-center gap-2"
                    >
                      {tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:opacity-70">
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Fotos del coche */}
          <CollapsibleSection
            title="Fotos del Coche"
            id="photos"
            expanded={expandedSection}
            onToggle={setExpandedSection}
          >
            <ImageUpload images={formData.images} onImagesChange={handleImagesChange} />
          </CollapsibleSection>

          {/* Notas */}
          <CollapsibleSection title="Observaciones" id="notes" expanded={expandedSection} onToggle={setExpandedSection}>
            <div className="space-y-3">
              <textarea
                name="defects"
                placeholder="Desperfectos y detalles..."
                value={formData.defects}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <textarea
                name="notes"
                placeholder="Notas privadas..."
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
          </CollapsibleSection>
        </form>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 p-4 sm:p-6 border-t border-border bg-background">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm"
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
  const isExpanded = expanded === id

  return (
    <div className="md:block">
      <button
        type="button"
        onClick={() => onToggle(isExpanded ? null : id)}
        className="md:hidden w-full flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
      >
        <h3 className="font-semibold text-sm">{title}</h3>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <div className="hidden md:block">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      </div>

      {(isExpanded || window.innerWidth >= 768) && <div className={isExpanded ? "mt-3 md:mt-0" : ""}>{children}</div>}
    </div>
  )
}
