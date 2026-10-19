import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    // valores de relleno: los tests no hablan con Supabase, pero el cliente los pide al importarse
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" },
  },
})
