// Genera workers/car-scrape.js (un solo archivo JS para pegar en el editor del Worker de Cloudflare)
import { build } from "esbuild"

await build({
  entryPoints: ["workers/src/car-scrape.ts"],
  outfile: "workers/car-scrape.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  banner: { js: "// Generado con `npm run build:scrape-worker` desde workers/src/car-scrape.ts. No editar a mano." },
})
console.log("ok workers/car-scrape.js")
