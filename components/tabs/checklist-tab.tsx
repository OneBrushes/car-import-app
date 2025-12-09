"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Loader2, Save, CheckCircle2, AlertCircle } from "lucide-react"

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

interface ChecklistData {
    [key: string]: {
        checked: boolean
        note: string
    }
}

export function ChecklistTab() {
    const [cars, setCars] = useState<any[]>([])
    const [selectedCarId, setSelectedCarId] = useState<string>("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [checklistData, setChecklistData] = useState<ChecklistData>({})

    useEffect(() => {
        fetchCars()
    }, [])

    useEffect(() => {
        if (selectedCarId) {
            loadChecklist(selectedCarId)
        } else {
            setChecklistData({})
        }
    }, [selectedCarId])

    const fetchCars = async () => {
        try {
            const { data, error } = await supabase
                .from('imported_cars')
                .select('id, brand, model, year')
                .order('created_at', { ascending: false })

            if (error) throw error
            setCars(data || [])
        } catch (error) {
            console.error("Error fetching cars:", error)
            toast.error("Error al cargar coches")
        } finally {
            setLoading(false)
        }
    }

    const loadChecklist = async (carId: string) => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('car_checklists')
                .select('data')
                .eq('car_id', carId)
                .single()

            if (error && error.code !== 'PGRST116') throw error // Ignorar error si no existe

            if (data) {
                setChecklistData(data.data)
            } else {
                setChecklistData({})
            }
        } catch (error) {
            console.error("Error loading checklist:", error)
            toast.error("Error al cargar checklist")
        } finally {
            setLoading(false)
        }
    }

    const handleCheck = (item: string, checked: boolean) => {
        setChecklistData(prev => ({
            ...prev,
            [item]: {
                ...prev[item],
                checked
            }
        }))
    }

    const handleNote = (item: string, note: string) => {
        setChecklistData(prev => ({
            ...prev,
            [item]: {
                ...prev[item],
                note
            }
        }))
    }

    const saveChecklist = async () => {
        if (!selectedCarId) return

        setSaving(true)
        try {
            // Usar upsert para manejar crear/actualizar automáticamente
            // Requiere que car_id tenga restricción UNIQUE en la DB
            const { error } = await supabase
                .from('car_checklists')
                .upsert({
                    car_id: selectedCarId,
                    data: checklistData,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'car_id' })

            if (error) throw error

            toast.success("Checklist guardado correctamente")
        } catch (error) {
            console.error("Error saving checklist:", error)
            toast.error("Error al guardar checklist. Asegúrate de ejecutar el script fix_checklist.sql")
        } finally {
            setSaving(false)
        }
    }

    const calculateProgress = () => {
        let total = 0
        let checked = 0

        Object.entries(CHECKLIST_SECTIONS).forEach(([key, section]) => {
            section.items.forEach((_, idx) => {
                total++
                const itemKey = `${key}-${idx}`
                if (checklistData[itemKey]?.checked) {
                    checked++
                }
            })
        })

        if (total === 0) return 0
        return Math.round((checked / total) * 100)
    }

    if (loading && cars.length === 0) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Checklist de Inspección</h2>
                    <p className="text-muted-foreground">Verifica el estado de los vehículos importados.</p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Select value={selectedCarId} onValueChange={setSelectedCarId}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="Seleccionar coche..." />
                        </SelectTrigger>
                        <SelectContent>
                            {cars.map(car => (
                                <SelectItem key={car.id} value={car.id}>
                                    {car.brand} {car.model} ({car.year})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {selectedCarId && (
                        <Button onClick={saveChecklist} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Guardar
                        </Button>
                    )}
                </div>
            </div>

            {selectedCarId ? (
                <>
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-full">
                                    <CheckCircle2 className="w-8 h-8 text-primary" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold">Progreso de Inspección</p>
                                    <p className="text-sm text-muted-foreground">{calculateProgress()}% completado</p>
                                </div>
                            </div>
                            <div className="text-3xl font-bold text-primary">{calculateProgress()}%</div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2">
                        {Object.entries(CHECKLIST_SECTIONS).map(([key, section]) => (
                            <Card key={key}>
                                <CardHeader>
                                    <CardTitle>{section.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {section.items.map((item, idx) => {
                                        const itemKey = `${key}-${idx}`
                                        const isChecked = checklistData[itemKey]?.checked || false
                                        const note = checklistData[itemKey]?.note || ""

                                        return (
                                            <div key={idx} className="space-y-2 pb-4 border-b last:border-0 last:pb-0">
                                                <div className="flex items-start space-x-2">
                                                    <Checkbox
                                                        id={itemKey}
                                                        checked={isChecked}
                                                        onCheckedChange={(checked) => handleCheck(itemKey, checked as boolean)}
                                                    />
                                                    <div className="grid gap-1.5 leading-none w-full">
                                                        <label
                                                            htmlFor={itemKey}
                                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                        >
                                                            {item}
                                                        </label>

                                                        <Input
                                                            placeholder="Notas / Observaciones..."
                                                            value={note}
                                                            onChange={(e) => handleNote(itemKey, e.target.value)}
                                                            className="h-8 text-xs mt-1 bg-muted/50"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed rounded-xl bg-muted/30">
                    <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">Selecciona un coche para comenzar</h3>
                    <p className="text-sm text-muted-foreground mt-2">Elige un vehículo del desplegable superior para ver su checklist.</p>
                </div>
            )}
        </div>
    )
}
