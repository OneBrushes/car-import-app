"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Upload, File as FileIcon, FileText, Trash2, Download, Loader2, Image as ImageIcon, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { openPrivateFile, removePrivateFiles } from "@/lib/private-files"

export interface CarDocument {
  name: string
  /** Ruta dentro del bucket privado car-documents (los documentos antiguos guardan aquí la URL pública) */
  url: string
  type: string
  size?: number
}

interface DocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  carId: string
  carName: string
  documents: CarDocument[]
  onDocumentsUpdate: (newDocs: CarDocument[]) => void
}

export function DocumentsModal({ isOpen, onClose, carId, carName, documents, onDocumentsUpdate }: DocumentsModalProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [openingIndex, setOpeningIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="w-6 h-6 text-destructive" />
    if (type.includes("image")) return <ImageIcon className="w-6 h-6 text-primary" />
    return <FileIcon className="w-6 h-6 text-muted-foreground" />
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const newDocs: CarDocument[] = [...documents]

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // El nombre empieza por el id del coche: las reglas de Storage lo usan para dar acceso
        const fileName = `${carId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`

        const { error: uploadError } = await supabase.storage
          .from('car-documents')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Upload Error:', uploadError)
          toast.error(`Error al subir: ${file.name}`)
          continue
        }

        newDocs.push({
          name: file.name,
          url: fileName,
          type: file.type || "unknown",
          size: file.size
        })
      }

      const { error: dbError } = await supabase
        .from('inventory_cars')
        .update({ documents: newDocs })
        .eq('id', carId)

      if (dbError) throw dbError

      onDocumentsUpdate(newDocs)
      toast.success("Documento(s) subido(s) correctamente")
    } catch (error) {
      console.error("Error global de subida:", error)
      toast.error("Error al actualizar la base de datos")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleOpen = async (doc: CarDocument, index: number) => {
    setOpeningIndex(index)
    const ok = await openPrivateFile('car-documents', doc.url)
    setOpeningIndex(null)
    if (!ok) toast.error("No se pudo abrir el documento")
  }

  const handleDelete = async (docToDelete: CarDocument) => {
    if (!confirm(`¿Seguro que quieres borrar el documento "${docToDelete.name}"?`)) return

    try {
      await removePrivateFiles('car-documents', [docToDelete.url])

      const newDocs = documents.filter(d => d.url !== docToDelete.url)

      const { error: dbError } = await supabase
        .from('inventory_cars')
        .update({ documents: newDocs })
        .eq('id', carId)

      if (dbError) throw dbError

      onDocumentsUpdate(newDocs)
      toast.success("Documento eliminado")
    } catch (error) {
      console.error("Error deleting:", error)
      toast.error("Error al eliminar el documento")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Documentos del vehículo</DialogTitle>
          <DialogDescription>{carName}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              <FileIcon className="mb-3 h-10 w-10 opacity-50" />
              <p className="font-medium text-foreground">No hay documentos todavía</p>
              <p className="mt-1 text-sm">Sube la documentación aquí para tenerla siempre a mano.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {documents.map((doc, idx) => (
                <div key={idx} className="flex flex-col rounded-xl border bg-card p-4 shadow-xs">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {getFileIcon(doc.type)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="line-clamp-2 text-sm font-medium" title={doc.name}>{doc.name}</h4>
                      {doc.size ? <span className="tabular text-xs text-muted-foreground">{(doc.size / 1024 / 1024).toFixed(2)} MB</span> : null}
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpen(doc, idx)} disabled={openingIndex === idx}>
                      {openingIndex === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Abrir
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(doc)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t p-5 sm:flex-row">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Privados: solo los ve quien tiene acceso al coche.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileUpload}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full sm:w-auto">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Subiendo..." : "Subir archivo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
