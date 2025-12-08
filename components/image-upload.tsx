"use client"

import type React from "react"

import { useState } from "react"
import { Upload, X, ImageIcon } from "lucide-react"

interface ImageUploadProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  maxImages?: number
}

export function ImageUpload({ images, onImagesChange, maxImages = 10 }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"))

    // Leer todos los archivos en paralelo
    const promises = imageFiles.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      })
    })

    const newImages = await Promise.all(promises)

    // Calcular cuántas imágenes podemos añadir
    const availableSlots = maxImages - images.length
    const imagesToAdd = newImages.slice(0, availableSlots)

    if (imagesToAdd.length > 0) {
      onImagesChange([...images, ...imagesToAdd])
    }
  }

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"
          }`}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="image-input"
          disabled={images.length >= maxImages}
        />
        <label htmlFor="image-input" className="cursor-pointer">
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Arrastra fotos aquí o haz clic para seleccionar</p>
              <p className="text-xs text-muted-foreground mt-1">
                {images.length}/{maxImages} fotos
              </p>
            </div>
          </div>
        </label>
      </div>

      {/* Gallery Preview */}
      {images.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos añadidas ({images.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((image, index) => (
              <div
                key={index}
                className="relative group rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
              >
                <img src={image || "/placeholder.svg"} alt={`Foto ${index + 1}`} className="w-full h-40 object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="p-2 bg-destructive/90 text-white rounded-lg hover:bg-destructive transition-colors"
                    title="Eliminar foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {index === 0 && (
                  <div className="absolute top-1 left-1 bg-primary/90 text-primary-foreground px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Principal
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
