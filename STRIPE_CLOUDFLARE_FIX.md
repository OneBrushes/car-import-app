# 🔧 Solución: Stripe no funciona en Cloudflare Pages

## ✅ Cambios realizados en el código:

He actualizado las API routes para usar la versión correcta de Stripe API.

## 📋 Pasos para que funcione en Cloudflare Pages:

### 1. Verificar variables de entorno en Cloudflare

Ve a tu proyecto en Cloudflare Pages:
1. **Settings** → **Environment variables**
2. Verifica que tienes estas variables:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_...` o `pk_live_...`
   - `STRIPE_SECRET_KEY` = `sk_test_...` o `sk_live_...`

⚠️ **IMPORTANTE**: 
- Las variables deben estar en **Production** Y **Preview**
- No debe haber espacios extra
- Deben empezar con `pk_` y `sk_`

### 2. Verificar Build Settings

En Cloudflare Pages → **Settings** → **Builds & deployments**:

- **Build command**: `npm run build` o `npx @cloudflare/next-on-pages@1`
- **Build output directory**: `.vercel/output/static`
- **Root directory**: `/` (raíz del proyecto)
- **Environment variables**: Node.js version = `18` o superior

### 3. Usar @cloudflare/next-on-pages

Cloudflare Pages necesita un adaptador especial para Next.js API routes.

**Opción A: Instalar el paquete**
```bash
npm install --save-dev @cloudflare/next-on-pages
```

Luego en `package.json`, cambia el build script:
```json
{
  "scripts": {
    "build": "npx @cloudflare/next-on-pages@1"
  }
}
```

**Opción B: Usar Vercel en su lugar**

Si Cloudflare Pages sigue dando problemas con las API routes, considera:
1. Desplegar en **Vercel** (funciona perfectamente con Next.js)
2. Mantener el frontend en Cloudflare y las API routes en Vercel

### 4. Verificar logs de despliegue

1. Ve a **Deployments** en Cloudflare Pages
2. Click en el último deployment
3. Ve a **Build logs**
4. Busca errores relacionados con Stripe o las API routes

### 5. Probar en local primero

Antes de desplegar, prueba que funciona en local:

```bash
# 1. Crea .env.local con tus claves
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_tu_clave
STRIPE_SECRET_KEY=sk_test_tu_clave_secreta

# 2. Instala dependencias
npm install

# 3. Ejecuta en desarrollo
npm run dev

# 4. Prueba en http://localhost:3000
```

Si funciona en local pero no en Cloudflare, el problema es la configuración de Cloudflare.

---

## 🔍 Diagnóstico del error

El error "Unexpected end of JSON input" significa que:

1. ❌ La API route no está respondiendo
2. ❌ La respuesta está vacía
3. ❌ Hay un error en el servidor

### Cómo verificar:

1. Abre la consola del navegador (F12)
2. Ve a la pestaña **Network**
3. Intenta hacer una donación
4. Busca la petición a `/api/create-payment-intent`
5. Mira la respuesta:
   - Si dice "404": La ruta no existe en Cloudflare
   - Si dice "500": Error del servidor (revisa variables de entorno)
   - Si está vacía: Cloudflare no está ejecutando las API routes

---

## 🚀 Solución recomendada:

### Opción 1: Usar Vercel (más fácil)

Vercel está hecho para Next.js y las API routes funcionan perfectamente:

1. Ve a https://vercel.com
2. Importa tu repositorio de GitHub
3. Añade las variables de entorno de Stripe
4. Despliega
5. ¡Funciona!

### Opción 2: Configurar Cloudflare correctamente

1. Instala `@cloudflare/next-on-pages`
2. Actualiza el build command
3. Redespliega
4. Cruza los dedos 🤞

---

## 📞 Siguiente paso:

1. **Verifica las variables** en Cloudflare Pages
2. **Mira los logs** de build
3. **Prueba en local** para confirmar que el código funciona
4. Si sigue sin funcionar, considera **migrar a Vercel**

---

¿Necesitas ayuda con alguno de estos pasos? 🚀
