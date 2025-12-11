# 🔧 SOLUCIÓN RÁPIDA: Error de Node.js en Cloudflare

## ❌ Error:
```
You are using Node.js 18.20.8. For Next.js, Node.js version ">=20.9.0" is required.
Failed: build command exited with code: 1
```

## ✅ Solución:

### Paso 1: Actualizar NODE_VERSION en Cloudflare

1. **Ve a Cloudflare Pages** → Tu proyecto
2. **Settings** → **Environment variables**
3. **Añade o modifica** la variable:

```
Variable name: NODE_VERSION
Value: 20
```

4. **Aplica** a **Production** y **Preview**
5. **Save**

### Paso 2: Redesplegar

1. **Ve a Deployments**
2. **Click en "Retry deployment"** en el deployment fallido
3. **Espera** 2-5 minutos

---

## 📋 Variables de entorno completas:

Asegúrate de tener todas estas en **Production**:

```
NODE_VERSION = 20
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...
STRIPE_SECRET_KEY = sk_live_...
NEXT_PUBLIC_SUPABASE_URL = https://jqwxhqzpwdxgvlxfbvkp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## ✅ Verificar que funciona:

Después del deployment:
1. El build debería completarse sin errores
2. La app debería estar disponible
3. Prueba las donaciones con Stripe

---

¡Listo! Con NODE_VERSION = 20 debería funcionar perfectamente. 🚀
