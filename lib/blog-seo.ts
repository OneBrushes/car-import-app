// Nota SEO de un artículo (0-100): lo bien preparado que está para Google según las buenas prácticas habituales
// (título, descripción, palabra clave, longitud, estructura, imágenes, enlaces…). No es una medida de Google: lo que
// realmente aporta se ve en las visitas que llegan desde buscadores (blog_post_stats).
import { SITE_URL, type BlogPostInput } from "@/lib/blog"

export interface SeoCheck { label: string; ok: boolean; points: number; max: number; tip: string }
export interface SeoReport { score: number; checks: SeoCheck[]; keyword: string | null; words: number }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

/** ¿El texto contiene la palabra clave (la frase entera o, si no, todas sus palabras)? */
function hasKeyword(text: string, keyword: string) {
  const t = norm(text)
  const k = norm(keyword)
  if (t.includes(k)) return true
  const words = k.split(/[\s-]+/).filter((w) => w.length > 2)
  return words.length > 0 && words.every((w) => t.includes(w))
}

export function seoReport(post: Pick<BlogPostInput, "title" | "slug" | "excerpt" | "content" | "tags" | "seo_title" | "seo_description" | "cover_url" | "cover_alt">): SeoReport {
  const md = post.content ?? ""
  const body = md.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
  const words = body.replace(/[#>*_`|[\]()-]/g, " ").split(/\s+/).filter(Boolean).length
  const firstParagraph = md.split(/\n\s*\n/).find((p) => p.trim() && !/^\s*(#|!\[|>|\||[-*]\s)/.test(p)) ?? ""
  const description = (post.seo_description || post.excerpt || "").trim()
  const seoTitle = (post.seo_title || post.title || "").trim()
  const keyword = post.tags?.[0]?.trim() || null
  const h2 = (md.match(/^##\s+\S/gm) ?? []).length
  const images = [...md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)]
  const imagesWithAlt = images.filter((m) => m[1].trim().length >= 5).length
  const links = [...md.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)/g)].map((m) => m[1])
  const external = links.filter((h) => /^https?:\/\//.test(h) && !h.startsWith(SITE_URL)).length
  const internal = links.filter((h) => h.startsWith("/") || h.startsWith(SITE_URL)).length
  const hasFaq = /^##\s+preguntas frecuentes/im.test(norm(md))
  const hasTableOrList = /^\s*\|.+\|\s*$/m.test(md) || /^\s*([-*]|\d+\.)\s+\S/m.test(md)

  const c = (label: string, ok: boolean, max: number, tip: string, partial?: number): SeoCheck =>
    ({ label, ok, max, points: ok ? max : partial ?? 0, tip })

  const t = post.title.trim().length
  const d = description.length
  const checks: SeoCheck[] = [
    c("Título de 45 a 65 caracteres", t >= 45 && t <= 65, 10, `Ahora tiene ${t}. Google corta los títulos largos y los cortos atraen menos clics.`, t >= 30 && t <= 75 ? 5 : 0),
    c("Descripción para Google de 120 a 160 caracteres", d >= 120 && d <= 160, 10, `Ahora tiene ${d}. Es el texto gris que sale bajo el título en Google.`, d >= 80 && d <= 175 ? 5 : 0),
    c("Título para Google de 60 caracteres o menos", seoTitle.length > 0 && seoTitle.length <= 60, 5, `Ahora tiene ${seoTitle.length}.`),
    c("Palabra clave en el título", !!keyword && hasKeyword(post.title, keyword), 8, keyword ? `La palabra clave es la primera etiqueta: «${keyword}».` : "Añade etiquetas: la primera se usa como palabra clave."),
    c("Palabra clave en la descripción", !!keyword && hasKeyword(description, keyword), 5, "Google la resalta en negrita cuando coincide con la búsqueda."),
    c("Palabra clave en la dirección (slug)", !!keyword && hasKeyword(post.slug.replace(/-/g, " "), keyword), 4, "Una dirección corta con la palabra clave ayuda a posicionar."),
    c("Palabra clave en el primer párrafo", !!keyword && hasKeyword(firstParagraph, keyword), 5, "Responde a la búsqueda desde las primeras frases."),
    c("Artículo completo (1.500 palabras o más)", words >= 1500, 12, `Ahora tiene ${words.toLocaleString("es-ES")} palabras. Los artículos completos suelen posicionar mejor.`, words >= 900 ? 8 : words >= 600 ? 4 : 0),
    c("Al menos 4 apartados (##)", h2 >= 4, 8, `Ahora tiene ${h2}. Los apartados ayudan a Google a entender el artículo y salen en el índice.`, h2 >= 2 ? 4 : 0),
    c("Portada con descripción", !!post.cover_url && (post.cover_alt ?? "").trim().length >= 5, 8, "La portada sale en Google, Discover y al compartir; la descripción la lee Google.", post.cover_url ? 4 : 0),
    c("2 o más imágenes en el texto, con descripción", imagesWithAlt >= 2, 7, `Ahora tiene ${imagesWithAlt}. Las imágenes también traen visitas desde Google Imágenes.`, imagesWithAlt === 1 ? 3 : 0),
    c("2 o más enlaces a fuentes", external >= 2, 6, `Ahora tiene ${external}. Citar fuentes fiables da confianza a Google y al lector.`, external === 1 ? 3 : 0),
    c("Enlace a otra página de NorDrive", internal >= 1, 4, "Un enlace a otro artículo o a la web reparte autoridad entre tus páginas."),
    c("Preguntas frecuentes", hasFaq, 4, "Responden búsquedas concretas y pueden salir en «Otras preguntas de los usuarios»."),
    c("Tabla o lista", hasTableOrList, 4, "Facilitan la lectura y Google las usa en sus resultados destacados."),
  ]
  const score = Math.round(checks.reduce((s, x) => s + x.points, 0))
  return { score, checks, keyword, words }
}

export function seoTone(score: number) {
  return score >= 80 ? "bg-success/10 text-success" : score >= 55 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
}
