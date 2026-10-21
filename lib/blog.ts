// Blog del motor: artículos en Supabase (blog_posts), publicados en www.nordrivecars.com/blog al regenerar la web
// (Edge Function "blog"), y visitas de la web (site_stats). Ver supabase/2026-10_blog.sql.
import { supabase } from "@/lib/supabase"

export const SITE_URL = "https://www.nordrivecars.com"

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  cover_url: string | null
  cover_alt: string | null
  /** Autor y licencia de la foto de portada */
  cover_credit: string | null
  category: BlogCategory
  tags: string[]
  author: string
  seo_title: string | null
  seo_description: string | null
  status: "draft" | "published"
  published_at: string | null
  source: "manual" | "claude"
  reading_minutes: number | null
  created_at: string
  updated_at: string
}

export type BlogCategory = "importacion" | "noticias"

export const CATEGORY_LABEL: Record<BlogCategory, string> = { importacion: "Importación", noticias: "Noticias del motor" }

export type BlogPostInput = Omit<BlogPost, "id" | "created_at" | "updated_at">

export interface SiteStats {
  site_views: number
  site_visitors: number
  blog_views: number
  blog_visitors: number
  by_day: { day: string; site: number; blog: number }[]
  top_posts: { slug: string; views: number; visitors: number }[]
  referrers: { host: string; visitors: number }[]
}

export const MISSING_BLOG_HINT = "Falta preparar el blog: ejecuta supabase/2026-10_blog.sql en Supabase."
export const MISSING_BLOG_V2_HINT = "Falta actualizar el blog: ejecuta supabase/2026-10_blog_v2.sql en Supabase."

function blogError(error: { code?: string; message?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || /blog_posts|site_stats/.test(error.message || "")) {
    return new Error(MISSING_BLOG_HINT)
  }
  if (/category|cover_credit/.test(error.message || "") && /column|schema cache/i.test(error.message || "")) return new Error(MISSING_BLOG_V2_HINT)
  if (/blog_posts_slug_key|duplicate key/.test(error.message || "")) return new Error("Ya hay un artículo con esa dirección (slug). Cámbiala.")
  if (/slug_check|blog_posts_slug_check/.test(error.message || "")) return new Error("La dirección (slug) solo puede tener minúsculas, números y guiones.")
  return new Error(error.message || "Error del blog")
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)

export const readingMinutes = (md: string) => Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 220))

/** Estado visible: borrador, programado (fecha futura) o publicado */
export function postState(p: Pick<BlogPost, "status" | "published_at">): "draft" | "scheduled" | "published" {
  if (p.status !== "published" || !p.published_at) return "draft"
  return new Date(p.published_at).getTime() > Date.now() ? "scheduled" : "published"
}

/** ¿La fecha (texto de un campo datetime-local o ISO) es futura? */
export const isFuture = (value: string | null | undefined) => Boolean(value) && new Date(value!).getTime() > Date.now()

export async function listPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase.from("blog_posts").select("*").order("updated_at", { ascending: false })
  if (error) throw blogError(error)
  return (data as BlogPost[]) ?? []
}

export async function savePost(existing: BlogPost | null, input: BlogPostInput): Promise<BlogPost> {
  const payload = { ...input, reading_minutes: readingMinutes(input.content), updated_at: new Date().toISOString() }
  const q = existing
    ? supabase.from("blog_posts").update(payload).eq("id", existing.id).select("*").single()
    : supabase.from("blog_posts").insert(payload).select("*").single()
  const { data, error } = await q
  if (error) throw blogError(error)
  return data as BlogPost
}

export async function deletePost(id: string) {
  const { error } = await supabase.from("blog_posts").delete().eq("id", id)
  if (error) throw blogError(error)
}

/** Sube la portada al bucket público "blog" y devuelve su URL */
export async function uploadCover(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage.from("blog").upload(path, file, { contentType: file.type || undefined })
  if (error) throw blogError(error)
  return supabase.storage.from("blog").getPublicUrl(path).data.publicUrl
}

/** Regenera la web con los artículos publicados (tarda 2-3 minutos en verse) */
export async function rebuildSite(): Promise<void> {
  const { error } = await supabase.functions.invoke("blog", { body: { action: "rebuild" } })
  if (error) {
    let message = ""
    try { message = (await (error as { context?: Response }).context?.json())?.error ?? "" } catch { /* sin cuerpo */ }
    if (!message && /Failed to send|404|not found/i.test(error.message)) message = "Falta desplegar la función blog en Supabase (Edge Functions)."
    throw new Error(message || error.message || "No se pudo subir a la web")
  }
}

export async function getAutoPublish(): Promise<boolean> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "blog_auto_publish").maybeSingle()
  return data?.value === true
}

export async function setAutoPublish(value: boolean) {
  const { error } = await supabase.from("app_settings").upsert({ key: "blog_auto_publish", value }, { onConflict: "key" })
  if (error) throw blogError(error)
}

export async function siteStats(days = 30): Promise<SiteStats> {
  const { data, error } = await supabase.rpc("site_stats", { days })
  if (error) throw blogError(error)
  return data as SiteStats
}

// ---- Subida a la web (barra de progreso) ----

export interface DeployRun {
  status: string // queued | in_progress | completed | waiting | requested | pending
  conclusion: string | null // success | failure | cancelled…
  created_at: string
  updated_at: string
  started_at: string | null
  url: string
}

/** Último despliegue de la web (GitHub Actions), o null si no se puede saber */
export async function getDeployStatus(): Promise<DeployRun | null> {
  const { data, error } = await supabase.functions.invoke("blog", { body: { action: "deploy_status" } })
  if (error) return null
  return (data?.run as DeployRun) ?? null
}

/** ¿Está ya la página del artículo en la web? true / false (404) / null (no se pudo comprobar) */
export async function pageOnSite(slug: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${SITE_URL}/blog/${slug}/?v=${Date.now()}`, { cache: "no-store" })
    if (res.ok) return true
    return res.status === 404 ? false : null
  } catch {
    return null
  }
}

// ---- Lo que aporta cada artículo ----

export interface PostStats { slug: string; views: number; visitors: number; search_visitors: number; first_view: string }

export const MISSING_SEO_STATS_HINT = "Para ver las visitas desde Google por artículo, ejecuta supabase/2026-10_blog_seo.sql en Supabase."

/** Visitas por artículo y cuántas llegan desde buscadores (Google, Bing…) */
export async function postStats(days = 30): Promise<Map<string, PostStats>> {
  const { data, error } = await supabase.rpc("blog_post_stats", { days })
  if (error) throw new Error(error.code === "PGRST202" ? MISSING_SEO_STATS_HINT : error.message)
  return new Map(((data as PostStats[]) ?? []).map((r) => [r.slug, { ...r, views: Number(r.views), visitors: Number(r.visitors), search_visitors: Number(r.search_visitors) }]))
}
