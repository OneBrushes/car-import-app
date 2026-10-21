"use client"

// Barra de progreso de la subida de un artículo a la web: consulta el despliegue en GitHub (función blog) y comprueba
// en la propia web cuándo aparece (o desaparece) la página del artículo.
import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react"
import { getDeployStatus, pageOnSite, SITE_URL } from "@/lib/blog"
import { clearDeploy, useDeployJob, type DeployJob } from "@/lib/blog-deploy"

type Phase = "waiting" | "queued" | "building" | "publishing" | "done" | "failed"

const LABEL: Record<Phase, string> = {
  waiting: "Avisando a GitHub…",
  queued: "En cola para generar la web…",
  building: "Generando la web con el artículo…",
  publishing: "Publicando en nordrivecars.com…",
  done: "",
  failed: "La subida ha fallado",
}

const BUILD_SECONDS = 120 // lo que suele tardar en generarse la web
const SLOW_AFTER = 10 * 60_000

export function BlogDeployProgress() {
  const job = useDeployJob()
  if (!job) return null
  return <Tracker key={job.startedAt} job={job} />
}

function Tracker({ job }: { job: DeployJob }) {
  const [phase, setPhase] = useState<Phase>("waiting")
  const [buildStart, setBuildStart] = useState<number | null>(null)
  const [runUrl, setRunUrl] = useState<string | null>(null)
  const [now, setNow] = useState(job.startedAt)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const run = await getDeployStatus()
      // solo cuenta el despliegue lanzado ahora (o después), no uno anterior
      const ours = run && new Date(run.created_at).getTime() >= job.startedAt - 60_000 ? run : null
      let next: Phase = "waiting"
      if (ours) {
        setRunUrl(ours.url)
        if (ours.status !== "completed") {
          next = ours.status === "in_progress" ? "building" : "queued"
          if (next === "building") setBuildStart((s) => s ?? new Date(ours.started_at ?? ours.created_at).getTime())
        } else if (ours.conclusion !== "success") {
          next = "failed"
        } else if (job.expect === "update") {
          next = "done"
        } else {
          const live = await pageOnSite(job.slug)
          next = (job.expect === "live" ? live === true : live === false) ? "done" : "publishing"
        }
      }
      if (stopped) return
      setPhase(next)
      if (next !== "done" && next !== "failed") timer = setTimeout(poll, next === "publishing" ? 5000 : 8000)
    }
    poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [job])

  const elapsed = Math.max(0, now - job.startedAt)
  const buildFraction = buildStart ? Math.min(1, (now - buildStart) / (BUILD_SECONDS * 1000)) : 0
  const pct = phase === "done" ? 100
    : phase === "failed" ? 100
    : phase === "publishing" ? Math.min(98, 90 + (elapsed / 1000 - BUILD_SECONDS) / 10)
    : phase === "building" ? 15 + 73 * buildFraction
    : phase === "queued" ? 10
    : Math.min(8, 2 + elapsed / 2000)
  const slow = phase !== "done" && phase !== "failed" && elapsed > SLOW_AFTER
  const mmss = `${Math.floor(elapsed / 60000)}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}`
  const url = `${SITE_URL}/blog/${job.slug}/`
  const doneText = job.expect === "gone" ? "Quitado de la web" : job.expect === "live" ? "¡Ya está en la web!" : "Web actualizada"

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          {phase === "done" ? <CheckCircle2 className="h-5 w-5 text-success" />
            : phase === "failed" ? <AlertTriangle className="h-5 w-5 text-destructive" />
            : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {phase === "done" ? doneText : phase === "failed" ? LABEL.failed : job.expect === "gone" ? "Quitando de la web" : "Subiendo a la web"} · «{job.title}»
          </p>
          <p className="text-xs text-muted-foreground">
            {phase === "done"
              ? (job.expect === "gone" ? "Ya no aparece en el blog." : "Si no lo ves al momento, recarga la página (puede tardar unos minutos en todos los sitios).")
              : phase === "failed"
                ? "GitHub no ha podido generar la web. Mira el detalle y vuelve a pulsar «Subir a la web»."
                : `${LABEL[phase]} ${mmss}${slow ? " · está tardando más de lo normal" : " · suele tardar 2-3 minutos"}`}
          </p>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ease-out ${phase === "failed" ? "bg-destructive" : phase === "done" ? "bg-success" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {phase === "done" && job.expect !== "gone" && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Ver el artículo <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {(phase === "failed" || slow) && runUrl && (
              <a href={runUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
                Ver el detalle en GitHub <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <button type="button" onClick={clearDeploy} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
