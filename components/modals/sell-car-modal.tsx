"use client"

import type React from "react"

import { useState } from "react"
import { X } from "lucide-react"

interface SellCarModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  car: any
}

export function SellCarModal({ isOpen, onClose, onSubmit, car }: SellCarModalProps) {
  const [sellPrice, setSellPrice] = useState("")
  const [dateSold, setDateSold] = useState(new Date().toISOString().split("T")[0])
  const [buyer, setBuyer] = useState("")

  const totalInvested =
    car.initialPrice + car.initialExpenses + car.expenses.reduce((sum: number, e: any) => sum + e.amount, 0)

  const profit = sellPrice ? Number.parseFloat(sellPrice) - totalInvested : 0
  const profitPercentage = sellPrice ? (profit / totalInvested) * 100 : 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sellPrice) {
      onSubmit({
        sellPrice: Number.parseFloat(sellPrice),
        dateSold,
        buyer,
      })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg w-full max-w-md shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold">Marcar como Vendido</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-primary/10 rounded-lg p-3">
            <p className="text-sm text-muted-foreground mb-1">Vehículo</p>
            <p className="font-semibold">
              {car.brand} {car.model} ({car.year})
            </p>
            <p className="text-xs text-muted-foreground mt-2">Inversión total: {totalInvested}€</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Precio de venta</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="Precio"
                required
                className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="px-3 py-2 bg-input border border-border rounded-lg flex items-center">€</div>
            </div>
          </div>

          {sellPrice && (
            <div className="bg-accent/10 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Beneficio:</span>
                <span className={profit > 0 ? "text-accent font-bold" : "text-destructive font-bold"}>
                  {profit > 0 ? "+" : ""}
                  {profit.toFixed(0)}€
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rentabilidad:</span>
                <span className={profitPercentage > 0 ? "text-accent font-bold" : "text-destructive font-bold"}>
                  {profitPercentage > 0 ? "+" : ""}
                  {profitPercentage.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Fecha de venta</label>
            <input
              type="date"
              value={dateSold}
              onChange={(e) => setDateSold(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Comprador (opcional)</label>
            <input
              type="text"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              placeholder="Nombre del comprador"
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
            className="flex-1 px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors font-medium"
          >
            Confirmar Venta
          </button>
        </div>
      </div>
    </div>
  )
}
