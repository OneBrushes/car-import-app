// Comprueba en un navegador de verdad el visor de fotos de "Guardados por Claude" (components/photo-viewer.tsx)
// con las fotos reales del Mercedes CLA (lib/__fixtures__/coche-cla-fotos.json):
//  - abre en la 1/15, avanza con el botón y con la flecha, retrocede, y cierra con Esc y con la X.
// Regresión del bug "no avanza de la 1/15": la librería volvía a la primera foto en cada render.
//
// Uso: npm run check:visor   (necesita conexión: carga las fotos de Supabase Storage)
import { build } from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { chromium } from "@playwright/test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nordrive-visor-"))

fs.writeFileSync(path.join(dir, "entry.tsx"), `
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { PhotoViewer } from "@/components/photo-viewer"
import cla from "@/lib/__fixtures__/coche-cla-fotos.json"
import "@/app/globals.css"
function App() {
  const [index, setIndex] = useState<number | null>(null)
  // Igual que en la app: el padre se vuelve a pintar con un array de fotos nuevo (mismo contenido)
  const [, setTick] = useState(0)
  return (<div>
    <button id="abrir" onClick={() => setIndex(0)}>Abrir</button>
    <button id="repintar" onClick={() => setTick(t => t + 1)}>Repintar</button>
    <span id="estado">{index == null ? "cerrado" : "abierto"}</span>
    <PhotoViewer photos={[...cla.fotos]} open={index != null} index={index ?? 0} onClose={() => setIndex(null)} mainPhoto={cla.foto_url} onSetMain={() => {}} title="CLA" />
  </div>)
}
createRoot(document.getElementById("root")).render(<App />)
`)
fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="out.css"></head><body><div id="root"></div><script src="out.js"></script></body></html>`)

const tw = {
  name: "tailwind",
  setup(b) {
    b.onLoad({ filter: /globals\.css$/ }, async args => {
      const result = await postcss([tailwind({ base: root })]).process(fs.readFileSync(args.path, "utf8"), { from: args.path })
      return { contents: result.css, loader: "css" }
    })
  },
}
await build({
  entryPoints: [path.join(dir, "entry.tsx")], bundle: true, outfile: path.join(dir, "out.js"), jsx: "automatic",
  alias: { "@": root }, define: { "process.env.NODE_ENV": '"production"' }, plugins: [tw], nodePaths: [path.join(root, "node_modules")], logLevel: "error",
})

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on("pageerror", e => errors.push(e.message))
await page.goto(pathToFileURL(path.join(dir, "index.html")).href)
const counter = () => page.evaluate(() => document.querySelector(".yarl__counter")?.textContent?.replace(/\s/g, "") ?? null)
const wait = () => page.waitForTimeout(700)
let failed = 0
const expectEq = async (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : ` (esperado ${expected})`}`)
}

await page.click("#abrir"); await wait()
await expectEq("abre en la primera", await counter(), "1/15")
await page.click("button[aria-label='Siguiente']"); await wait()
await expectEq("botón siguiente", await counter(), "2/15")
await page.keyboard.press("ArrowRight"); await wait()
await expectEq("flecha derecha", await counter(), "3/15")
await page.click("button[aria-label='Anterior']"); await wait()
await expectEq("botón anterior", await counter(), "2/15")
const visibles = await page.evaluate(() => [...document.querySelectorAll(".yarl__slide_image")].filter(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().height > 100).length)
await expectEq("hay fotos cargadas y visibles", visibles > 0, true)
await page.keyboard.press("Escape"); await wait()
await expectEq("Esc cierra", await page.textContent("#estado"), "cerrado")
await page.click("#abrir"); await wait()
await page.click("button[aria-label='Cerrar']"); await wait()
await expectEq("la X cierra", await page.textContent("#estado"), "cerrado")
await expectEq("sin errores en la página", errors.length, 0)

await browser.close()
fs.rmSync(dir, { recursive: true, force: true })
if (failed) { console.error(`\n${failed} comprobación(es) fallida(s)`); process.exit(1) }
console.log("\nVisor OK")
