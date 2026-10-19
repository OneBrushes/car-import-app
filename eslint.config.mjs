import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // Reglas nuevas muy estrictas que el código existente aún no cumple: avisan, no bloquean
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  { ignores: [".next/**", "out/**", "node_modules/**", "scripts/**", "next-env.d.ts"] },
]

export default config
