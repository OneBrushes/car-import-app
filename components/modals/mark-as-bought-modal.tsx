"use client"

import type React from "react"

import { useState } from "react"
import { X } from "lucide-react"

interface MarkAsBoughtModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => void
}

export function MarkAsBoughtModal({ isOpen, onClose, onSubmit }: MarkAsBoughtModalProps) {
  const [carId, setCarId] = useState("")
  const [datePurchased, setDatePurchased] = useState(new Date().toISOString().split("T")[0])
  const [importedCars, setImportedCars] = useState<any[]>([])

  // Cargar coches importados
  const handleOpenModal = () => {
    const cars = JSON.parse(localStorage.getItem("importedCars") || "[]")
    setImportedCars(cars)
  }

  if (!isOpen) return null

  if (importedCars.length === 0) {
    handleOpenModal()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (carId) {
      onSubmit({ carId, datePurchased })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg w-full max-w-md shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold">Marcar como Comprado</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Selecciona coche importado</label>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Selecciona un coche</option>
              {importedCars.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.brand} {car.model} ({car.year}) - {car.finalPrice}€
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fecha de compra</label>
            <input
              type="date"
              value={datePurchased}
              onChange={(e) => setDatePurchased(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            Marcar como Comprado
          </button>
        </div>
      </div>
    </div>
  )
}
