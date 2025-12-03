"use client"

import { useState, useEffect } from "react"

import type React from "react"
import { X, Plus } from "lucide-react"
import { ImageUpload } from "../image-upload"

interface AddSpainCarModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: any) => void
    initialData?: any
}

const vehicleTypes = ["Sedán", "SUV", "Deportivo", "Coupé", "Familiar", "Monovolumen", "Pickup"]
const fuelTypes = ["Gasolina", "Diésel", "Híbrido", "Eléctrico", "Gas"]
const transmissionTypes = ["Manual", "Automática", "Secuencial", "CVT"]

export function AddSpainCarModal({ isOpen, onClose, onSubmit, initialData }: AddSpainCarModalProps) {
    const [formData, setFormData] = useState({
        brand: "",
        model: "",
        year: new Date().getFullYear(),
        price: "",
        mileage: "",
        cv: "",
        location: "",
        color: "",
        fuelType: "",
        transmission: "",
        url: "",
        tags: [] as string[],
        newTag: "",
        notes: "",
        images: [] as string[],
        equipmentLevel: "",
    })

    // Load initial data when editing
    useEffect(() => {
        if (initialData) {
            setFormData({
                brand: initialData.brand || "",
                model: initialData.model || "",
                year: initialData.year || new Date().getFullYear(),
                price: initialData.price?.toString() || "",
                mileage: initialData.mileage?.toString() || "",
                cv: initialData.cv?.toString() || "",
                location: initialData.location || "",
                color: initialData.color || "",
                fuelType: initialData.fuelType || "",
                transmission: initialData.transmission || "",
                url: initialData.url || "",
                tags: initialData.tags || [],
                newTag: "",
                notes: initialData.notes || "",
                images: initialData.images || [],
                equipmentLevel: initialData.equipmentLevel || "",
            })
        } else {
            // Reset form when not editing
            setFormData({
                brand: "",
                model: "",
                year: new Date().getFullYear(),
                price: "",
                mileage: "",
                cv: "",
                location: "",
                color: "",
                fuelType: "",
                transmission: "",
                url: "",
                tags: [],
                newTag: "",
                notes: "",
                images: [],
                equipmentLevel: "",
            })
        }
    }, [initialData, isOpen])

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

    const handleImagesChange = (images: string[]) => {
        setFormData((prev) => ({
            ...prev,
            images,
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSubmit({
            ...formData,
            price: Number.parseFloat(formData.price),
            mileage: Number.parseInt(formData.mileage),
            cv: Number.parseInt(formData.cv),
        })
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-background rounded-lg w-full max-w-2xl shadow-xl border border-border my-8">
                {/* Header */}
                <div className="sticky top-0 flex items-center justify-between p-6 border-b border-border bg-background">
                    <h2 className="text-2xl font-bold">{initialData ? "Editar Coche de España" : "Añadir Coche de Referencia (España)"}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
                    {/* Información Básica */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4">Información Básica</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input
                                type="text"
                                name="brand"
                                placeholder="Marca"
                                value={formData.brand}
                                onChange={handleChange}
                                required
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="text"
                                name="model"
                                placeholder="Modelo"
                                value={formData.model}
                                onChange={handleChange}
                                required
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="number"
                                name="year"
                                placeholder="Año"
                                value={formData.year}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="url"
                                name="url"
                                placeholder="URL del anuncio"
                                value={formData.url}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="text"
                                name="location"
                                placeholder="Ubicación (ciudad, región)"
                                value={formData.location}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="text"
                                name="color"
                                placeholder="Color"
                                value={formData.color}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </section>

                    {/* Especificaciones */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4">Especificaciones</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input
                                type="number"
                                name="price"
                                placeholder="Precio"
                                value={formData.price}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="number"
                                name="mileage"
                                placeholder="Kilometraje"
                                value={formData.mileage}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <input
                                type="number"
                                name="cv"
                                placeholder="Caballos (CV)"
                                value={formData.cv}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <select
                                name="fuelType"
                                value={formData.fuelType}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="">Transmisión</option>
                                {transmissionTypes.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                            <select
                                name="equipmentLevel"
                                value={formData.equipmentLevel || ""}
                                onChange={handleChange}
                                className="px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="">Nivel de Equipamiento</option>
                                <option value="Sin equipamiento">Sin equipamiento</option>
                                <option value="Bajo">Bajo</option>
                                <option value="Medio">Medio</option>
                                <option value="Alto">Alto</option>
                            </select>
                        </div>
                    </section>

                    {/* Etiquetas */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4">Etiquetas</h3>
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={formData.newTag}
                                onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                                onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                                placeholder="Añadir etiqueta..."
                                className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                    </section>

                    {/* Fotos del coche */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4">Fotos del Coche</h3>
                        <ImageUpload images={formData.images} onImagesChange={handleImagesChange} />
                    </section>

                    {/* Notas */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4">Notas</h3>
                        <textarea
                            name="notes"
                            placeholder="Observaciones sobre este coche..."
                            value={formData.notes}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </section>
                </form>

                {/* Footer */}
                <div className="sticky bottom-0 flex gap-3 p-6 border-t border-border bg-background">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                    >
                        {initialData ? "Guardar Cambios" : "Añadir Referencia"}
                    </button>
                </div>
            </div>
        </div>
    )
}
