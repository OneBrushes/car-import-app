# 🚀 Configuración de Cloudflare Pages para API Routes

## ✅ Cambios realizados:

1. ✅ **Removido `output: 'export'`** de `next.config.mjs`
2. ✅ **Actualizado API routes** con versión correcta de Stripe
3. ✅ **Código listo** para desplegar

---

## 📋 Pasos para configurar Cloudflare Pages:

### 1. Configurar Build Settings en Cloudflare

Ve a tu proyecto en Cloudflare Pages → **Settings** → **Builds & deployments**

**Framework preset**: `Next.js`

**Build configuration**:
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Root directory**: `/` (dejar vacío)

**Environment variables** (Production):
```
NODE_VERSION = 20
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_tu_clave_aqui
STRIPE_SECRET_KEY = sk_live_tu_clave_secreta_aqui
NEXT_PUBLIC_SUPABASE_URL = https://jqwxhqzpwdxgvlxfbvkp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = tu_clave_supabase
```

⚠️ **IMPORTANTE**: Next.js 16 requiere Node.js 20 o superior

### 2. Añadir compatibilidad con Next.js 16

En **Settings** → **Functions** → **Compatibility flags**:

Añade:
```
nodejs_compat
```

### 3. Configurar Functions (API Routes)

En **Settings** → **Functions**:

- **Compatibility date**: `2024-11-01` o posterior
- **Node.js compatibility**: Activado ✅

### 4. Redesplegar

1. Ve a **Deployments**
2. Click en **Retry deployment** en el último deployment
3. O haz un nuevo push a GitHub para trigger un nuevo deploy

---

## ⚠️ IMPORTANTE: Limitaciones de Cloudflare Pages

Cloudflare Pages con Next.js 16 tiene limitaciones:

### ✅ Lo que SÍ funciona:
- Páginas estáticas
- Client-side rendering
- Imágenes
- CSS/JS

### ❌ Lo que puede NO funcionar:
- **API Routes** (necesita configuración especial)
- Server-side rendering (SSR)
- Incremental Static Regeneration (ISR)

---

## 🔧 Solución alternativa: Usar Vercel para API Routes

Si Cloudflare sigue dando problemas con las API routes:

### Opción 1: Todo en Vercel
1. Despliega todo en Vercel (más fácil)
2. Las API routes funcionan perfectamente
3. Configuración en 2 minutos

### Opción 2: Híbrido (Cloudflare + Vercel)
1. **Frontend** en Cloudflare Pages
2. **API Routes** en Vercel
3. Actualiza las URLs en el código

Para la opción híbrida, cambia en `donations-tab.tsx`:
```typescript
// En lugar de:
const endpoint = '/api/create-payment-intent'

// Usa:
const endpoint = 'https://tu-app.vercel.app/api/create-payment-intent'
```

---

## 🧪 Probar que funciona:

### En local:
```bash
npm run build
npm start
# Abre http://localhost:3000
# Prueba las donaciones
```

### En producción:
1. Despliega a Cloudflare
2. Abre la consola del navegador (F12)
3. Ve a Network
4. Intenta hacer una donación
5. Busca la petición a `/api/create-payment-intent`
6. Verifica que responde con un `clientSecret`

---

## 📊 Verificar en Cloudflare:

1. **Functions** → **Analytics**
   - Deberías ver invocaciones a `/api/create-payment-intent`
   
2. **Functions** → **Logs**
   - Busca errores en las API routes

---

## 🎯 Siguiente paso:

1. **Haz push** a GitHub (los cambios ya están listos)
2. **Espera** el deployment automático en Cloudflare
3. **Prueba** las donaciones en producción
4. Si no funciona, **revisa los logs** en Cloudflare

---

## 💡 Recomendación final:

Si después de seguir estos pasos las API routes siguen sin funcionar en Cloudflare Pages, te recomiendo **migrar a Vercel**:

- ✅ Funciona perfectamente con Next.js 16
- ✅ API routes funcionan sin configuración
- ✅ Deployment automático desde GitHub
- ✅ Gratis para proyectos personales

---

¿Listo para hacer push a GitHub? 🚀
