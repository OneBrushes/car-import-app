"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, TrendingUp, TrendingDown, Minus, Loader2, Trash2, Edit, BarChart3, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ProfitableCar {
    id: string
    country: string
    brand: string
    model: string
    year_from: number
    year_to: number | null
    motor_type: string
    avg_mileage: number | null
    avg_cv: number | null
    transmission: string | null
    avg_import_cost: number
    avg_spain_price: number
    profit_margin: number
    notes: string | null
    created_at: string
}

interface ProfitableCarModalProps {
    role: string
}

const COUNTRIES = [
    "Alemania", "Francia", "Italia", "Países Bajos", "Bélgica", "Austria",
    "Suiza", "Polonia", "República Checa", "Dinamarca", "Suecia", "Noruega",
    "Portugal", "Reino Unido", "Irlanda", "Luxemburgo", "Otros"
]

const TRANSMISSIONS = ["Manual", "Automático", "Semiautomático"]

export function ProfitableCars({ role }: ProfitableCarModalProps) {
    const [cars, setCars] = useState<ProfitableCar[]>([])
    const [filteredCars, setFilteredCars] = useState<ProfitableCar[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCar, setEditingCar] = useState<ProfitableCar | null>(null)

    // Filtros
    const [filterCountry, setFilterCountry] = useState<string>("all")
    const [filterBrand, setFilterBrand] = useState<string>("")
    const [filterModel, setFilterModel] = useState<string>("")

    // Form data
    const [formData, setFormData] = useState({
        country: "",
        brand: "",
        model: "",
        year_from: new Date().getFullYear() - 5,
        year_to: new Date().getFullYear(),
        motor_type: "",
        avg_mileage: "",
        avg_cv: "",
        transmission: "",
        avg_import_cost: "",
        avg_spain_price: "",
        notes: ""
    })

    useEffect(() => {
        fetchCars()
    }, [])

    useEffect(() => {
        applyFilters()
    }, [cars, filterCountry, filterBrand, filterModel])

    const fetchCars = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('profitable_cars')
                .select('*')
                .order('profit_margin', { ascending: false })

            if (error) throw error
            setCars(data || [])
        } catch (error) {
            console.error(error)
            toast.error("Error al cargar datos")
        } finally {
            setLoading(false)
        }
    }

    const applyFilters = () => {
        let filtered = [...cars]

        if (filterCountry !== "all") {
            filtered = filtered.filter(c => c.country === filterCountry)
        }

        if (filterBrand) {
            filtered = filtered.filter(c =>
                c.brand.toLowerCase().includes(filterBrand.toLowerCase())
            )
        }

        if (filterModel) {
            filtered = filtered.filter(c =>
                c.model.toLowerCase().includes(filterModel.toLowerCase())
            )
        }

        setFilteredCars(filtered)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (role !== 'admin' && role !== 'super_admin' && role !== 'moderador') {
            toast.error("No tienes permisos para añadir coches")
            return
        }

        try {
            const carData = {
                country: formData.country,
                brand: formData.brand,
                model: formData.model,
                year_from: formData.year_from,
                year_to: formData.year_to || null,
                motor_type: formData.motor_type,
                avg_mileage: formData.avg_mileage ? Number(formData.avg_mileage) : null,
                avg_cv: formData.avg_cv ? Number(formData.avg_cv) : null,
                transmission: formData.transmission || null,
                avg_import_cost: Number(formData.avg_import_cost),
                avg_spain_price: Number(formData.avg_spain_price),
                notes: formData.notes || null
            }

            if (editingCar) {
                const { error } = await supabase
                    .from('profitable_cars')
                    .update(carData)
                    .eq('id', editingCar.id)

                if (error) throw error
                toast.success("Coche actualizado")
            } else {
                const { error } = await supabase
                    .from('profitable_cars')
                    .insert(carData)

                if (error) throw error
                toast.success("Coche añadido")
            }

            setIsModalOpen(false)
            setEditingCar(null)
            resetForm()
            fetchCars()
        } catch (error: any) {
            console.error(error)
            toast.error("Error al guardar: " + error.message)
        }
    }

    const handleEdit = (car: ProfitableCar) => {
        if (role !== 'admin' && role !== 'super_admin' && role !== 'moderador') return

        setEditingCar(car)
        setFormData({
            country: car.country,
            brand: car.brand,
            model: car.model,
            year_from: car.year_from,
            year_to: car.year_to || new Date().getFullYear(),
            motor_type: car.motor_type,
            avg_mileage: car.avg_mileage?.toString() || "",
            avg_cv: car.avg_cv?.toString() || "",
            transmission: car.transmission || "",
            avg_import_cost: car.avg_import_cost.toString(),
            avg_spain_price: car.avg_spain_price.toString(),
            notes: car.notes || ""
        })
        setIsModalOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (role !== 'admin' && role !== 'super_admin' && role !== 'moderador') return

        try {
            const { error } = await supabase
                .from('profitable_cars')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success("Coche eliminado")
            fetchCars()
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar")
        }
    }

    const resetForm = () => {
        setFormData({
            country: "",
            brand: "",
            model: "",
            year_from: new Date().getFullYear() - 5,
            year_to: new Date().getFullYear(),
            motor_type: "",
            avg_mileage: "",
            avg_cv: "",
            transmission: "",
            avg_import_cost: "",
            avg_spain_price: "",
            notes: ""
        })
    }

    const getProfitBadge = (margin: number) => {
        if (margin >= 30) return <Badge className="tabular border-transparent bg-success/10 text-success"><TrendingUp className="w-3 h-3" /> {margin.toFixed(1)}%</Badge>
        if (margin >= 15) return <Badge className="tabular border-transparent bg-warning/10 text-warning"><Minus className="w-3 h-3" /> {margin.toFixed(1)}%</Badge>
        return <Badge className="tabular border-transparent bg-destructive/10 text-destructive"><TrendingDown className="w-3 h-3" /> {margin.toFixed(1)}%</Badge>
    }

    const avgProfit = filteredCars.length > 0
        ? filteredCars.reduce((sum, c) => sum + c.profit_margin, 0) / filteredCars.length
        : 0

    // Datos para el gráfico (top 10 más rentables)
    const chartData = filteredCars.slice(0, 10)
    const maxProfit = Math.max(...chartData.map(c => c.profit_margin), 0)

    if (loading) {
        return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    }

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight mb-1">Coches rentables</h2>
                    <p className="text-muted-foreground">Base de datos de rentabilidad por modelo</p>
                </div>
                {(role === 'super_admin' || role === 'admin' || role === 'moderador') && (
                    <Button onClick={() => { resetForm(); setEditingCar(null); setIsModalOpen(true) }}>
                        <Plus className="w-4 h-4" /> Añadir coche
                    </Button>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-card p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total coches</p>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <BarChart3 className="h-4 w-4 text-primary" />
                        </div>
                    </div>
                    <p className="tabular text-2xl font-semibold tracking-tight">{filteredCars.length}</p>
                    <p className="tabular text-xs text-muted-foreground">de {cars.length} totales</p>
                </div>

                <div className="rounded-xl border bg-card p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rentabilidad media</p>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </div>
                    </div>
                    <p className="tabular text-2xl font-semibold tracking-tight">{avgProfit.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">margen promedio</p>
                </div>

                <div className="rounded-xl border bg-card p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Más rentable</p>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
                            <TrendingUp className="h-4 w-4 text-success" />
                        </div>
                    </div>
                    {filteredCars.length > 0 ? (
                        <>
                            <p className="truncate text-lg font-semibold tracking-tight">{filteredCars[0].brand} {filteredCars[0].model}</p>
                            <p className="tabular text-xs text-success">{filteredCars[0].profit_margin.toFixed(1)}% margen</p>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">Sin datos</p>
                    )}
                </div>
            </div>

            {/* Gráfico de Rentabilidad */}
            {chartData.length > 0 && (
                <div className="rounded-xl border bg-card p-5 shadow-xs">
                    <div className="mb-4">
                        <h3 className="font-semibold">Top 10 más rentables</h3>
                        <p className="text-sm text-muted-foreground">Comparativa de márgenes de beneficio</p>
                    </div>
                    <div className="space-y-3">
                        {chartData.map((car, index) => (
                            <div key={car.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-[13px]">
                                    <span className="truncate font-medium">
                                        <span className="tabular text-muted-foreground">{index + 1}.</span> {car.brand} {car.model} <span className="tabular text-muted-foreground">({car.year_from})</span>
                                    </span>
                                    <span className="tabular shrink-0 text-muted-foreground">{car.profit_margin.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${car.profit_margin >= 30 ? 'bg-success' :
                                            car.profit_margin >= 15 ? 'bg-warning' : 'bg-destructive'
                                            }`}
                                        style={{ width: `${(car.profit_margin / maxProfit) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
                <Select value={filterCountry} onValueChange={setFilterCountry}>
                    <SelectTrigger className="w-full sm:w-44" aria-label="País">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los países</SelectItem>
                        {COUNTRIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar marca..."
                        value={filterBrand}
                        onChange={(e) => setFilterBrand(e.target.value)}
                        className="pl-9"
                        aria-label="Marca"
                    />
                </div>
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar modelo..."
                        value={filterModel}
                        onChange={(e) => setFilterModel(e.target.value)}
                        className="pl-9"
                        aria-label="Modelo"
                    />
                </div>
            </div>

            {/* Tabla */}
            {filteredCars.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {cars.length === 0 ? "Todavía no hay coches rentables registrados" : "No se encontraron coches con los filtros aplicados"}
                    </p>
                    {cars.length === 0 && (role === 'super_admin' || role === 'admin' || role === 'moderador') && (
                        <Button size="sm" className="mt-4" onClick={() => { resetForm(); setEditingCar(null); setIsModalOpen(true) }}>
                            <Plus className="w-4 h-4" /> Añadir coche
                        </Button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>País</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Modelo</TableHead>
                                <TableHead>Años</TableHead>
                                <TableHead>Motor</TableHead>
                                <TableHead>KM</TableHead>
                                <TableHead>CV</TableHead>
                                <TableHead>Trans.</TableHead>
                                <TableHead className="text-right">Precio final</TableHead>
                                <TableHead className="text-right">Precio España</TableHead>
                                <TableHead>Rentabilidad</TableHead>
                                {(role === 'super_admin' || role === 'admin' || role === 'moderador') && <TableHead className="text-right">Acciones</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCars.map((car) => (
                                <TableRow key={car.id}>
                                    <TableCell className="whitespace-nowrap">{car.country}</TableCell>
                                    <TableCell className="font-medium">{car.brand}</TableCell>
                                    <TableCell>{car.model}</TableCell>
                                    <TableCell className="tabular whitespace-nowrap">
                                        {car.year_from}{car.year_to ? ` - ${car.year_to}` : '+'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{car.motor_type}</TableCell>
                                    <TableCell className="tabular whitespace-nowrap text-sm">{car.avg_mileage ? `${car.avg_mileage.toLocaleString('es-ES')} km` : '-'}</TableCell>
                                    <TableCell className="tabular text-sm">{car.avg_cv || '-'}</TableCell>
                                    <TableCell className="text-sm">{car.transmission || '-'}</TableCell>
                                    <TableCell className="tabular whitespace-nowrap text-right">{car.avg_import_cost.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</TableCell>
                                    <TableCell className="tabular whitespace-nowrap text-right">{car.avg_spain_price.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</TableCell>
                                    <TableCell>{getProfitBadge(car.profit_margin)}</TableCell>
                                    {(role === 'super_admin' || role === 'admin' || role === 'moderador') && (
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
                                                    onClick={() => handleEdit(car)}
                                                    title="Editar"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDelete(car.id)}
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Modal Añadir/Editar */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingCar ? "Editar" : "Añadir"} coche rentable</DialogTitle>
                        <DialogDescription>
                            Datos de rentabilidad para análisis de importación
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-[13px]">País *</Label>
                                <Select value={formData.country} onValueChange={(val) => setFormData({ ...formData, country: val })} required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COUNTRIES.map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-[13px]">Marca *</Label>
                                <Input
                                    value={formData.brand}
                                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Modelo *</Label>
                                <Input
                                    value={formData.model}
                                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Motor *</Label>
                                <Input
                                    placeholder="ej: 2.0 TDI"
                                    value={formData.motor_type}
                                    onChange={(e) => setFormData({ ...formData, motor_type: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Año Desde *</Label>
                                <Input
                                    type="number"
                                    value={formData.year_from}
                                    onChange={(e) => setFormData({ ...formData, year_from: Number(e.target.value) })}
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Año Hasta</Label>
                                <Input
                                    type="number"
                                    value={formData.year_to}
                                    onChange={(e) => setFormData({ ...formData, year_to: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Kilómetros (promedio)</Label>
                                <Input
                                    type="number"
                                    placeholder="ej: 150000"
                                    value={formData.avg_mileage}
                                    onChange={(e) => setFormData({ ...formData, avg_mileage: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">CV (promedio)</Label>
                                <Input
                                    type="number"
                                    placeholder="ej: 150"
                                    value={formData.avg_cv}
                                    onChange={(e) => setFormData({ ...formData, avg_cv: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Transmisión</Label>
                                <Select value={formData.transmission} onValueChange={(val) => setFormData({ ...formData, transmission: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TRANSMISSIONS.map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-[13px]">Precio Final Importado (€) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Coste total del coche"
                                    value={formData.avg_import_cost}
                                    onChange={(e) => setFormData({ ...formData, avg_import_cost: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[13px]">Precio España (€) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.avg_spain_price}
                                    onChange={(e) => setFormData({ ...formData, avg_spain_price: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-[13px]">Notas</Label>
                            <Input
                                placeholder="Observaciones adicionales..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit">
                                {editingCar ? "Actualizar" : "Añadir"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
