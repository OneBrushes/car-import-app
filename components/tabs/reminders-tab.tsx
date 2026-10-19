"use client"

import { useState } from "react"
import { AlarmClock, BellRing, Check, Loader2, Plus, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { completeReminder, createReminder, deleteReminder, REMINDER_RULES, useReminders, type ReminderItem } from "@/lib/reminders"
import { OPEN_CAR_EVENT, type OpenCarDetail } from "@/components/command-palette"

const SEVERITY_STYLES: Record<ReminderItem["severity"], { dot: string; label: string }> = {
  overdue: { dot: "bg-destructive", label: "Vencido" },
  soon: { dot: "bg-warning", label: "Esta semana" },
  upcoming: { dot: "bg-muted-foreground/40", label: "Próximo" },
}

export function goToReminder(item: ReminderItem) {
  if (!item.tab) return
  window.dispatchEvent(new CustomEvent("changeTab", { detail: { tab: item.tab } }))
  if (item.carId && item.carTable) {
    setTimeout(() => window.dispatchEvent(new CustomEvent<OpenCarDetail>(OPEN_CAR_EVENT, { detail: { table: item.carTable!, id: item.carId! } })), 80)
  }
}

export function ReminderRow({ item, onDone, onDelete, compact = false }: {
  item: ReminderItem
  onDone?: (item: ReminderItem) => void
  onDelete?: (item: ReminderItem) => void
  compact?: boolean
}) {
  const style = SEVERITY_STYLES[item.severity]
  return (
    <li className="group flex items-start gap-3 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} title={style.label} />
      <button
        type="button"
        onClick={() => goToReminder(item)}
        disabled={!item.tab}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {item.kind === "auto" && <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Automático" />}
          <span className="truncate">{item.title}</span>
        </p>
        {!compact && item.detail && <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>}
      </button>
      <span className={`tabular shrink-0 text-xs ${item.severity === "overdue" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        {item.due.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
      </span>
      {item.kind === "custom" && (onDone || onDelete) && (
        <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {onDone && (
            <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground hover:bg-success/10 hover:text-success" onClick={() => onDone(item)} title="Hecho">
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(item)} title="Eliminar">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export function RemindersTab({ isActive = true }: { isActive?: boolean }) {
  const { user } = useAuth()
  const { items, loading, refresh } = useReminders(user?.id, isActive)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await createReminder({ title: title.trim(), due_date: dueDate, notes })
    setSaving(false)
    if (error) {
      toast.error("No se pudo crear: " + error.message)
      return
    }
    toast.success("Recordatorio creado")
    setOpen(false)
    setTitle("")
    setNotes("")
    refresh()
  }

  const done = async (item: ReminderItem) => {
    if (!item.id) return
    const { error } = await completeReminder(item.id)
    if (error) toast.error("No se pudo marcar como hecho")
    else refresh()
  }

  const remove = async (item: ReminderItem) => {
    if (!item.id) return
    const { error } = await deleteReminder(item.id)
    if (error) toast.error("No se pudo eliminar")
    else refresh()
  }

  const groups: { key: ReminderItem["severity"]; title: string }[] = [
    { key: "overdue", title: "Vencidos" },
    { key: "soon", title: "Esta semana" },
    { key: "upcoming", title: "Más adelante" },
  ]

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Recordatorios</h2>
          <p className="text-muted-foreground">Plazos de tus coches y avisos que te pongas tú</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo recordatorio</Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
          <BellRing className="mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="font-medium">Todo al día</p>
          <p className="mt-1 text-sm text-muted-foreground">No hay plazos pendientes.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {groups.map(group => {
            const groupItems = items.filter(i => i.severity === group.key)
            return (
              <section key={group.key} className="rounded-xl border bg-card p-5 shadow-xs">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLES[group.key].dot}`} />
                    {group.title}
                  </h3>
                  <span className="tabular text-xs text-muted-foreground">{groupItems.length}</span>
                </div>
                {groupItems.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nada aquí</p>
                ) : (
                  <ul className="divide-y">
                    {groupItems.map(item => <ReminderRow key={item.key} item={item} onDone={done} onDelete={remove} />)}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border bg-card p-4 text-xs text-muted-foreground shadow-xs">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p>
          Avisos automáticos: matriculación sin terminar a partir de {REMINDER_RULES.matriculationWarnDays} días desde la compra
          (vence a los {REMINDER_RULES.matriculationOverdueDays}), coches con más de {REMINDER_RULES.stockWarnDays} días en stock y
          ITV de coches de importación que caduca en menos de {REMINDER_RULES.itvWarnDays} días. Desaparecen solos cuando se resuelven.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo recordatorio</DialogTitle>
            <DialogDescription>Solo lo ves tú.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Qué hay que hacer</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Llamar al transportista" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Fecha</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Notas</Label>
              <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlarmClock className="h-4 w-4" />} Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Resumen para el dashboard: los 5 más urgentes */
export function RemindersWidget({ isActive = true }: { isActive?: boolean }) {
  const { user } = useAuth()
  const { items, loading } = useReminders(user?.id, isActive)
  const urgent = items.filter(i => i.severity !== "upcoming")
  if (loading || urgent.length === 0) return null

  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-primary" /> Pendiente
        </h3>
        <button
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => window.dispatchEvent(new CustomEvent("changeTab", { detail: { tab: "reminders" } }))}
        >
          Ver todo ({items.length})
        </button>
      </div>
      <ul className="divide-y">
        {urgent.slice(0, 5).map(item => <ReminderRow key={item.key} item={item} compact />)}
      </ul>
    </section>
  )
}
