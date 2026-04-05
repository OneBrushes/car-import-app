"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, ShieldAlert, Receipt, Calendar } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface GlobalExpense {
  id: string
  title: string
  amount: number
  date: string
  category: string
  created_at: string
}

export function GlobalExpenses({ role }: { role?: string | null }) {
  const [expenses, setExpenses] = useState<GlobalExpense[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isAdmin = role === 'admin' || role === 'super_admin'

  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newCategory, setNewCategory] = useState("Equipamiento")

  const categories = [
    'Software/Suscripciones',
    'Marketing/Publicidad',
    'Equipamiento',
    'Viajes/Transporte',
    'Honorarios/Gestoría',
    'Otro'
  ]

  useEffect(() => {
    fetchExpenses()
  }, [])

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('global_expenses')
        .select('*')
        .order('date', { ascending: false })

      if (error) throw error
      setExpenses(data || [])
    } catch (e) {
      console.error("Error cargando gastos:", e)
      toast.error("Error al cargar gastos generales")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error("No user")

      const amount = parseFloat(newAmount)
      if (isNaN(amount) || amount <= 0) {
        toast.error("Introduce un importe válido")
        return
      }

      const { data, error } = await supabase
        .from('global_expenses')
        .insert([{
          user_id: userData.user.id,
          title: newTitle,
          amount: amount,
          category: newCategory,
          date: new Date().toISOString().split('T')[0]
        }])
        .select()

      if (error) throw error

      toast.success("Gasto registrado")
      if (data) {
        setExpenses([data[0], ...expenses])
      }
      
      setNewTitle("")
      setNewAmount("")
      setShowAddForm(false)
    } catch (e) {
      console.error(e)
      toast.error("Error al guardar el gasto")
    }
  }

  const handleDelete = async (id: string) => {
    if (!isAdmin || !confirm("¿Seguro que deseas eliminar este gasto de la empresa?")) return

    try {
      const { error } = await supabase.from('global_expenses').delete().eq('id', id)
      if (error) throw error
      
      setExpenses(expenses.filter(e => e.id !== id))
      toast.success("Eliminado")
    } catch (e) {
      toast.error("Error al eliminar")
    }
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0)

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando contabilidad...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Gastos Generales de la Empresa</h2>
          <p className="text-sm text-muted-foreground">Material, software, honorarios y amortizaciones.</p>
        </div>
        
        {isAdmin ? (
          <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
            <Plus className="w-4 h-4" /> Añadir Gasto Global
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground text-sm rounded-md border border-border">
            <ShieldAlert className="w-4 h-4" />
            Solo lectura
          </div>
        )}
      </div>

      {showAddForm && isAdmin && (
        <form onSubmit={handleAddExpense} className="bg-muted/30 border border-border rounded-xl p-4 sm:p-6 space-y-4 animate-in slide-in-from-top-4">
          <h3 className="font-semibold border-b border-border pb-2">Registrar Nuevo Gasto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Motivo / Concepto</label>
              <input 
                required
                type="text" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Ej: Licencias Office 365"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Importe (€)</label>
              <input 
                required
                type="number" 
                min="0.01" step="0.01"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Categoría Contable</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/50"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>Cancelar</Button>
            <Button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white">Guardar Gasto</Button>
          </div>
        </form>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-rose-500/80 uppercase tracking-widest">Total Gastos</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">-{totalExpenses.toLocaleString('es-ES')} €</p>
          </div>
          <div className="p-3 bg-rose-500/20 rounded-full">
            <Receipt className="w-6 h-6 text-rose-600 dark:text-rose-400" />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-background border border-border rounded-xl overflow-hidden">
        {expenses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No hay gastos globales registrados.</div>
        ) : (
          <ul className="divide-y divide-border">
             {expenses.map((exp) => (
                <li key={exp.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-4">
                     <div className="h-10 w-10 flex-shrink-0 bg-muted rounded-full flex items-center justify-center border border-border">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                     </div>
                     <div>
                       <h4 className="font-medium text-foreground">{exp.title}</h4>
                       <div className="flex items-center gap-2 mt-1">
                         <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground border border-border">{exp.category}</span>
                         <span className="text-xs text-muted-foreground">{new Date(exp.date).toLocaleDateString('es-ES')}</span>
                       </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="font-bold text-rose-600 dark:text-rose-400">-{Number(exp.amount).toLocaleString('es-ES')} €</span>
                     {isAdmin && (
                        <button onClick={() => handleDelete(exp.id)} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 rounded-md transition-colors text-muted-foreground">
                          <Trash2 className="w-4 h-4" />
                        </button>
                     )}
                  </div>
                </li>
             ))}
          </ul>
        )}
      </div>

    </div>
  )
}
