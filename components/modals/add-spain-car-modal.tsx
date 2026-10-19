"use client"

import { useState, useEffect } from "react"

import type React from "react"
import { X, Plus, Car, Gauge, Tag, ImageIcon, StickyNote, ExternalLink } from "lucide-react"
import { ImageUpload } from "../image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ImportFromUrl, type ScrapedCar } from "@/components/import-from-url"
import { normaliseFuel, normaliseTransmission, normaliseColor } from "@/components/modals/add-car-modal"
import { cn } from "@/lib/utils"

interface AddSpainCarModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: any) => void
    initialData?: any
}

const vehicleTypes = ["Sedán", "SUV", "Deportivo", "Coupé", "Familiar", "Monovolumen", "Pickup"]
const fuelTypes = ["Gasolina", "Diésel", "Híbrido", "Eléctrico", "Gas"]
const transmissionTypes = ["Manual", "Automática", "Secuencial", "CVT"]
const equipmentLevels = ["Sin equipamiento", "Bajo", "Medio", "Alto"]

const MAX_IMAGES = 10

const selectClass =
    "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/** Lista de opciones + el valor actual si no está en ella (p. ej. un valor importado). */
const withCurrent = (options: readonly string[], current: string) =>
    current && !options.includes(current) ? [...options, current] : [...options]

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
            put("location", car.location)
            put("brand", car.brand)
            put("model", car.model)
            put("year", car.year)
            put("price", car.price != null ? String(car.price) : undefined)
            put("mileage", car.mileage != null ? String(car.mileage) : undefined)
            put("cv", car.cv != null ? String(car.cv) : undefined)
            put("fuelType", car.fuelType ? normaliseFuel(car.fuelType) : undefined)
            put("transmission", car.transmission ? normaliseTransmission(car.transmission) : undefined)
            put("color", car.color ? normaliseColor(car.color) : undefined)

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background w-full max-w-2xl rounded-xl border shadow-xl flex flex-col max-h-[92vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b">
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-tight">
                            {initialData ? "Editar coche de España" : "Añadir coche de referencia"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Coche a la venta en España para comparar precios
                        </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto bg-muted/30 px-4 sm:px-5 py-5 space-y-4">
                    <ImportFromUrl onImported={handleImported} className="bg-card" />

                    {/* Información Básica */}
                    <Section icon={Car} title="Información básica">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Marca" htmlFor="es-brand">
                                <Input
                                    id="es-brand"
                                    type="text"
                                    name="brand"
                                    placeholder="BMW"
                                    value={formData.brand}
                                    onChange={handleChange}
                                    required
                                />
                            </Field>
                            <Field label="Modelo" htmlFor="es-model">
                                <Input
                                    id="es-model"
                                    type="text"
                                    name="model"
                                    placeholder="M3 Competition"
                                    value={formData.model}
                                    onChange={handleChange}
                                    required
                                />
                            </Field>
                            <Field label="Año" htmlFor="es-year">
                                <Input
                                    id="es-year"
                                    type="number"
                                    name="year"
                                    placeholder="Año"
                                    value={formData.year}
                                    onChange={handleChange}
                                    className="tabular"
                                />
                            </Field>
                            <Field label="Color" htmlFor="es-color">
                                <Input
                                    id="es-color"
                                    type="text"
                                    name="color"
                                    placeholder="Negro"
                                    value={formData.color}
                                    onChange={handleChange}
                                />
                            </Field>
                            <Field label="Ubicación" htmlFor="es-location">
                                <Input
                                    id="es-location"
                                    type="text"
                                    name="location"
                                    placeholder="Ciudad, región"
                                    value={formData.location}
                                    onChange={handleChange}
                                />
                            </Field>
                            <Field label="URL del anuncio" htmlFor="es-url">
                                <Input
                                    id="es-url"
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
                        </div>
                    </Section>

                    {/* Especificaciones */}
                    <Section icon={Gauge} title="Precio y especificaciones">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Precio" htmlFor="es-price">
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                                    <Input
                                        id="es-price"
                                        type="number"
                                        name="price"
                                        placeholder="0"
                                        value={formData.price}
                                        onChange={handleChange}
                                        className="pl-8 tabular"
                                    />
                                </div>
                            </Field>
                            <Field label="Kilometraje (km)" htmlFor="es-mileage">
                                <Input
                                    id="es-mileage"
                                    type="number"
                                    name="mileage"
                                    placeholder="0"
                                    value={formData.mileage}
                                    onChange={handleChange}
                                    className="tabular"
                                />
                            </Field>
                            <Field label="Potencia (CV)" htmlFor="es-cv">
                                <Input
                                    id="es-cv"
                                    type="number"
                                    name="cv"
                                    placeholder="0"
                                    value={formData.cv}
                                    onChange={handleChange}
                                    className="tabular"
                                />
                            </Field>
                            <Field label="Combustible" htmlFor="es-fuel">
                                <select
                                    id="es-fuel"
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
                            <Field label="Transmisión" htmlFor="es-transmission">
                                <select
                                    id="es-transmission"
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
                            <Field label="Nivel de equipamiento" htmlFor="es-equipment">
                                <select
                                    id="es-equipment"
                                    name="equipmentLevel"
                                    value={formData.equipmentLevel || ""}
                                    onChange={handleChange}
                                    className={selectClass}
                                >
                                    <option value="">Selecciona…</option>
                                    {withCurrent(equipmentLevels, formData.equipmentLevel || "").map((level) => (
                                        <option key={level} value={level}>
                                            {level}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </Section>

                    {/* Etiquetas */}
                    <Section icon={Tag} title="Etiquetas">
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    aria-label="Nueva etiqueta"
                                    value={formData.newTag}
                                    onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                                    onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                                    placeholder="Añadir etiqueta…"
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
                    </Section>

                    {/* Fotos del coche */}
                    <Section icon={ImageIcon} title="Fotos del coche" description="La primera foto será la principal">
                        <ImageUpload images={formData.images} onImagesChange={handleImagesChange} />
                    </Section>

                    {/* Notas */}
                    <Section icon={StickyNote} title="Notas">
                        <Textarea
                            name="notes"
                            aria-label="Notas"
                            placeholder="Observaciones sobre este coche…"
                            value={formData.notes}
                            onChange={handleChange}
                            rows={3}
                            className="resize-none"
                        />
                    </Section>
                </form>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t bg-background px-4 sm:px-5 py-3">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={handleSubmit}>
                        {initialData ? "Guardar cambios" : "Añadir referencia"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function Section({
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
