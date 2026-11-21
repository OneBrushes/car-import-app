# nordrive-mcp · servidor MCP de «Guardados por Claude»

Worker de Cloudflare que permite a Claude (claude.ai) guardar coches de Alemania en la pestaña
**Guardados por Claude** de la app. El coste en España y el beneficio salen de `lib/import-costs.ts`
(la misma función que la Calculadora), que el Worker importa directamente.

- Endpoint MCP: `https://<tu-worker>/mcp` (Streamable HTTP, sin sesión)
- Autenticación: OAuth 2.1 (claude.ai se registra solo y tú autorizas escribiendo `MCP_SECRET` una vez).
  Además acepta `Authorization: Bearer <MCP_SECRET>` para el MCP Inspector.
- Herramientas: `guardar_coche`, `listar_coches`, `actualizar_coche`, `borrar_coche`.
- Solo toca las tablas `coches_claude` y `mcp_logs` (más la lectura de `mcp_config` y `company_settings`). Nunca `imported_cars`.

## Despliegue (una vez)

1. **Supabase**: abre `supabase/2026-11_coches_claude.sql`, cambia `TU_EMAIL@EJEMPLO.COM` por tu email
   y ejecútalo en Supabase → SQL Editor.
2. **Instalar e iniciar sesión en Cloudflare** (desde la raíz del repo):
   ```sh
   cd workers/nordrive-mcp
   npm install
   npx wrangler login
   ```
3. **KV para OAuth**:
   ```sh
   npx wrangler kv namespace create OAUTH_KV
   ```
   Copia el `id` que te da y pégalo en `wrangler.toml` (`CAMBIAR_POR_EL_ID_DEL_KV`).
4. **Secretos**:
   ```sh
   # clave larga aleatoria (guárdala en tu gestor de contraseñas)
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   npx wrangler secret put MCP_SECRET
   # Supabase → Project Settings → API → service_role (secreta, nunca en la app)
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
5. **Primer despliegue**: `npx wrangler deploy`. Al final muestra la URL, p. ej.
   `https://nordrive-mcp.<subdominio>.workers.dev`. Comprueba que coincide con `wrangler.toml` → `PUBLIC_URL` (ya puesta: `https://nordrive-mcp.infonordrive.workers.dev`)
   (sin barra final) y vuelve a desplegar: `npx wrangler deploy`.
   - Con dominio propio: Cloudflare → Workers → nordrive-mcp → Settings → Domains → `mcp.nordrivecars.com`,
     y entonces `PUBLIC_URL = "https://mcp.nordrivecars.com"`.

## Conectar claude.ai

claude.ai → Settings → Connectors → **Add custom connector**
- Nombre: `NorDrive coches`
- URL: `https://<tu-worker>/mcp`

Al conectar se abre la pantalla de NorDrive: escribe `MCP_SECRET` y pulsa **Permitir**.

## Probar con el MCP Inspector

```sh
npx @modelcontextprotocol/inspector
```
- Transport Type: **Streamable HTTP**
- URL: `https://<tu-worker>/mcp`
- Authentication → Header `Authorization` = `Bearer <MCP_SECRET>` (o usa el flujo OAuth del Inspector)
- Connect → Tools → List Tools → `guardar_coche` con por ejemplo:
  `{"url":"https://suchen.mobile.de/fahrzeuge/details.html?id=123","marca":"Volkswagen","modelo":"Golf","version":"R","anio":2022,"mes_matriculacion":2,"km":40000,"co2":178,"precio_alemania":32000,"valor_hacienda":39000,"precio_venta_estimado_espana":40000}`

Prueba rápida sin Inspector:
```sh
curl -s -X POST https://<tu-worker>/mcp -H "Authorization: Bearer $MCP_SECRET" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Registro

Cada llamada queda en la tabla `mcp_logs` (botón **Registro** de la pestaña) y en los logs del Worker:
`npx wrangler tail`.

## Desarrollo local

Crea `.dev.vars` (no se sube a git) con `MCP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_URL=http://localhost:8787`
y `SUPABASE_URL`, y ejecuta `npm run dev`.
