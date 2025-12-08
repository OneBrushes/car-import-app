"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, TrendingUp, TrendingDown, Minus, Loader2, Trash2, Edit, BarChart3 } from "lucide-react"
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

        if (role !== 'admin') {
            toast.error("Solo administradores pueden añadir coches")
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
        if (role !== 'admin') return

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
        if (role !== 'admin') return

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
        if (margin >= 30) return <Badge className="bg-green-600"><TrendingUp className="w-3 h-3 mr-1" /> {margin.toFixed(1)}%</Badge>
        if (margin >= 15) return <Badge className="bg-yellow-600"><Minus className="w-3 h-3 mr-1" /> {margin.toFixed(1)}%</Badge>
        return <Badge variant="destructive"><TrendingDown className="w-3 h-3 mr-1" /> {margin.toFixed(1)}%</Badge>
    }

    const avgProfit = filteredCars.length > 0
        ? filteredCars.reduce((sum, c) => sum + c.profit_margin, 0) / filteredCars.length
        : 0

    // Datos para el gráfico (top 10 más rentables)
    const chartData = filteredCars.slice(0, 10)
    const maxProfit = Math.max(...chartData.map(c => c.profit_margin), 0)

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6 animate-in">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Coches</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{filteredCars.length}</div>
                        <p className="text-xs text-muted-foreground">de {cars.length} totales</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Rentabilidad Media</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgProfit.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">margen promedio</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Más Rentable</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        {filteredCars.length > 0 ? (
                            <>
                                <div className="text-lg font-bold">{filteredCars[0].brand} {filteredCars[0].model}</div>
                                <p className="text-xs text-muted-foreground">{filteredCars[0].profit_margin.toFixed(1)}% margen</p>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Sin datos</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Gráfico de Rentabilidad */}
            {chartData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Top 10 Más Rentables</CardTitle>
                        <CardDescription>Comparativa de márgenes de beneficio</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {chartData.map((car, index) => (
                                <div key={car.id} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">
                                            {index + 1}. {car.brand} {car.model} ({car.year_from})
                                        </span>
                                        <span className="text-muted-foreground">{car.profit_margin.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all ${car.profit_margin >= 30 ? 'bg-green-600' :
                                                    car.profit_margin >= 15 ? 'bg-yellow-600' : 'bg-red-600'
                                                }`}
                                            style={{ width: `${(car.profit_margin / maxProfit) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters and Add Button */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <CardTitle>Coches Rentables</CardTitle>
                            <CardDescription>Base de datos de rentabilidad por modelo</CardDescription>
                        </div>
                        {role === 'admin' && (
                            <Button onClick={() => { resetForm(); setEditingCar(null); setIsModalOpen(true) }}>
                                <Plus className="w-4 h-4 mr-2" /> Añadir Coche
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filtros */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label>País</Label>
                            <Select value={filterCountry} onValueChange={setFilterCountry}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    {COUNTRIES.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>Marca</Label>
                            <Input
                                placeholder="Buscar marca..."
                                value={filterBrand}
                                onChange={(e) => setFilterBrand(e.target.value)}
                            />
                        </div>

                        <div>
                            <Label>Modelo</Label>
                            <Input
                                placeholder="Buscar modelo..."
                                value={filterModel}
                                onChange={(e) => setFilterModel(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Tabla */}
                    <div className="overflow-x-auto">
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
                                    <TableHead className="text-right">Precio Final</TableHead>
                                    <TableHead className="text-right">Precio España</TableHead>
                                    <TableHead>Rentabilidad</TableHead>
                                    {role === 'admin' && <TableHead>Acciones</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCars.map((car) => (
                                    <TableRow key={car.id}>
                                        <TableCell className="whitespace-nowrap">{car.country}</TableCell>
                                        <TableCell className="font-medium">{car.brand}</TableCell>
                                        <TableCell>{car.model}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {car.year_from}{car.year_to ? ` - ${car.year_to}` : '+'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{car.motor_type}</TableCell>
                                        <TableCell className="text-sm">{car.avg_mileage ? `${car.avg_mileage.toLocaleString()} km` : '-'}</TableCell>
                                        <TableCell className="text-sm">{car.avg_cv || '-'}</TableCell>
                                        <TableCell className="text-sm">{car.transmission || '-'}</TableCell>
                                        <TableCell className="text-right">{car.avg_import_cost.toLocaleString()}€</TableCell>
                                        <TableCell className="text-right">{car.avg_spain_price.toLocaleString()}€</TableCell>
                                        <TableCell>{getProfitBadge(car.profit_margin)}</TableCell>
                                        {role === 'admin' && (
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(car)}>
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(car.id)}>
                                                        <Trash2 className="w-4 h-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {filteredCars.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                No se encontraron coches con los filtros aplicados
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Modal Añadir/Editar */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingCar ? "Editar" : "Añadir"} Coche Rentable</DialogTitle>
                        <DialogDescription>
                            Datos de rentabilidad para análisis de importación
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>País *</Label>
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
                                <Label>Marca *</Label>
                                <Input
                                    value={formData.brand}
                                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label>Modelo *</Label>
                                <Input
                                    value={formData.model}
                                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label>Motor *</Label>
                                <Input
                                    placeholder="ej: 2.0 TDI"
                                    value={formData.motor_type}
                                    onChange={(e) => setFormData({ ...formData, motor_type: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label>Año Desde *</Label>
                                <Input
                                    type="number"
                                    value={formData.year_from}
                                    onChange={(e) => setFormData({ ...formData, year_from: Number(e.target.value) })}
                                    required
                                />
                            </div>

                            <div>
                                <Label>Año Hasta</Label>
                                <Input
                                    type="number"
                                    value={formData.year_to}
                                    onChange={(e) => setFormData({ ...formData, year_to: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <Label>Kilómetros (promedio)</Label>
                                <Input
                                    type="number"
                                    placeholder="ej: 150000"
                                    value={formData.avg_mileage}
                                    onChange={(e) => setFormData({ ...formData, avg_mileage: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label>CV (promedio)</Label>
                                <Input
                                    type="number"
                                    placeholder="ej: 150"
                                    value={formData.avg_cv}
                                    onChange={(e) => setFormData({ ...formData, avg_cv: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label>Transmisión</Label>
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
                                <Label>Precio Final Importado (€) *</Label>
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
                                <Label>Precio España (€) *</Label>
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
                            <Label>Notas</Label>
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
