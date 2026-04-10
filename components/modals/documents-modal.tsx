"use client"

import type React from "react"
import { useState, useRef } from "react"
import { X, Upload, File as FileIcon, FileText, Trash2, Download, Loader2, Image as ImageIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

export interface CarDocument {
  name: string
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="w-8 h-8 text-red-500" />
    if (type.includes("image")) return <ImageIcon className="w-8 h-8 text-blue-500" />
    return <FileIcon className="w-8 h-8 text-gray-500" />
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const newDocs: CarDocument[] = [...documents]

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileExt = file.name.split('.').pop()
        const fileName = `${carId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`

        const { error: uploadError } = await supabase.storage
          .from('car-documents')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Upload Error:', uploadError)
          toast.error(`Error al subir: ${file.name}`)
          continue
        }

        const { data } = supabase.storage
          .from('car-documents')
          .getPublicUrl(fileName)

        newDocs.push({
          name: file.name,
          url: data.publicUrl,
          type: file.type || "unknown",
          size: file.size
        })
      }

      // Actualizar Base de Datos
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

  const handleDelete = async (docToDelete: CarDocument) => {
    if (!confirm(`¿Seguro que quieres borrar el documento "${docToDelete.name}"?`)) return

    try {
      // Extraer el nombre del archivo de la URL
      const urlParts = docToDelete.url.split('/car-documents/')
      const filePath = urlParts.length > 1 ? urlParts[1] : null

      if (filePath) {
        await supabase.storage
          .from('car-documents')
          .remove([filePath])
      }

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl w-full max-w-3xl shadow-xl border border-border flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
          <div>
            <h2 className="text-xl font-bold">Documentos del Vehículo</h2>
            <p className="text-sm text-muted-foreground">{carName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cesta de Archivos */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl bg-muted/10">
              <FileIcon className="w-12 h-12 mb-3 opacity-50" />
              <p className="font-medium">No hay documentos todavía</p>
              <p className="text-sm opacity-80 mt-1">Sube la documentación aquí para tenerla siempre a mano.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {documents.map((doc, idx) => (
                <div key={idx} className="group relative border border-border bg-card rounded-xl p-4 hover:border-primary/50 hover:shadow-md transition-all flex flex-col items-center text-center">
                  <div className="mb-3">
                    {getFileIcon(doc.type)}
                  </div>
                  <h4 className="text-sm font-medium line-clamp-2 w-full mb-1" title={doc.name}>{doc.name}</h4>
                  {doc.size && <span className="text-[10px] text-muted-foreground mb-4">{(doc.size / 1024 / 1024).toFixed(2)} MB</span>}
                  
                  <div className="flex gap-2 w-full mt-auto">
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex-1 bg-primary/10 text-primary py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/20 flex items-center justify-center gap-1 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Abrir
                    </a>
                    <button onClick={() => handleDelete(doc)} className="px-2.5 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Upload */}
        <div className="p-5 border-t border-border bg-muted/20 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Sube PDFs, Facturas CMR o contratos.
          </div>
          <div>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              multiple 
              onChange={handleFileUpload}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isUploading ? "Subiendo..." : "Subir Archivo"}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
