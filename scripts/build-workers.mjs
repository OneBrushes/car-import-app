// Genera los Workers de Cloudflare como un solo archivo JS cada uno (para pegar en el editor del Worker):
// workers/car-scrape.js (importación por URL)
import { build } from "esbuild"

for (const name of ["car-scrape"]) {
  await build({
    entryPoints: [`workers/src/${name}.ts`],
    outfile: `workers/${name}.js`,
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    conditions: ["worker", "browser"],
    banner: { js: `// Generado con \`npm run build:workers\` desde workers/src/${name}.ts. No editar a mano.` },
    logLevel: "warning",
  })
  console.log(`ok workers/${name}.js`)
}
