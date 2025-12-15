# 🚀 Migración a GitHub Pages

## 📋 Pasos para configurar

### 1. Configurar GitHub Pages

1. Ve a tu repositorio en GitHub
2. **Settings** → **Pages**
3. En **Source**, selecciona: **GitHub Actions**
4. Guarda los cambios

### 2. Configurar Secrets

Ve a **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Añade estos secrets:

```
NEXT_PUBLIC_SUPABASE_URL=https://luzacvchtxkurisuywic.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[tu-anon-key]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=[tu-stripe-key]
```

**Nota:** Las URLs de los workers ya están configuradas en el workflow:
- Payment Intent: `https://stripe-payment-intent.onebrushes.workers.dev`
- Subscription: `https://stripe-subscription.onebrushes.workers.dev`

### 3. Desplegar Workers de Stripe en Cloudflare

Los workers ya están en `/workers/`:
- `stripe-payment-intent.js`
- `stripe-subscription.js`

**Desplegar cada worker:**

```bash
# Instalar Wrangler (CLI de Cloudflare)
npm install -g wrangler

# Login
wrangler login

# Desplegar payment intent
cd workers
wrangler deploy stripe-payment-intent.js --name stripe-payment-intent

# Desplegar subscription
wrangler deploy stripe-subscription.js --name stripe-subscription
```

**Copiar las URLs** que te da Cloudflare (ejemplo: `https://stripe-payment-intent.tu-usuario.workers.dev`)

### 4. Actualizar código para usar Workers

En los archivos que llaman a las funciones de Stripe, cambiar:

**Antes (Cloudflare Pages):**
```typescript
const response = await fetch('/api/create-payment-intent', {...})
```

**Después (Workers):**
```typescript
const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'https://stripe-payment-intent.tu-usuario.workers.dev'
const response = await fetch(workerUrl, {...})
```

### 5. Push y Deploy

```bash
git add .
git commit -m "feat: Configure for GitHub Pages deployment"
git push
```

El workflow de GitHub Actions se ejecutará automáticamente y desplegará en:
```
https://[tu-usuario].github.io/car-import-app/
```

---

## 🔧 Diferencias clave

| Aspecto | Cloudflare Pages | GitHub Pages |
|---------|-----------------|--------------|
| **Hosting** | Cloudflare CDN | GitHub CDN |
| **Functions** | Sí (integradas) | No (usar Workers externos) |
| **URL** | `car-import.pages.dev` | `onebrushes.github.io/car-import-app` |
| **Build** | Automático | GitHub Actions |
| **Timeout** | Menos probable | Menos probable (mejor DNS) |
| **basePath** | No necesario | `/car-import-app` |

---

## 🔄 **Compatibilidad con Cloudflare Pages**

**¡Buenas noticias!** La app sigue funcionando en Cloudflare Pages.

El `next.config.mjs` detecta automáticamente dónde se está desplegando:
- **Cloudflare Pages**: Sin `basePath` (dominio propio)
- **GitHub Pages**: Con `basePath: '/car-import-app'` (subdirectorio)

### Para seguir usando Cloudflare Pages:

1. **No hagas nada especial** - Ya está configurado
2. Cloudflare detecta automáticamente que `GITHUB_PAGES !== 'true'`
3. Usa el dominio normal: `car-import.pages.dev`

### Puedes tener AMBOS activos:

- **Cloudflare Pages**: `https://car-import.pages.dev` (principal)
- **GitHub Pages**: `https://onebrushes.github.io/car-import-app/` (backup)

---

## 📝 Notas importantes

1. **Workers separados**: Las funciones de Stripe deben estar en Cloudflare Workers
2. **CORS**: Asegúrate de que los workers permitan requests desde GitHub Pages
3. **Variables de entorno**: Configura los secrets en GitHub
4. **Primer deploy**: Puede tardar 5-10 minutos

---

## 🐛 Troubleshooting

### Error: "Failed to fetch"
- Verifica que `NEXT_PUBLIC_WORKER_URL` esté configurado
- Verifica CORS en los workers

### Error: "404 Not Found"
- Espera 5-10 minutos después del primer deploy
- Verifica que GitHub Pages esté habilitado

### Error: "Build failed"
- Verifica que todos los secrets estén configurados
- Revisa los logs en Actions → [tu workflow]
