// Capturas del garaje virtual con datos de ejemplo (?demo=1, solo en `npm run dev`).
// Uso: node scripts/garage-screenshots.mjs [salida] [url] [carpeta-de-referencias]
// Si se indica la carpeta de referencias, además monta cada captura al lado de su imagen de referencia.
import { chromium } from "@playwright/test"
import path from "node:path"
import fs from "node:fs"

const out = process.argv[2] || "screenshots"
const base = process.argv[3] || "http://localhost:3000"
const refs = process.argv[4] || null
fs.mkdirSync(out, { recursive: true })

const DESKTOP = { width: 1600, height: 900 }
const shots = [
  { name: "garaje-entero-dia", viewport: DESKTOP, query: "&hora=13:00" },
  { name: "garaje-entero-noche", viewport: DESKTOP, query: "&hora=23:30" },
  // zoom a las mesas y la gente (como la referencia 2)
  { name: "garaje-mesas", viewport: DESKTOP, query: "&hora=13:00", camera: () => ({ x: -170, y: -10, w: 520, h: 292 }) },
  // zoom al parking
  { name: "garaje-parking", viewport: DESKTOP, query: "&hora=13:00", camera: () => ({ x: -1040, y: 296, w: 760, h: 428 }) },
  { name: "garaje-coches", viewport: DESKTOP, query: "&hora=13:00", camera: () => ({ x: -880, y: 330, w: 420, h: 236 }) },
  { name: "garaje-movil-dia", viewport: { width: 390, height: 844 }, query: "&hora=13:00", mobile: true },
  { name: "garaje-movil-noche", viewport: { width: 390, height: 844 }, query: "&hora=23:30", mobile: true },
]

const browser = await chromium.launch()
for (const shot of shots) {
  const context = await browser.newContext({ viewport: shot.viewport, isMobile: !!shot.mobile, deviceScaleFactor: shot.mobile ? 2 : 1 })
  const page = await context.newPage()
  page.on("pageerror", (e) => console.error(`[${shot.name}] error:`, e.message))
  await page.goto(`${base}/garage?demo=1${shot.query}`, { waitUntil: "networkidle" })
  if (shot.camera) {
    await page.evaluate((c) => sessionStorage.setItem("garage-camera", JSON.stringify(c)), shot.camera())
    await page.reload({ waitUntil: "networkidle" })
  }
  await page.waitForSelector("svg[role=img]")
  await page.waitForTimeout(1800)
  const file = path.join(out, `${shot.name}.png`)
  await page.screenshot({ path: file })
  console.log("ok", file)
  await context.close()
}

// Comparativa lado a lado con las imágenes de referencia
if (refs) {
  const pairs = [
    ["1-oficina-entera-dia.png", "garaje-entero-dia.png", "comparativa-1-entero.png"],
    ["2-detalle-mesas-personas.png", "garaje-mesas.png", "comparativa-2-mesas.png"],
    ["4-oficina-noche.png", "garaje-entero-noche.png", "comparativa-4-noche.png"],
    ["3-detalle-cocina-objetos.png", "garaje-parking.png", "comparativa-3-parking.png"],
  ]
  const page = await (await browser.newContext({ viewport: { width: 3200, height: 960 } })).newPage()
  for (const [ref, mine, name] of pairs) {
    const a = "data:image/png;base64," + fs.readFileSync(path.join(refs, ref)).toString("base64")
    const b = "data:image/png;base64," + fs.readFileSync(path.join(out, mine)).toString("base64")
    await page.setContent(`<body style="margin:0;display:flex;gap:0;background:#111;font:600 20px system-ui;color:#fff">
      <figure style="margin:0;width:1600px"><img src="${a}" style="width:1600px;height:900px;object-fit:cover"><figcaption style="padding:8px">Referencia · ${ref}</figcaption></figure>
      <figure style="margin:0;width:1600px"><img src="${b}" style="width:1600px;height:900px;object-fit:cover"><figcaption style="padding:8px">NorDrive · ${mine}</figcaption></figure></body>`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(out, name) })
    console.log("ok", name)
  }
}
await browser.close()
