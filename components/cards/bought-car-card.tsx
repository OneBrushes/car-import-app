"use client"

import { useState } from "react"
import { Plus, Trash2, ChevronDown, Paperclip, FileText, UserRound } from "lucide-react"
import { MATRICULATION_STEPS, matriculationProgress } from "@/lib/matriculation"
import { CarHistoryButton } from "@/components/car-history"

import { DocumentsModal, CarDocument } from "@/components/modals/documents-modal"
import { ClientPortalModal } from "@/components/modals/client-portal-modal"
import { ClientRouteUpdater } from "@/components/client-route-updater"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

interface BoughtCarCardProps {
  car: any
  onAddExpense: (expense: any) => void
  onRemoveExpense: (expenseId: string) => void
  onMarkAsSold: () => void
  onDelete: () => void
  onUpdateCar?: (carId: string, updates: any) => void
  onPrintInvoice?: () => void
}

export function BoughtCarCard({ car, onAddExpense, onRemoveExpense, onMarkAsSold, onDelete, onUpdateCar, onPrintInvoice }: BoughtCarCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDocsOpen, setIsDocsOpen] = useState(false)
  const [isPortalOpen, setIsPortalOpen] = useState(false)
  const [localDocs, setLocalDocs] = useState<CarDocument[]>(car.documents || [])
  const [checklist, setChecklist] = useState<Record<string, boolean>>(car.matriculation_checklist || {})
  const [newExpense, setNewExpense] = useState({
    concept: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "Precio del coche",
  })

  const safeInitialPrice = typeof car.initialPrice === "number" && !isNaN(car.initialPrice) ? car.initialPrice : 0
  const safeInitialExpenses =
    typeof car.initialExpenses === "number" && !isNaN(car.initialExpenses) ? car.initialExpenses : 0
  const safeAdditionalExpenses = (car.expenses || []).reduce((sum: number, e: any) => {
    const amount = typeof e.amount === "number" && !isNaN(e.amount) ? e.amount : 0
    return sum + amount
  }, 0)

  const totalInvested = safeInitialPrice + safeInitialExpenses + safeAdditionalExpenses

  // Coche de cliente: el cliente paga el coche; lo tuyo son los honorarios
  const isClientCar = Boolean(car.client_name)
  const [fee, setFee] = useState<string>(car.client_fee != null ? String(car.client_fee) : "")
  const [savingFee, setSavingFee] = useState(false)
  const [delivered, setDelivered] = useState<boolean>(car.logistic_status === "delivered")
  const saveFee = async () => {
    const value = fee.trim() === "" ? null : Number(fee)
    if (value != null && (!Number.isFinite(value) || value < 0)) { toast.error("Importe no válido"); return }
    setSavingFee(true)
    const { error } = await supabase.from("inventory_cars").update({ client_fee: value }).eq("id", car.id)
    setSavingFee(false)
    if (error) { toast.error(/client_fee/.test(error.message) ? "Falta ejecutar supabase/2026-10_coches_de_cliente.sql en Supabase" : error.message); return }
    toast.success("Honorarios guardados")
  }
  const markDelivered = async () => {
    const { error } = await supabase.from("inventory_cars").update({ logistic_status: "delivered", delivered_at: new Date().toISOString() }).eq("id", car.id)
    if (error) { toast.error(/delivered_at/.test(error.message) ? "Falta ejecutar supabase/2026-10_coches_de_cliente.sql en Supabase" : error.message); return }
    setDelivered(true)
    toast.success(`Entregado. ${car.client_name} ya lo ve como entregado y puede dejar su opinión.`)
  }

  const profit = car.sellPrice
    ? (typeof car.sellPrice === "number" && !isNaN(car.sellPrice) ? car.sellPrice : 0) - totalInvested
    : 0
  const profitPercentage = car.sellPrice && totalInvested > 0 ? (profit / totalInvested) * 100 : 0
  const daysInInventory = car.dateSold
    ? Math.floor((new Date(car.dateSold).getTime() - new Date(car.datePurchased).getTime()) / (1000 * 60 * 60 * 24))
    : Math.floor((new Date().getTime() - new Date(car.datePurchased).getTime()) / (1000 * 60 * 60 * 24))

  const handleAddExpense = () => {
    if (newExpense.concept && newExpense.amount) {
      onAddExpense({
        ...newExpense,
        amount: Number.parseFloat(newExpense.amount),
      })
      setNewExpense({
        concept: "",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        category: "Precio del coche",
      })
    }
  }

  const expenseCategories = [
    "Precio del coche",
    "Transporte",
    "ITV",
    "Trámites",
    "Reparación",
    "Mantenimiento",
    "Seguro",
    "Impuestos",
    "Otro"
  ]

  const matriculationSteps = MATRICULATION_STEPS

  const handleChecklistChange = async (stepId: string, checked: boolean) => {
    const newChecklist = { ...checklist, [stepId]: checked }
    setChecklist(newChecklist)

    try {
      const { error } = await supabase
        .from('inventory_cars')
        .update({ matriculation_checklist: newChecklist })
        .eq('id', car.id)
      
      if (error) throw error
      if (onUpdateCar) onUpdateCar(car.id, { matriculation_checklist: newChecklist })
      
    } catch (err) {
      console.error(err)
      toast.error("Error al actualizar la checklist")
      setChecklist(checklist) // revert local
    }
  }

  const checklistProgress = matriculationProgress(checklist)
  const eur = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'

  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-xs">
      {/* Header */}
      <div className="p-4 flex items-start justify-between border-b">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold truncate">
              {car.brand} {car.model}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${car.status === "inventory" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
                }`}
            >
              {isClientCar ? (delivered ? "Entregado" : "Coche de cliente") : car.status === "inventory" ? "En inventario" : "Vendido"}
            </span>
            {isClientCar && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">{car.client_name}</span>
            )}
            {car.invoice_number && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">{car.invoice_number}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular">{[car.year, car.plate].filter(Boolean).join(" · ")}</p>
        </div>

        <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-accent rounded-md transition-colors" aria-label={isExpanded ? "Contraer" : "Expandir"}>
          <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Resumen */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b text-sm">
        {isClientCar ? (
          <>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Pagado por cuenta del cliente</p>
              <p className="font-semibold tabular">{eur(totalInvested)}</p>
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className="text-muted-foreground text-xs mb-1">Mis honorarios por este coche</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveFee() }}
                  placeholder="0"
                  className="w-32 rounded-md border bg-background px-2.5 py-1.5 text-sm tabular outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground">€</span>
                <button onClick={saveFee} disabled={savingFee || fee === (car.client_fee != null ? String(car.client_fee) : "")}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  Guardar
                </button>
                <span className="text-xs text-muted-foreground">Es tu beneficio: el coche lo paga el cliente.</span>
              </div>
            </div>
          </>
        ) : (
        <div>
          <p className="text-muted-foreground text-xs mb-1">Inversión total</p>
          <p className="font-semibold tabular">{eur(totalInvested)}</p>
        </div>
        )}
        {car.status === "sold" && (
          <>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Precio de venta</p>
              <p className="font-semibold tabular">{eur(car.sellPrice || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Beneficio</p>
              <p className={`font-semibold tabular ${profit > 0 ? "text-success" : "text-destructive"}`}>
                {profit > 0 ? "+" : ""}
                {eur(profit)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Rentabilidad</p>
              <p className={`font-semibold tabular ${profitPercentage > 0 ? "text-success" : "text-destructive"}`}>
                {profitPercentage > 0 ? "+" : ""}
                {profitPercentage.toFixed(1)}%
              </p>
            </div>
          </>
        )}
      </div>

      <div className={`grid ${car.status === "sold" && onPrintInvoice ? "grid-cols-4" : "grid-cols-3"} text-sm border-b`}>
          <button onClick={() => setIsDocsOpen(true)} className="py-2.5 flex items-center justify-center gap-2 hover:bg-accent font-medium transition-colors border-r">
            <Paperclip className="h-4 w-4 text-muted-foreground" /> Documentos ({localDocs.length})
          </button>

          <button onClick={() => setIsPortalOpen(true)} className="py-2.5 flex items-center justify-center gap-2 hover:bg-accent font-medium transition-colors border-r" title="Lo que ve el cliente en la web: estado, ubicación, fotos y documentos">
            <UserRound className="h-4 w-4 text-muted-foreground" /> Área cliente
          </button>

          <div className="py-2.5 flex items-center justify-center gap-2 font-medium text-muted-foreground relative" title="Progreso de matriculación">
            <div className="w-full max-w-[100px] h-1.5 bg-muted rounded-full overflow-hidden">
               <div className="h-full bg-primary transition-all" style={{ width: `${checklistProgress}%` }}></div>
            </div>
            <span className="text-xs tabular">{checklistProgress}%</span>
          </div>

          {car.status === "sold" && onPrintInvoice && (
            <button onClick={onPrintInvoice} className="py-2.5 flex items-center justify-center gap-2 hover:bg-accent font-medium transition-colors border-l">
              <FileText className="h-4 w-4 text-muted-foreground" /> {car.invoice_number ? "Ver factura" : "Facturar"}
            </button>
          )}
      </div>

      {/* Contenido expandible */}
      {isExpanded && (
        <div className="p-4 space-y-6">

          {/* Checklist Matriculación (Solo visible si no está vendido)*/}
          {car.status !== "sold" && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">Trámites de matriculación en España</h4>
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full tabular">{checklistProgress}%</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                 {matriculationSteps.map(step => (
                    <label key={step.id} className="flex items-center gap-2 p-2 hover:bg-accent rounded-md cursor-pointer transition-colors border border-transparent hover:border-border">
                       <input 
                         type="checkbox" 
                         checked={!!checklist[step.id]} 
                         onChange={(e) => handleChecklistChange(step.id, e.target.checked)}
                         className="w-4 h-4 rounded accent-[var(--primary)]"
                       />
                       <span className={checklist[step.id] ? "line-through text-muted-foreground" : "text-foreground"}>{step.label}</span>
                    </label>
                 ))}
              </div>
            </div>
          )}

          {/* Por dónde va (para el cliente que sigue el coche en la web) */}
          {car.status !== "sold" && !delivered && <ClientRouteUpdater carId={car.id} />}

          {/* Desglose de inversión */}
          <div>
            <h4 className="font-semibold mb-3">{isClientCar ? "Pagos por cuenta del cliente" : "Desglose de Inversión"}</h4>
            <div className="space-y-2 text-sm">
              {car.expenses.length === 0 && (
                <p className="text-muted-foreground text-sm italic">
                  {isClientCar ? "Aún no hay pagos. Apunta aquí lo que pagas por cuenta del cliente (el coche, transporte, impuestos…)." : "No hay gastos registrados. Añade el precio del coche como primer gasto."}
                </p>
              )}
              {car.expenses.map((expense: any) => (
                <div key={expense.id} className="flex justify-between items-center">
                  <div className="flex-1">
                    <span className="text-muted-foreground">
                      {expense.concept}
                    </span>
                    <span className="text-xs text-muted-foreground/70 ml-2">
                      ({expense.category}) - {new Date(expense.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular">{eur(Number(expense.amount) || 0)}</span>
                    <button
                      onClick={() => onRemoveExpense(expense.id)}
                      className="p-1 hover:bg-destructive/10 text-destructive rounded text-xs"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Añadir gasto */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">{isClientCar ? "Añadir pago por cuenta del cliente" : "Añadir Gasto"}</h4>
            <input
              type="text"
              placeholder="Concepto"
              value={newExpense.concept}
              onChange={(e) => setNewExpense({ ...newExpense, concept: e.target.value })}
              className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="number"
                placeholder="Cantidad (€)"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                className="px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                className="px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <select
                value={newExpense.category}
                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                className="px-3 py-2 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {expenseCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddExpense}
              className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>

          {/* Datos de venta */}
          {car.status === "sold" && (
            <div>
              <h4 className="font-semibold mb-3">Información de Venta</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha de venta</span>
                  <span>{new Date(car.dateSold).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiempo en inventario</span>
                  <span>{daysInInventory} días</span>
                </div>
                {car.buyer && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comprador</span>
                    <span>{car.buyer}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex gap-2 pt-2">
            <CarHistoryButton
              label
              className="flex-1 h-auto py-2 border"
              inventoryId={car.id}
              importedId={car.imported_car_id}
              title={`${car.brand} ${car.model}${car.year ? ` (${car.year})` : ""}`}
            />
            {car.status === "inventory" && !isClientCar && (
              <button
                onClick={onMarkAsSold}
                className="flex-1 px-3 py-2 bg-success text-success-foreground rounded-lg hover:bg-success/90 transition-colors text-sm font-medium"
              >
                Marcar como vendido
              </button>
            )}
            {isClientCar && !delivered && (
              <button
                onClick={markDelivered}
                className="flex-1 px-3 py-2 bg-success text-success-foreground rounded-lg hover:bg-success/90 transition-colors text-sm font-medium"
              >
                Marcar como entregado
              </button>
            )}
            <button
              onClick={onDelete}
              className="flex-1 px-3 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors text-sm font-medium"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Modal Independiente de Documentos */}
      <ClientPortalModal isOpen={isPortalOpen} onClose={() => setIsPortalOpen(false)} car={car} />
      <DocumentsModal 
         isOpen={isDocsOpen} 
         onClose={() => setIsDocsOpen(false)} 
         carId={car.id} 
         carName={`${car.brand} ${car.model} (${car.year})`}
         documents={localDocs}
         onDocumentsUpdate={(newDocs) => {
            setLocalDocs(newDocs)
            if (onUpdateCar) onUpdateCar(car.id, { documents: newDocs })
         }}
      />
    </div>
  )
}
