"use client"

import { useState } from "react"
import { HardDrive, Loader2, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { analyzeBucket, deleteOrphans, type BucketReport, type CleanupBucket } from "@/lib/storage-cleanup"

const BUCKETS: { id: CleanupBucket; label: string }[] = [
  { id: "car-images", label: "Fotos de coches" },
  { id: "car-documents", label: "Documentos de coches" },
  { id: "receipts", label: "Facturas de gastos" },
  { id: "avatars", label: "Fotos de perfil" },
]

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`

export function StorageCleanup() {
  const [reports, setReports] = useState<BucketReport[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const analyze = async () => {
    setAnalyzing(true)
    try {
      const result: BucketReport[] = []
      for (const bucket of BUCKETS) result.push(await analyzeBucket(bucket.id))
      setReports(result)
    } catch (error: any) {
      toast.error(error.message || "No se pudo analizar el almacenamiento")
      setReports(null)
    } finally {
      setAnalyzing(false)
    }
  }

  const totalOrphans = reports?.reduce((sum, r) => sum + r.orphans.length, 0) ?? 0
  const totalBytes = reports?.reduce((sum, r) => sum + r.orphanBytes, 0) ?? 0

  const remove = async () => {
    if (!reports || totalOrphans === 0) return
    if (!confirm(`Se borrarán ${totalOrphans} archivo(s) que no usa ningún coche, documento ni usuario (${mb(totalBytes)}). No se puede deshacer. ¿Continuar?`)) return
    setDeleting(true)
    try {
      let deleted = 0
      for (const report of reports) {
        if (report.orphans.length) deleted += await deleteOrphans(report.bucket, report.orphans)
      }
      toast.success(`${deleted} archivo(s) eliminados`)
      await analyze()
    } catch (error: any) {
      toast.error(error.message || "Error al borrar")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <HardDrive className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Archivos huérfanos</h3>
            <p className="text-sm text-muted-foreground">
              Fotos y documentos que quedaron en Storage al borrar coches o cambiar archivos. No se tocan los subidos en las últimas 24 horas.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={analyze} disabled={analyzing || deleting}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analizar
          </Button>
          {reports && totalOrphans > 0 && (
            <Button variant="destructive" size="sm" onClick={remove} disabled={deleting || analyzing}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Borrar {totalOrphans}
            </Button>
          )}
        </div>
      </div>

      {reports && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {reports.map(report => (
            <div key={report.bucket} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{BUCKETS.find(b => b.id === report.bucket)?.label}</p>
              <p className="tabular mt-1 text-lg font-semibold">
                {report.orphans.length}
                <span className="text-sm font-normal text-muted-foreground"> / {report.totalFiles}</span>
              </p>
              <p className="tabular text-xs text-muted-foreground">{report.orphans.length ? `${mb(report.orphanBytes)} recuperables` : "Todo en uso"}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
