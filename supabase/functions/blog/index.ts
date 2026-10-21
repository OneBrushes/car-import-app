// Supabase Edge Function "blog": publica el blog en la web y recibe los artículos que escribe Claude.
//
// Despliegue: Supabase → Edge Functions → blog → "Code" → pegar este archivo → "Deploy".
// En la pestaña de la función → "Secrets" (o Edge Functions → Secrets) añadir:
//   GITHUB_TOKEN       token de GitHub (fine-grained) con acceso al repositorio de la web y permiso "Actions: Read and write"
//   GITHUB_REPO        OneBrushes/nordrive-landing           (opcional, es el valor por defecto)
//   BLOG_INGEST_TOKEN  una clave larga inventada: la usa la tarea de Claude para mandar artículos
//   PEXELS_API_KEY     (opcional) clave gratuita de https://www.pexels.com/api/ para tener también fotos de Pexels
// (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase.)
//
// Acciones (POST, JSON):
//   { action: "rebuild" }         → desde la app (sesión del equipo): vuelve a generar la web con los artículos publicados
//   { action: "titles" }          → desde la tarea de Claude (cabecera x-blog-token): títulos que ya existen
//   { action: "images", query }   → desde la tarea de Claude: busca fotos libres (Pexels, Wikimedia Commons, Openverse)
//                                   con su autor y licencia
//   { action: "ingest", post }    → desde la tarea de Claude: guarda un artículo nuevo. Copia la portada y las fotos del
//                                   texto al almacenamiento "blog" (así no dependen de otras webs).
//                                   También acepta gráficos hechos por Claude (SVG: infografías, tablas, esquemas) en
//                                   post.graphics = [{ name, svg }], citados en el texto como ![alt](grafico:name "pie").
//                                   Si en la app está activado "publicar automáticamente", se publica y se regenera la web;
//                                   si no, queda en borrador y avisa en la app para que lo revises.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_ORIGINS = ["https://app.nordrivecars.com", "http://localhost:3000"]
const STAFF_ROLES = ["gestor", "importador", "admin", "super_admin"]
const CATEGORIES = ["importacion", "noticias"]
const UA = "NorDriveBlog/1.0 (https://www.nordrivecars.com)"
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_INLINE_IMAGES = 10
const MAX_SVG_BYTES = 300 * 1024

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? ""
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-blog-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "articulo"

const readingMinutes = (md: string) => Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 220))

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()

/** Lanza el despliegue de la web (GitHub Actions → GitHub Pages) */
async function rebuildSite(): Promise<{ ok: boolean; message?: string }> {
  const token = Deno.env.get("GITHUB_TOKEN")
  const repo = Deno.env.get("GITHUB_REPO") || "OneBrushes/nordrive-landing"
  if (!token) return { ok: false, message: "Falta el secreto GITHUB_TOKEN en la función blog" }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pages.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nordrive-blog" },
    body: JSON.stringify({ ref: "master" }),
  })
  if (res.status === 204) return { ok: true }
  return { ok: false, message: `GitHub respondió ${res.status}: ${(await res.text()).slice(0, 200)}` }
}

// ---- Búsqueda de fotos libres ----------------------------------------------------------------------------------------

type ImageHit = {
  url: string          // foto grande (la que se usa en el artículo)
  thumb: string        // miniatura para elegir
  width: number
  height: number
  title: string
  author: string
  license: string
  source_page: string  // página original de la foto
  provider: "pexels" | "wikimedia" | "openverse"
  credit: string       // texto listo para el pie de foto
}

async function searchPexels(query: string, limit: number): Promise<ImageHit[]> {
  const key = Deno.env.get("PEXELS_API_KEY")
  if (!key) return []
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=landscape`, {
    headers: { Authorization: key }, signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.photos ?? []).map((p: any) => ({
    url: p.src?.large2x ?? p.src?.original, thumb: p.src?.medium, width: p.width, height: p.height,
    title: p.alt || "", author: p.photographer || "Pexels", license: "Licencia de Pexels", source_page: p.url,
    provider: "pexels", credit: `Foto: ${p.photographer || "Pexels"} / Pexels`,
  }))
}

async function searchWikimedia(query: string, limit: number): Promise<ImageHit[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: String(limit * 2), prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600",
    iiextmetadatafilter: "Artist|LicenseShortName|ObjectName",
  })
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) return []
  const pages = Object.values((await res.json()).query?.pages ?? {}) as any[]
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => ({ p, info: p.imageinfo?.[0] }))
    .filter(({ info }) => info && /^image\/(jpeg|png|webp)$/.test(info.mime) && info.width >= 1000 && info.width >= info.height)
    .slice(0, limit)
    .map(({ p, info }) => {
      const meta = info.extmetadata ?? {}
      const author = stripHtml(meta.Artist?.value ?? "").slice(0, 80) || "Wikimedia Commons"
      const license = stripHtml(meta.LicenseShortName?.value ?? "") || "Licencia libre"
      const thumb = String(info.thumburl || info.url)
      return {
        url: thumb, thumb: thumb.replace(/\/\d+px-/, "/400px-"), width: info.thumbwidth || info.width, height: info.thumbheight || info.height,
        title: stripHtml(meta.ObjectName?.value ?? "") || String(p.title).replace(/^File:/, "").replace(/\.\w+$/, ""),
        author, license, source_page: info.descriptionurl, provider: "wikimedia" as const,
        credit: `Foto: ${author} / Wikimedia Commons · ${license}`,
      }
    })
}

async function searchOpenverse(query: string, limit: number): Promise<ImageHit[]> {
  try {
    const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license_type=commercial&page_size=${limit}&mature=false`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? [])
      .filter((r: any) => r.url && /^https:/.test(r.url) && (!r.width || r.width >= 1000))
      .map((r: any) => {
        const license = r.license === "pdm" ? "Dominio público" : r.license === "cc0" ? "CC0" : `CC ${String(r.license).toUpperCase()} ${r.license_version ?? ""}`.trim()
        const author = r.creator || "Autor desconocido"
        const source = r.source ? r.source[0].toUpperCase() + r.source.slice(1) : "Openverse"
        return {
          url: r.url, thumb: r.thumbnail || r.url, width: r.width ?? 0, height: r.height ?? 0, title: r.title || "",
          author, license, source_page: r.foreign_landing_url || r.url, provider: "openverse" as const,
          credit: `Foto: ${author} / ${source} · ${license}`,
        }
      })
  } catch {
    return []
  }
}

async function searchImages(query: string, limit: number) {
  const settled = await Promise.allSettled([searchPexels(query, limit), searchWikimedia(query, limit), searchOpenverse(query, limit)])
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))
}

/** Copia una foto externa al bucket público "blog". Devuelve la URL nueva, o null si no se pudo. */
async function rehost(admin: SupabaseClient, src: string, path: string): Promise<string | null> {
  if (!/^https:\/\//i.test(src)) return null
  if (src.includes("/storage/v1/object/public/blog/")) return src // ya está en nuestro almacenamiento
  try {
    const res = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
    const ext = IMAGE_TYPES[type]
    if (!ext) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < 5_000 || bytes.byteLength > MAX_IMAGE_BYTES) return null
    const file = `${path}.${ext}`
    const { error } = await admin.storage.from("blog").upload(file, bytes, { contentType: type, upsert: true, cacheControl: "31536000" })
    if (error) return null
    return admin.storage.from("blog").getPublicUrl(file).data.publicUrl
  } catch {
    return null
  }
}

/** SVG hecho por Claude: solo dibujo (sin scripts, eventos, enlaces externos ni HTML incrustado) */
function safeSvg(svg: string): string | null {
  const s = svg.trim().replace(/^<\?xml[^>]*>\s*/i, "")
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return null
  if (new TextEncoder().encode(s).byteLength > MAX_SVG_BYTES) return null
  if (/<(script|foreignobject|iframe|embed|object|audio|video|use|style|a)[\s/>]/i.test(s)) return null
  if (/\son[a-z]+\s*=/i.test(s) || /javascript:|data:text|@import/i.test(s)) return null
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(s) || /url\(\s*["']?(?!#)/i.test(s)) return null
  return /xmlns=/.test(s) ? s : s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
}

async function uploadSvg(admin: SupabaseClient, svg: string, path: string): Promise<string | null> {
  const clean = safeSvg(svg)
  if (!clean) return null
  const file = `${path}.svg`
  const { error } = await admin.storage.from("blog").upload(file, new TextEncoder().encode(clean), { contentType: "image/svg+xml", upsert: true, cacheControl: "31536000" })
  if (error) return null
  return admin.storage.from("blog").getPublicUrl(file).data.publicUrl
}

/** Copia las fotos del Markdown (![alt](url "crédito")) y cambia sus direcciones. Las que no se copian se quitan. */
async function rehostInline(admin: SupabaseClient, md: string, folder: string, graphics: Map<string, string>) {
  const re = /!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)/g
  const found = [...md.matchAll(re)]
  let copied = 0
  let out = md
  for (const [i, m] of found.entries()) {
    const [whole, alt, url, title] = m
    const graphic = url.startsWith("grafico:") ? graphics.get(url.slice(8)) : undefined
    const hosted = i >= MAX_INLINE_IMAGES ? null
      : graphic !== undefined ? await uploadSvg(admin, graphic, `${folder}/grafico-${i + 1}`)
      : await rehost(admin, url, `${folder}/foto-${i + 1}`)
    if (hosted) copied++
    const replacement = hosted ? `![${alt}](${hosted}${title ? ` "${title.replace(/"/g, "'")}"` : ""})` : ""
    out = out.replace(whole, replacement)
  }
  return { content: out.replace(/\n{3,}/g, "\n\n"), total: found.length, copied }
}

// ---------------------------------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  const headers = cors(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })

  if (req.method === "OPTIONS") return new Response("ok", { headers })
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: "Petición no válida" }, 400)
  }

  // ---- Desde la app: regenerar la web ----
  if (body.action === "rebuild") {
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: "Sesión no válida" }, 401)
    const { data: me } = await asUser.from("profiles").select("role").eq("id", user.id).single()
    if (!me || !STAFF_ROLES.includes(me.role)) return json({ error: "Sin permiso" }, 403)
    const r = await rebuildSite()
    return r.ok ? json({ status: "rebuilding" }) : json({ error: r.message }, 502)
  }

  // ---- A partir de aquí, solo la tarea de Claude ----
  const expected = Deno.env.get("BLOG_INGEST_TOKEN")
  if (!["titles", "images", "ingest"].includes(body.action)) return json({ error: "Acción no válida" }, 400)
  if (!expected || req.headers.get("x-blog-token") !== expected) return json({ error: "Clave no válida" }, 401)

  // Qué artículos hay ya (también borradores), para no repetir temas
  if (body.action === "titles") {
    const { data, error } = await admin.from("blog_posts").select("title, slug, tags, category, status, created_at")
      .order("created_at", { ascending: false }).limit(200)
    if (error) return json({ error: "No se pudieron leer los artículos: " + error.message }, 500)
    return json({ posts: data ?? [] })
  }

  // Fotos libres para el artículo
  if (body.action === "images") {
    const query = String(body.query ?? "").trim().slice(0, 120)
    if (query.length < 2) return json({ error: "Falta query" }, 400)
    const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 12)
    return json({ images: await searchImages(query, limit) })
  }

  // Nuevo artículo
  const p = body.post ?? {}
  const title = String(p.title ?? "").trim().slice(0, 160)
  const rawContent = String(p.content ?? "").trim()
  if (title.length < 10 || rawContent.length < 800) return json({ error: "Artículo incompleto (título o contenido demasiado cortos)" }, 400)
  const category = CATEGORIES.includes(p.category) ? p.category : "importacion"

  // slug único
  let slug = slugify(String(p.slug ?? title))
  for (let i = 2; i < 50; i++) {
    const { data } = await admin.from("blog_posts").select("id").eq("slug", slug).maybeSingle()
    if (!data) break
    slug = `${slugify(String(p.slug ?? title)).slice(0, 74)}-${i}`
  }

  // fotos: portada y las del texto, copiadas a nuestro almacenamiento
  const folder = `posts/${new Date().toISOString().slice(0, 10)}-${slug}`
  const coverSource = typeof p.cover_url === "string" ? p.cover_url : typeof p.cover?.url === "string" ? p.cover.url : ""
  const coverUrl = coverSource ? (await rehost(admin, coverSource, `${folder}/portada`)) ?? (/^https:\/\//.test(coverSource) ? coverSource : null) : null
  const graphics = new Map<string, string>(
    (Array.isArray(p.graphics) ? p.graphics : [])
      .filter((g: any) => g && typeof g.name === "string" && typeof g.svg === "string")
      .map((g: any) => [g.name.trim(), g.svg] as [string, string]),
  )
  const inline = await rehostInline(admin, rawContent, folder, graphics)

  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "blog_auto_publish").maybeSingle()
  const autoPublish = setting?.value === true
  const row = {
    slug,
    title,
    category,
    excerpt: String(p.excerpt ?? "").trim().slice(0, 300),
    content: inline.content,
    tags: Array.isArray(p.tags) ? p.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : [],
    seo_title: p.seo_title ? String(p.seo_title).slice(0, 70) : null,
    seo_description: p.seo_description ? String(p.seo_description).slice(0, 170) : null,
    cover_url: coverUrl,
    cover_alt: String(p.cover_alt ?? p.cover?.alt ?? "").slice(0, 160) || null,
    cover_credit: String(p.cover_credit ?? p.cover?.credit ?? "").slice(0, 200) || null,
    source: "claude",
    reading_minutes: readingMinutes(inline.content),
    status: autoPublish ? "published" : "draft",
    published_at: autoPublish ? new Date().toISOString() : null,
    created_by: null,
  }
  const { data: saved, error } = await admin.from("blog_posts").insert(row).select("id, slug, status").single()
  if (error) return json({ error: "No se pudo guardar: " + error.message }, 500)

  // aviso en la app a los administradores
  const { data: admins } = await admin.from("profiles").select("id").in("role", ["admin", "super_admin"])
  if (admins?.length) {
    const kind = category === "noticias" ? "una noticia" : "un artículo"
    await admin.from("notifications").insert(admins.map((a: { id: string }) => ({
      user_id: a.id,
      type: "blog_post",
      title: autoPublish ? `Claude ha publicado ${kind} en el blog` : `Claude ha escrito ${kind} para el blog`,
      message: autoPublish ? title : `${title} · revísalo y pulsa «Subir» en la pestaña Blog`,
      link: null,
      metadata: { blog_post_id: saved.id, slug: saved.slug },
    })))
  }

  const rebuild = autoPublish ? await rebuildSite() : { ok: true }
  return json({
    status: saved.status,
    slug: saved.slug,
    category,
    cover: coverUrl ? (coverUrl === coverSource ? "enlace original (no se pudo copiar)" : "copiada") : "sin portada",
    images: `${inline.copied}/${inline.total} imágenes del texto guardadas (las que no se pudieron guardar se han quitado)`,
    rebuild: rebuild.ok ? "ok" : rebuild.message,
  })
})
