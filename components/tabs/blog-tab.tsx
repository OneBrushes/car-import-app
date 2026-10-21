"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, Bot, Eye, ExternalLink, FileText, ImagePlus, Loader2, PenLine, Plus, Rocket, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  deletePost, getAutoPublish, isFuture, listPosts, postState, readingMinutes, rebuildSite, savePost, setAutoPublish, siteStats, slugify, uploadCover,
  SITE_URL, type BlogPost, type BlogPostInput, type SiteStats,
} from "@/lib/blog"

const STATE_LABEL = { draft: "Borrador", scheduled: "Programado", published: "Publicado" } as const
const STATE_CLASS = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-warning/10 text-warning",
  published: "bg-success/10 text-success",
} as const

const EMPTY: BlogPostInput = {
  slug: "", title: "", excerpt: "", content: "", cover_url: null, cover_alt: null, tags: [], author: "NorDrive",
  seo_title: null, seo_description: null, status: "draft", published_at: null, source: "manual", reading_minutes: null,
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BlogTab({ isActive = true }: { isActive?: boolean }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin"
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<BlogPost | "new" | null>(null)
  const [autoPublish, setAuto] = useState(false)
  const [stats, setStats] = useState<SiteStats | null>(null)
  const [days, setDays] = useState(30)

  const load = async () => {
    setLoading(true)
    try {
      const [list, auto] = await Promise.all([listPosts(), getAutoPublish()])
      setPosts(list)
      setAuto(auto)
      setError("")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isActive) load() }, [isActive])
  useEffect(() => {
    if (!isActive) return
    siteStats(days).then(setStats).catch(() => setStats(null))
  }, [isActive, days])

  const viewsBySlug = useMemo(() => new Map((stats?.top_posts ?? []).map((p) => [p.slug, p])), [stats])

  const toggleAuto = async (v: boolean) => {
    setAuto(v)
    try {
      await setAutoPublish(v)
      toast.success(v ? "Lo que escriba Claude se publicará solo" : "Lo que escriba Claude quedará en borrador para que lo revises")
    } catch (e: any) {
      setAuto(!v)
      toast.error(e.message)
    }
  }

  if (editing) {
    return (
      <PostEditor
        post={editing === "new" ? null : editing}
        onBack={() => { setEditing(null); load() }}
      />
    )
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Blog del motor</h2>
          <p className="text-muted-foreground">Escribe artículos o revisa los que prepara Claude, y súbelos a <a href={`${SITE_URL}/blog/`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">nordrivecars.com/blog</a>.</p>
        </div>
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Nuevo artículo</Button>
      </div>

      {/* Visitas */}
      <section className="rounded-xl border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Visitantes</h3>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                {d} días
              </button>
            ))}
          </div>
        </div>
        {!stats ? (
          <p className="text-sm text-muted-foreground">Las visitas aparecerán aquí cuando la web empiece a contarlas (tras ejecutar el SQL del blog y publicar la web).</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Visitantes web" value={stats.site_visitors} />
              <Stat label="Visitas web" value={stats.site_views} />
              <Stat label="Visitantes blog" value={stats.blog_visitors} />
              <Stat label="Visitas blog" value={stats.blog_views} />
            </div>
            <DailyChart data={stats.by_day} />
            {stats.referrers.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Llegan desde: {stats.referrers.map((r) => `${r.host} (${r.visitors})`).join(" · ")}
              </p>
            )}
          </>
        )}
      </section>

      {/* Claude */}
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Artículos de Claude</p>
            <p className="text-xs text-muted-foreground">Claude escribe un artículo cada semana y te llega un aviso. {autoPublish ? "Se publica solo en la web." : "Queda en borrador: revísalo y pulsa «Subir a la web»."}</p>
          </div>
        </div>
        <label className={`flex items-center gap-2 text-sm ${isAdmin ? "cursor-pointer" : "opacity-60"}`} title={isAdmin ? "" : "Solo un administrador puede cambiarlo"}>
          <Switch checked={autoPublish} disabled={!isAdmin} onCheckedChange={toggleAuto} />
          Publicar automáticamente
        </label>
      </section>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{error}</p>
      ) : posts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no hay artículos. Crea el primero o espera al de Claude.</p>
      ) : (
        <div className="divide-y rounded-xl border bg-card shadow-xs">
          {posts.map((p) => {
            const state = postState(p)
            const v = viewsBySlug.get(p.slug)
            return (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  {p.cover_url ? <img src={p.cover_url} alt="" className="h-full w-full object-cover" /> : <FileText className="m-auto mt-4 h-5 w-5 text-muted-foreground" />}
                </div>
                <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-medium">{p.title || "(sin título)"}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>
                    {p.source === "claude" && <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" /> Claude</span>}
                    <span>{p.published_at ? new Date(p.published_at).toLocaleDateString("es-ES") : `Editado ${new Date(p.updated_at).toLocaleDateString("es-ES")}`}</span>
                    {v && <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {v.views} visitas</span>}
                  </p>
                </button>
                {state === "published" && (
                  <a href={`${SITE_URL}/blog/${p.slug}/`} target="_blank" rel="noopener noreferrer" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" title="Ver en la web">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title="Editar"><PenLine className="h-4 w-4" /></Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="tabular text-2xl font-semibold">{value.toLocaleString("es-ES")}</p>
    </div>
  )
}

/** Barras por día: visitantes de la web (claro) y del blog (oscuro) */
function DailyChart({ data }: { data: SiteStats["by_day"] }) {
  if (!data.length) return null
  const max = Math.max(1, ...data.map((d) => d.site))
  return (
    <div className="mt-4">
      <div className="flex h-24 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.day} className="group relative flex-1" title={`${new Date(d.day).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}: ${d.site} visitantes web · ${d.blog} blog`}>
            <div className="w-full rounded-t bg-primary/25" style={{ height: `${(d.site / max) * 96}px` }}>
              <div className="absolute bottom-0 w-full rounded-t bg-primary" style={{ height: `${(d.blog / max) * 96}px` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/25" /> Web</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Blog</span>
      </p>
    </div>
  )
}

// =====================================================================================================================

function PostEditor({ post, onBack }: { post: BlogPost | null; onBack: () => void }) {
  const [current, setCurrent] = useState<BlogPost | null>(post)
  const [form, setForm] = useState<BlogPostInput>(post ? { ...post } : { ...EMPTY })
  const [slugTouched, setSlugTouched] = useState(Boolean(post))
  const [tagsText, setTagsText] = useState((post?.tags ?? []).join(", "))
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(post?.published_at ?? null))
  const coverInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof BlogPostInput>(k: K, v: BlogPostInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const state = current ? postState(current) : "draft"
  const seoTitle = (form.seo_title || form.title || "Título del artículo").slice(0, 70)
  const seoDesc = (form.seo_description || form.excerpt || "Resumen del artículo…").slice(0, 170)

  const problems = [
    !form.title.trim() && "Falta el título",
    !form.slug.trim() && "Falta la dirección (slug)",
    form.excerpt.trim().length < 50 && "El resumen debería tener al menos 50 caracteres (sale en Google y al compartir)",
    form.content.trim().length < 600 && "El artículo es muy corto (Google premia los de 800+ palabras)",
    !form.cover_url && "Falta la imagen de portada",
  ].filter(Boolean) as string[]

  const persist = async (publish: "keep" | "publish" | "unpublish") => {
    const tags = tagsText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
    let status = form.status
    let published_at = form.published_at
    if (publish === "publish") {
      status = "published"
      published_at = scheduleAt ? new Date(scheduleAt).toISOString() : new Date().toISOString()
    } else if (publish === "unpublish") {
      status = "draft"
      published_at = null
    }
    setSaving(true)
    try {
      const saved = await savePost(current, { ...form, slug: slugify(form.slug), tags, status, published_at })
      setCurrent(saved)
      setForm({ ...saved })
      setScheduleAt(toLocalInput(saved.published_at))
      if (publish === "keep") {
        toast.success(saved.status === "published" ? "Guardado. Pulsa «Subir a la web» para que se vean los cambios." : "Borrador guardado")
      } else {
        await rebuildSite()
        toast.success(publish === "publish"
          ? (postState(saved) === "scheduled" ? `Programado para el ${new Date(saved.published_at!).toLocaleString("es-ES")}` : "Subiendo a la web… estará visible en 2-3 minutos")
          : "Quitado de la web (tarda 2-3 minutos)")
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!current || !confirm("¿Borrar este artículo? No se puede deshacer.")) return
    try {
      await deletePost(current.id)
      if (state !== "draft") await rebuildSite().catch(() => undefined)
      toast.success("Artículo borrado")
      onBack()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const onCover = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      set("cover_url", await uploadCover(file))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Blog</Button>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>
        {current?.source === "claude" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" /> Escrito por Claude</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {current && <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /> Borrar</Button>}
          {state !== "draft" && <Button variant="outline" size="sm" onClick={() => persist("unpublish")} disabled={saving}>Quitar de la web</Button>}
          <Button variant="outline" size="sm" onClick={() => persist("keep")} disabled={saving}>Guardar</Button>
          <Button size="sm" onClick={() => persist("publish")} disabled={saving || !form.title.trim() || !form.slug.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} {isFuture(scheduleAt) ? "Programar" : "Subir a la web"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Input value={form.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)) }}
            placeholder="Título del artículo" className="h-12 text-lg font-semibold" />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Resumen (sale en la lista del blog, en Google y al compartir) · {form.excerpt.length}/160</Label>
            <Textarea rows={2} value={form.excerpt} maxLength={300} onChange={(e) => set("excerpt", e.target.value)}
              placeholder="Una o dos frases que expliquen de qué va y por qué leerlo." />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Contenido (Markdown: ## Subtítulo, **negrita**, - listas, [enlace](https://…)) · {readingMinutes(form.content)} min de lectura</Label>
              <div className="flex gap-1">
                <button onClick={() => setPreview(false)} className={`rounded-md px-2.5 py-1 text-xs ${!preview ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>Escribir</button>
                <button onClick={() => setPreview(true)} className={`rounded-md px-2.5 py-1 text-xs ${preview ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>Vista previa</button>
              </div>
            </div>
            {preview ? (
              <article className="prose prose-neutral dark:prose-invert max-w-none min-h-[28rem] rounded-lg border bg-background p-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content || "_Aún no hay contenido._"}</ReactMarkdown>
              </article>
            ) : (
              <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} className="min-h-[28rem] font-mono text-sm leading-relaxed"
                placeholder={"## ¿Por qué importar desde Alemania?\n\nEscribe aquí el artículo…"} />
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Label className="text-xs text-muted-foreground">Portada</Label>
            <button type="button" onClick={() => coverInput.current?.click()} className="relative block aspect-[16/9] w-full overflow-hidden rounded-lg border border-dashed bg-muted">
              {form.cover_url ? <img src={form.cover_url} alt="" className="h-full w-full object-cover" /> : (
                <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />} Subir imagen (1200×630 ideal)
                </span>
              )}
            </button>
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { onCover(e.target.files?.[0]); e.target.value = "" }} />
            <Input value={form.cover_alt ?? ""} onChange={(e) => set("cover_alt", e.target.value || null)} placeholder="Descripción de la imagen (para Google)" className="text-xs" />
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dirección</Label>
              <div className="flex items-center rounded-md border bg-background text-xs">
                <span className="pl-2.5 text-muted-foreground">/blog/</span>
                <input value={form.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)) }} className="w-full bg-transparent py-1.5 pr-2.5 outline-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Etiquetas (separadas por comas)</Label>
              <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="importación, alemania, impuestos" className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Publicar el (opcional, para programarlo)</Label>
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="text-xs" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold">Google (SEO)</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Título para Google · {(form.seo_title || form.title).length}/60</Label>
              <Input value={form.seo_title ?? ""} onChange={(e) => set("seo_title", e.target.value || null)} placeholder={form.title} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descripción para Google · {(form.seo_description || form.excerpt).length}/155</Label>
              <Textarea rows={3} value={form.seo_description ?? ""} onChange={(e) => set("seo_description", e.target.value || null)} placeholder={form.excerpt} className="text-xs" />
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="truncate text-[11px] text-muted-foreground">www.nordrivecars.com › blog › {form.slug || "…"}</p>
              <p className="truncate text-sm font-medium text-[#1a0dab] dark:text-[#8ab4f8]">{seoTitle} | NorDrive</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{seoDesc}</p>
            </div>
            {problems.length > 0 && (
              <ul className="space-y-1 text-xs text-warning">
                {problems.map((p) => <li key={p}>• {p}</li>)}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
