"use client"

import { useState } from "react"
import { Plus, Trash2, ChevronDown } from "lucide-react"

import { DocumentsModal, CarDocument } from "@/components/modals/documents-modal"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

interface BoughtCarCardProps {
  car: any
  onAddExpense: (expense: any) => void
  onRemoveExpense: (expenseId: string) => void
  onMarkAsSold: () => void
  onDelete: () => void
  onUpdateCar?: (carId: string, updates: any) => void
}

export function BoughtCarCard({ car, onAddExpense, onRemoveExpense, onMarkAsSold, onDelete, onUpdateCar }: BoughtCarCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDocsOpen, setIsDocsOpen] = useState(false)
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

  const matriculationSteps = [
    { id: "ficha_reducida", label: "Ficha Técnica Reducida (Ingenieros)" },
    { id: "itv", label: "ITV Pasada y Tarjeta Ficha Técnica Original" },
    { id: "hacienda", label: "Impuesto Especial (Mod 576) o Exención" },
    { id: "ayuntamiento", label: "Impuesto de Circulación (Ayto)" },
    { id: "dgt", label: "Tasas DGT y Matriculación" },
    { id: "placas", label: "Placas Físicas Fabricadas" },
  ]

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

  const checklistProgress = Math.round((Object.values(checklist).filter(v => v).length / matriculationSteps.length) * 100) || 0

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-start justify-between border-b border-border">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-bold">
              {car.brand} {car.model}
            </h3>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${car.status === "inventory" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                }`}
            >
              {car.status === "inventory" ? "En Inventario" : "Vendido"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{car.year}</p>
        </div>

        <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-secondary rounded transition-colors">
          <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Resumen */}
      <div className="p-4 bg-background/50 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border text-sm">
        <div>
          <p className="text-muted-foreground text-xs mb-1">Inversión Total</p>
          <p className="font-bold">{totalInvested.toFixed(2)}€</p>
        </div>
        {car.status === "sold" && (
          <>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Precio Venta</p>
              <p className="font-bold">{(car.sellPrice || 0).toFixed(2)}€</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Beneficio</p>
              <p className={`font-bold ${profit > 0 ? "text-accent" : "text-destructive"}`}>
                {profit > 0 ? "+" : ""}
                {profit.toFixed(2)}€
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Rentabilidad</p>
              <p className={`font-bold ${profitPercentage > 0 ? "text-accent" : "text-destructive"}`}>
                {profitPercentage > 0 ? "+" : ""}
                {profitPercentage.toFixed(1)}%
              </p>
            </div>
          </>
        )}
      </div>

      <div className="bg-muted/10 grid grid-cols-2 text-sm border-b border-border">
          <button onClick={() => setIsDocsOpen(true)} className="py-2.5 flex items-center justify-center gap-2 hover:bg-secondary/50 font-medium transition-colors border-r border-border">
            <span className="text-xl">📎</span> Documentos ({localDocs.length})
          </button>
          
          <div className="py-2.5 flex items-center justify-center gap-2 font-medium text-muted-foreground relative" title="Progreso de matriculación">
            <div className="w-full max-w-[100px] h-2.5 bg-border rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 transition-all" style={{ width: `${checklistProgress}%` }}></div>
            </div>
            <span className="text-xs">{checklistProgress}%</span>
          </div>
      </div>

      {/* Contenido expandible */}
      {isExpanded && (
        <div className="p-4 space-y-6">

          {/* Checklist Matriculación (Solo visible si no está vendido)*/}
          {car.status !== "sold" && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-blue-500 flex items-center gap-2">Trámites de Matriculación España</h4>
                <span className="text-xs font-semibold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full">{checklistProgress}%</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                 {matriculationSteps.map(step => (
                    <label key={step.id} className="flex items-center gap-2 p-2 hover:bg-background/50 rounded-md cursor-pointer transition-colors border border-transparent hover:border-border">
                       <input 
                         type="checkbox" 
                         checked={!!checklist[step.id]} 
                         onChange={(e) => handleChecklistChange(step.id, e.target.checked)}
                         className="w-4 h-4 rounded text-blue-500 bg-background border-border"
                       />
                       <span className={checklist[step.id] ? "line-through text-muted-foreground" : "text-foreground"}>{step.label}</span>
                    </label>
                 ))}
              </div>
            </div>
          )}

          {/* Desglose de inversión */}
          <div>
            <h4 className="font-semibold mb-3">Desglose de Inversión</h4>
            <div className="space-y-2 text-sm">
              {car.expenses.length === 0 && (
                <p className="text-muted-foreground text-sm italic">
                  No hay gastos registrados. Añade el precio del coche como primer gasto.
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
                    <span>{expense.amount}€</span>
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
          <div className="bg-background/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">Añadir Gasto</h4>
            <input
              type="text"
              placeholder="Concepto"
              value={newExpense.concept}
              onChange={(e) => setNewExpense({ ...newExpense, concept: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="number"
                placeholder="Cantidad (€)"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                className="px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                className="px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <select
                value={newExpense.category}
                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                className="px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
            {car.status === "inventory" && (
              <button
                onClick={onMarkAsSold}
                className="flex-1 px-3 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors text-sm font-medium"
              >
                Marcar como Vendido
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
