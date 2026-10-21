// Supabase Edge Function "blog": publica el blog en la web y recibe los artículos que escribe Claude.
//
// Despliegue: Supabase → Edge Functions → "Deploy a new function" → "Via Editor", nombre blog, pegar este archivo.
// En la pestaña de la función → "Secrets" (o Edge Functions → Secrets) añadir:
//   GITHUB_TOKEN       token de GitHub (fine-grained) con acceso al repositorio de la web y permiso "Actions: Read and write"
//   GITHUB_REPO        OneBrushes/nordrive-landing           (opcional, es el valor por defecto)
//   BLOG_INGEST_TOKEN  una clave larga inventada: la usa la tarea de Claude para mandar artículos
// (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase.)
//
// Acciones (POST, JSON):
//   { action: "rebuild" }      → desde la app (sesión del equipo): vuelve a generar la web con los artículos publicados
//   { action: "titles" }       → desde la tarea de Claude (cabecera x-blog-token): títulos que ya existen
//   { action: "ingest", post } → desde la tarea de Claude (cabecera x-blog-token): guarda un artículo nuevo.
//                                Si en la app está activado "publicar automáticamente", se publica y se regenera la web;
//                                si no, queda en borrador y avisa en la app para que lo revises.
import { createClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_ORIGINS = ["https://app.nordrivecars.com", "http://localhost:3000"]
const STAFF_ROLES = ["gestor", "importador", "admin", "super_admin"]

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

  // ---- Desde la tarea de Claude: qué artículos hay ya (también borradores), para no repetir temas ----
  if (body.action === "titles") {
    const expected = Deno.env.get("BLOG_INGEST_TOKEN")
    if (!expected || req.headers.get("x-blog-token") !== expected) return json({ error: "Clave no válida" }, 401)
    const { data } = await admin.from("blog_posts").select("title, slug, tags, status, created_at").order("created_at", { ascending: false }).limit(200)
    return json({ posts: data ?? [] })
  }

  // ---- Desde la tarea de Claude: nuevo artículo ----
  if (body.action === "ingest") {
    const expected = Deno.env.get("BLOG_INGEST_TOKEN")
    if (!expected || req.headers.get("x-blog-token") !== expected) return json({ error: "Clave no válida" }, 401)

    const p = body.post ?? {}
    const title = String(p.title ?? "").trim().slice(0, 160)
    const content = String(p.content ?? "").trim()
    if (title.length < 10 || content.length < 800) return json({ error: "Artículo incompleto (título o contenido demasiado cortos)" }, 400)

    // slug único
    let slug = slugify(String(p.slug ?? title))
    for (let i = 2; i < 50; i++) {
      const { data } = await admin.from("blog_posts").select("id").eq("slug", slug).maybeSingle()
      if (!data) break
      slug = `${slugify(String(p.slug ?? title)).slice(0, 74)}-${i}`
    }

    const { data: setting } = await admin.from("app_settings").select("value").eq("key", "blog_auto_publish").maybeSingle()
    const autoPublish = setting?.value === true
    const row = {
      slug,
      title,
      excerpt: String(p.excerpt ?? "").trim().slice(0, 300),
      content,
      tags: Array.isArray(p.tags) ? p.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : [],
      seo_title: p.seo_title ? String(p.seo_title).slice(0, 70) : null,
      seo_description: p.seo_description ? String(p.seo_description).slice(0, 170) : null,
      cover_url: typeof p.cover_url === "string" && /^https:\/\//.test(p.cover_url) ? p.cover_url : null,
      cover_alt: p.cover_alt ? String(p.cover_alt).slice(0, 160) : null,
      source: "claude",
      reading_minutes: readingMinutes(content),
      status: autoPublish ? "published" : "draft",
      published_at: autoPublish ? new Date().toISOString() : null,
      created_by: null,
    }
    const { data: saved, error } = await admin.from("blog_posts").insert(row).select("id, slug, status").single()
    if (error) return json({ error: "No se pudo guardar: " + error.message }, 500)

    // aviso en la app a los administradores
    const { data: admins } = await admin.from("profiles").select("id").in("role", ["admin", "super_admin"])
    if (admins?.length) {
      await admin.from("notifications").insert(admins.map((a: { id: string }) => ({
        user_id: a.id,
        type: "blog_post",
        title: autoPublish ? "Claude ha publicado un artículo en el blog" : "Claude ha escrito un artículo para el blog",
        message: autoPublish ? title : `${title} · revísalo y pulsa «Subir» en la pestaña Blog`,
        link: null,
        metadata: { blog_post_id: saved.id, slug: saved.slug },
      })))
    }

    const rebuild = autoPublish ? await rebuildSite() : { ok: true }
    return json({ status: saved.status, slug: saved.slug, rebuild: rebuild.ok ? "ok" : rebuild.message })
  }

  return json({ error: "Acción no válida" }, 400)
})
