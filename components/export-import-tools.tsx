"use client"

import type React from "react"

import { Download, Upload } from "lucide-react"
import { useState } from "react"

export function ExportImportTools() {
  const [isOpen, setIsOpen] = useState(false)

  const exportData = () => {
    const data = {
      importedCars: localStorage.getItem("importedCars"),
      spainCars: localStorage.getItem("spainCars"),
      boughtCars: localStorage.getItem("boughtCars"),
      comparisons: localStorage.getItem("comparisons"),
      exportDate: new Date().toISOString(),
    }

    const dataStr = JSON.stringify(data, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `autoimport-backup-${new Date().toISOString().split("T")[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)

        if (data.importedCars) localStorage.setItem("importedCars", data.importedCars)
        if (data.spainCars) localStorage.setItem("spainCars", data.spainCars)
        if (data.boughtCars) localStorage.setItem("boughtCars", data.boughtCars)
        if (data.comparisons) localStorage.setItem("comparisons", data.comparisons)

        alert("Datos importados correctamente. Por favor, recarga la página.")
        window.location.reload()
      } catch (error) {
        alert("Error al importar datos. Verifica que el archivo sea válido.")
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
      >
        <Download className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg shadow-lg p-2 min-w-max">
          <button
            onClick={() => {
              exportData()
              setIsOpen(false)
            }}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-secondary/50 transition-colors text-sm w-full text-left"
          >
            <Download className="w-4 h-4" />
            Exportar Datos
          </button>

          <label className="flex items-center gap-2 px-3 py-2 rounded hover:bg-secondary/50 transition-colors text-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Importar Datos</span>
            <input type="file" accept=".json" onChange={importData} className="hidden" />
          </label>
        </div>
      )}
    </div>
  )
}
