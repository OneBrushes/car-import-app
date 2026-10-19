"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
                checked,
                note: prev[item]?.note || ""
            }
        }))
    }

    const handleNote = (item: string, note: string) => {
        setChecklistData(prev => ({
            ...prev,
            [item]: {
                checked: prev[item]?.checked || false,
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
        return (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
            </div>
        )
    }

    const progress = calculateProgress()

    return (
        <div className="space-y-6 animate-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight mb-1">Checklist de inspección</h2>
                    <p className="text-muted-foreground">Verifica el estado de los vehículos importados.</p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
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
                        <Button onClick={saveChecklist} disabled={saving} className="shrink-0">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar
                        </Button>
                    )}
                </div>
            </div>

            {selectedCarId ? (
                <>
                    <div className="rounded-xl border bg-card p-5 shadow-xs">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${progress === 100 ? "bg-success/10" : "bg-primary/10"}`}>
                                    <CheckCircle2 className={`h-4 w-4 ${progress === 100 ? "text-success" : "text-primary"}`} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Progreso de inspección</p>
                                    <p className="text-sm text-muted-foreground">
                                        {progress === 100 ? "Inspección completada" : `${progress}% completado`}
                                    </p>
                                </div>
                            </div>
                            <p className={`tabular text-2xl font-semibold tracking-tight ${progress === 100 ? "text-success" : "text-foreground"}`}>{progress}%</p>
                        </div>
                        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className={`h-full rounded-full transition-all ${progress === 100 ? "bg-success" : "bg-primary"}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        {Object.entries(CHECKLIST_SECTIONS).map(([key, section]) => {
                            const doneCount = section.items.filter((_, idx) => checklistData[`${key}-${idx}`]?.checked).length
                            return (
                            <section key={key} className="rounded-xl border bg-card p-5 shadow-xs">
                                <div className="mb-4 flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-semibold">{section.title}</h3>
                                    <span className="tabular text-xs text-muted-foreground">{doneCount}/{section.items.length}</span>
                                </div>
                                <div className="space-y-3">
                                    {section.items.map((item, idx) => {
                                        const itemKey = `${key}-${idx}`
                                        const isChecked = checklistData[itemKey]?.checked || false
                                        const note = checklistData[itemKey]?.note || ""

                                        return (
                                            <div key={idx} className="pb-3 border-b last:border-0 last:pb-0">
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        id={itemKey}
                                                        checked={isChecked}
                                                        onCheckedChange={(checked) => handleCheck(itemKey, checked as boolean)}
                                                        className="mt-0.5 h-5 w-5"
                                                    />
                                                    <div className="grid w-full gap-2">
                                                        <label
                                                            htmlFor={itemKey}
                                                            className={`cursor-pointer text-[13px] font-medium leading-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${isChecked ? "text-muted-foreground" : ""}`}
                                                        >
                                                            {item}
                                                        </label>

                                                        <Input
                                                            placeholder="Notas / observaciones…"
                                                            value={note}
                                                            onChange={(e) => handleNote(itemKey, e.target.value)}
                                                            className="h-8 text-xs"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </section>
                            )
                        })}
                    </div>
                </>
            ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium">Selecciona un coche para comenzar</h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">Elige un vehículo en el desplegable superior para ver su checklist.</p>
                </div>
            )}
        </div>
    )
}
