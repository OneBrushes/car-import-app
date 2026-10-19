"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface MarkAsBoughtData {
  carId: string
  datePurchased: string
  price: number
  expenses: number
}

interface MarkAsBoughtModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: MarkAsBoughtData) => void
  /** Preseleccionar un coche (p. ej. al arrastrarlo a "Comprado" en el tablero) */
  initialCarId?: string | null
}

const today = () => new Date().toISOString().split("T")[0]

export function MarkAsBoughtModal({ isOpen, onClose, onSubmit, initialCarId }: MarkAsBoughtModalProps) {
  const { user, profile } = useAuth()
  const [carId, setCarId] = useState("")
  const [datePurchased, setDatePurchased] = useState(today())
  const [price, setPrice] = useState("")
  const [expenses, setExpenses] = useState("")
  const [importedCars, setImportedCars] = useState<any[]>([])

  useEffect(() => {
    const loadCars = async () => {
      if (!isOpen || !user) return

      let query = supabase
        .from('imported_cars')
        .select('*')
        .order('created_at', { ascending: false })

      const canManageAll = ['admin', 'super_admin', 'importador'].includes(profile?.role || '')
      if (!canManageAll) {
        query = query.eq('user_id', user.id)
      }

      const { data, error } = await query
      if (!error && data) setImportedCars(data)
    }

    loadCars()
  }, [isOpen, user])

  // Reiniciar al abrir
  useEffect(() => {
    if (!isOpen) return
    setCarId("")
    setDatePurchased(today())
    setPrice("")
    setExpenses("")
  }, [isOpen])

  // Preselección cuando ya están cargados los coches
  useEffect(() => {
    if (isOpen && initialCarId && importedCars.some(c => c.id === initialCarId)) selectCar(initialCarId)
  }, [isOpen, initialCarId, importedCars])

  const selectCar = (id: string) => {
    setCarId(id)
    const car = importedCars.find(c => c.id === id)
    if (!car) return
    const carPrice = Number(car.price) || 0
    const totalCost = Number(car.total_cost) || carPrice
    setPrice(String(carPrice))
    setExpenses(String(Math.max(0, totalCost - carPrice)))
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!carId) return
    onSubmit({
      carId,
      datePurchased,
      price: Number(price) || 0,
      expenses: Number(expenses) || 0,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como comprado</DialogTitle>
          <DialogDescription>Pasa un coche de Importación a tu inventario.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Coche</Label>
            <Select value={carId} onValueChange={selectCar}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un coche" />
              </SelectTrigger>
              <SelectContent>
                {importedCars.map((car) => (
                  <SelectItem key={car.id} value={car.id}>
                    {car.brand} {car.model} {car.year ? `(${car.year})` : ""}
                    {car.total_cost ? ` · ${Number(car.total_cost).toLocaleString('es-ES')} €` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Precio de compra (€)</Label>
              <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Gastos iniciales (€)</Label>
              <Input type="number" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px]">Fecha de compra</Label>
            <Input type="date" value={datePurchased} onChange={(e) => setDatePurchased(e.target.value)} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => handleSubmit()} disabled={!carId}>Marcar como comprado</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
