// Genera los Workers de Cloudflare como un solo archivo JS cada uno (para pegar en el editor del Worker):
// workers/car-scrape.js (importación por URL) y workers/car-assistant.js (respuestas al vendedor con IA)
import { build } from "esbuild"

for (const name of ["car-scrape", "car-assistant"]) {
  await build({
    entryPoints: [`workers/src/${name}.ts`],
    outfile: `workers/${name}.js`,
    bundle: true,
    format: "esm",
    target: "es2022",
    // "browser": usa las versiones sin módulos de Node del SDK de Anthropic (el campo "browser" de su package.json)
    platform: "browser",
    conditions: ["worker", "browser"],
    banner: { js: `// Generado con \`npm run build:workers\` desde workers/src/${name}.ts. No editar a mano.` },
    // el del asistente lleva dentro el SDK de Anthropic: minificado para que sea manejable al pegarlo
    minify: name === "car-assistant",
    logLevel: "warning",
  })
  console.log(`ok workers/${name}.js`)
}
