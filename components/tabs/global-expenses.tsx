"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, ShieldAlert, Receipt, Calendar, Paperclip } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { openPrivateFile, removePrivateFiles } from "@/lib/private-files"

interface GlobalExpense {
  id: string
  title: string
  amount: number
  date: string
  category: string
  created_at: string
  receipt_url?: string
}

export function GlobalExpenses({ role }: { role?: string | null }) {
  const [expenses, setExpenses] = useState<GlobalExpense[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isAdmin = role === 'admin' || role === 'super_admin'

  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newCategory, setNewCategory] = useState("Equipamiento")
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [newReceipt, setNewReceipt] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

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

      let receiptUrl = undefined;
      
      if (newReceipt) {
        setIsUploading(true)
        const fileName = `${Date.now()}-${newReceipt.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, newReceipt)

        if (!uploadError) {
          // Bucket privado: se guarda la ruta y se abre con un enlace temporal
          receiptUrl = fileName
        } else {
          toast.error("Aviso: No se pudo subir el archivo adjunto.")
        }
        setIsUploading(false)
      }

      const payload: any = {
        title: newTitle,
        amount: amount,
        category: newCategory,
        date: newDate
      };

      if (receiptUrl) {
         payload.receipt_url = receiptUrl;
      }

      if (editingId) {
        // Update existing
        const { data, error } = await supabase
          .from('global_expenses')
          .update(payload)
          .eq('id', editingId)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) {
           throw new Error("No tienes permisos para modificar este gasto, o RLS lo bloqueó silenciosamente.");
        }
        
        // Al sustituir el recibo, borrar el archivo anterior
        const previous = expenses.find(e => e.id === editingId)
        if (receiptUrl && previous?.receipt_url) await removePrivateFiles('receipts', [previous.receipt_url])

        toast.success("Gasto actualizado");
        setExpenses(expenses.map(e => e.id === editingId ? { ...e, ...payload } : e));
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('global_expenses')
          .insert([{ user_id: userData.user.id, ...payload }])
          .select();

        if (error) throw error;
        toast.success("Gasto registrado");
        if (data) setExpenses([data[0], ...expenses]);
      }
      
      resetForm()
    } catch (e) {
      console.error(e)
      toast.error("Error al guardar el gasto")
    }
  }

  const resetForm = () => {
    setNewTitle("")
    setNewAmount("")
    setNewDate(new Date().toISOString().split('T')[0])
    setNewReceipt(null)
    setEditingId(null)
    setShowAddForm(false)
  }

  const handleEdit = (exp: GlobalExpense) => {
    if (!isAdmin) return;
    setEditingId(exp.id)
    setNewTitle(exp.title)
    setNewAmount(exp.amount.toString())
    setNewCategory(exp.category)
    setNewDate(exp.date)
    setNewReceipt(null)
    setShowAddForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!isAdmin || !confirm("¿Seguro que deseas eliminar este gasto de la empresa?")) return

    try {
      const expense = expenses.find(e => e.id === id)
      const { error } = await supabase.from('global_expenses').delete().eq('id', id)
      if (error) throw error
      if (expense?.receipt_url) await removePrivateFiles('receipts', [expense.receipt_url])
      
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
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Gastos generales de la empresa</h2>
          <p className="text-muted-foreground">Material, software, honorarios y amortizaciones.</p>
        </div>
        
        {isAdmin ? (
          <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-2">
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
        <form onSubmit={handleAddExpense} className="bg-card border rounded-xl p-5 shadow-xs space-y-4 animate-in slide-in-from-top-4">
          <h3 className="font-semibold border-b border-border pb-2">{editingId ? 'Editar Gasto' : 'Registrar Nuevo Gasto'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Fecha</label>
              <input
                required
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 mt-2">
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Recibo / Factura (Opcional)</label>
              <input
                type="file"
                onChange={(e) => setNewReceipt(e.target.files?.[0] || null)}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 file:cursor-pointer transition-colors"
                title="Sube una foto o PDF de la factura"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={resetForm} disabled={isUploading}>Cancelar</Button>
            <Button type="submit" disabled={isUploading}>
               {isUploading ? 'Subiendo...' : (editingId ? 'Actualizar' : 'Guardar Gasto')}
            </Button>
          </div>
        </form>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center justify-between rounded-xl border bg-card p-5 shadow-xs">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Total gastos</p>
            <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-destructive">-{totalExpenses.toLocaleString('es-ES')} €</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
            <Receipt className="h-4 w-4 text-destructive" />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-card border rounded-xl overflow-hidden shadow-xs">
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
                       <div className="flex items-center gap-2 mt-1 flex-wrap">
                         <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground border border-border">{exp.category}</span>
                         <span className="text-xs text-muted-foreground">{new Date(exp.date).toLocaleDateString('es-ES')}</span>
                         {exp.receipt_url && (
                           <button
                             type="button"
                             onClick={async () => {
                               const ok = await openPrivateFile('receipts', exp.receipt_url)
                               if (!ok) toast.error("No se pudo abrir la factura")
                             }}
                             className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                           >
                             <Paperclip className="h-3 w-3" /> Factura
                           </button>
                         )}
                       </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="tabular font-semibold text-destructive">-{Number(exp.amount).toLocaleString('es-ES')} €</span>
                     {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEdit(exp)} className="text-xs px-3 py-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground">
                            Editar
                          </button>
                          <button onClick={() => handleDelete(exp.id)} className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors text-muted-foreground">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
