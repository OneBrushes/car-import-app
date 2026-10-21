"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Save, CheckCircle2, AlertCircle, Camera, X } from "lucide-react"
import { CHECKLIST_SECTIONS, withLabels, type ChecklistData } from "@/lib/checklist"

export function ChecklistTab() {
    const [cars, setCars] = useState<any[]>([])
    const [selectedCarId, setSelectedCarId] = useState<string>("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [checklistData, setChecklistData] = useState<ChecklistData>({})
    const [uploadingItem, setUploadingItem] = useState<string | null>(null)

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
                checked,
                note: prev[item]?.note || ""
            }
        }))
    }

    const handleNote = (item: string, note: string) => {
        setChecklistData(prev => ({
            ...prev,
            [item]: {
                ...prev[item],
                checked: prev[item]?.checked || false,
                note
            }
        }))
    }

    /** Guarda en Supabase (con el texto y la sección de cada punto, para el área de clientes) */
    const persist = async (data: ChecklistData) => {
        const { error } = await supabase
            .from('car_checklists')
            .upsert({
                car_id: selectedCarId,
                data: withLabels(data),
                updated_at: new Date().toISOString()
            }, { onConflict: 'car_id' })
        if (error) throw error
    }

    /** Fotos de un punto: se suben a car-images/checklists/<coche>/ y se guardan al momento */
    const addPhotos = async (item: string, files: FileList | null) => {
        if (!files?.length || !selectedCarId) return
        setUploadingItem(item)
        try {
            const urls: string[] = []
            for (const file of Array.from(files)) {
                const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
                const path = `checklists/${selectedCarId}/${item}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
                const { error } = await supabase.storage.from('car-images').upload(path, file, { contentType: file.type || undefined })
                if (error) throw error
                urls.push(supabase.storage.from('car-images').getPublicUrl(path).data.publicUrl)
            }
            const next: ChecklistData = {
                ...checklistData,
                [item]: { ...checklistData[item], checked: checklistData[item]?.checked || false, note: checklistData[item]?.note || "", photos: [...(checklistData[item]?.photos || []), ...urls] }
            }
            setChecklistData(next)
            await persist(next)
            toast.success(urls.length === 1 ? "Foto añadida" : `${urls.length} fotos añadidas`)
        } catch (error) {
            console.error("Error uploading checklist photo:", error)
            toast.error("No se pudo subir la foto")
        } finally {
            setUploadingItem(null)
        }
    }

    const removePhoto = async (item: string, url: string) => {
        const next: ChecklistData = {
            ...checklistData,
            [item]: { ...checklistData[item], photos: (checklistData[item]?.photos || []).filter(u => u !== url) }
        }
        setChecklistData(next)
        try {
            await persist(next)
            const path = url.split('/car-images/')[1]
            if (path) await supabase.storage.from('car-images').remove([decodeURIComponent(path)])
        } catch (error) {
            console.error("Error removing checklist photo:", error)
            toast.error("No se pudo quitar la foto")
        }
    }

    const saveChecklist = async () => {
        if (!selectedCarId) return

        setSaving(true)
        try {
            // Usar upsert para manejar crear/actualizar automáticamente
            // Requiere que car_id tenga restricción UNIQUE en la DB
            await persist(checklistData)
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

                                                        <div className="flex gap-2">
                                                            <Input
                                                                placeholder="Notas / observaciones…"
                                                                value={note}
                                                                onChange={(e) => handleNote(itemKey, e.target.value)}
                                                                className="h-8 text-xs"
                                                            />
                                                            <label
                                                                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                                                title="Añadir fotos de este punto (las verá el cliente si tiene el coche asignado)"
                                                            >
                                                                {uploadingItem === itemKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                                                                <span className="hidden sm:inline">Foto</span>
                                                                <input type="file" accept="image/*" multiple hidden disabled={uploadingItem === itemKey}
                                                                    onChange={(e) => { addPhotos(itemKey, e.target.files); e.target.value = "" }} />
                                                            </label>
                                                        </div>
                                                        {(checklistData[itemKey]?.photos?.length ?? 0) > 0 && (
                                                            <div className="flex flex-wrap gap-2">
                                                                {checklistData[itemKey]!.photos!.map(url => (
                                                                    <div key={url} className="group relative h-14 w-20 overflow-hidden rounded-md border bg-muted">
                                                                        <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" className="h-full w-full object-cover" /></a>
                                                                        <button type="button" onClick={() => removePhoto(itemKey, url)} title="Quitar foto"
                                                                            className="absolute right-0.5 top-0.5 hidden rounded-full bg-background/90 p-0.5 text-destructive shadow group-hover:block">
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
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
