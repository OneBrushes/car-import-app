# 🚀 Guía: Desplegar Cloudflare Workers para Stripe

## 📋 Pasos para desplegar:

### 1. Ir al Dashboard de Cloudflare Workers

1. Ve a: https://dash.cloudflare.com/
2. Selecciona tu cuenta
3. En el menú lateral, click en **Workers & Pages**
4. Click en **Create application**
5. Click en **Create Worker**

---

### 2. Crear Worker para Payment Intent

1. **Nombre del Worker**: `stripe-payment-intent`
2. Click en **Deploy**
3. Click en **Edit code**
4. **Borra todo** el código que aparece
5. **Copia y pega** el contenido de `workers/stripe-payment-intent.js`
6. Click en **Save and Deploy**

---

### 3. Configurar variables de entorno (Payment Intent)

1. En la página del Worker, ve a **Settings**
2. Scroll hasta **Environment Variables**
3. Click en **Add variable**
4. Añade:
   - **Variable name**: `STRIPE_SECRET_KEY`
   - **Value**: `sk_test_...` (tu clave secreta de Stripe)
   - **Type**: Secret (encrypted)
5. Click en **Save**

---

### 4. Crear Worker para Subscription

1. Vuelve a **Workers & Pages**
2. Click en **Create application** → **Create Worker**
3. **Nombre del Worker**: `stripe-subscription`
4. Click en **Deploy**
5. Click en **Edit code**
6. **Borra todo** el código
7. **Copia y pega** el contenido de `workers/stripe-subscription.js`
8. Click en **Save and Deploy**

---

### 5. Configurar variables de entorno (Subscription)

1. En la página del Worker, ve a **Settings**
2. **Environment Variables** → **Add variable**
3. Añade:
   - **Variable name**: `STRIPE_SECRET_KEY`
   - **Value**: `sk_test_...` (la misma clave)
   - **Type**: Secret
4. Click en **Save**

---

### 6. Obtener las URLs de los Workers

Después de desplegar, obtendrás 2 URLs:

1. **Payment Intent**: `https://stripe-payment-intent.TU-USUARIO.workers.dev`
2. **Subscription**: `https://stripe-subscription.TU-USUARIO.workers.dev`

**Copia estas URLs**, las necesitarás en el siguiente paso.

---

### 7. Actualizar el código del frontend

Abre `components/tabs/donations-tab.tsx` y cambia las líneas 51:

**Antes:**
```typescript
const endpoint = isMonthly ? '/api/create-subscription' : '/api/create-payment-intent'
```

**Después:**
```typescript
const endpoint = isMonthly 
  ? 'https://stripe-subscription.TU-USUARIO.workers.dev'
  : 'https://stripe-payment-intent.TU-USUARIO.workers.dev'
```

Reemplaza `TU-USUARIO` con tu nombre de usuario de Cloudflare Workers.

---

### 8. Hacer commit y push

```bash
git add .
git commit -m "feat: Use Cloudflare Workers for Stripe"
git push
```

---

## 🧪 Probar que funciona:

1. **Espera** el deployment en Cloudflare Pages
2. **Abre** tu app
3. **Ve a Donaciones**
4. **Selecciona 5€**
5. **Click en "Donar"**
6. **Deberías ver** el formulario de Stripe con los campos de tarjeta
7. **El botón** debería cambiar de "Cargando..." a "Pagar ahora"

---

## ✅ Verificar que los Workers funcionan:

Puedes probar los Workers directamente con `curl`:

```bash
# Probar Payment Intent
curl -X POST https://stripe-payment-intent.TU-USUARIO.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"amount": 5}'

# Debería devolver:
# {"clientSecret":"pi_xxx_secret_xxx"}
```

---

## 🔍 Si sigue sin funcionar:

### Verificar logs del Worker:
1. Ve al Worker en Cloudflare
2. Click en **Logs** (en el menú superior)
3. Haz una petición desde la app
4. Verás los logs en tiempo real

### Verificar CORS:
Los Workers ya tienen CORS configurado (`Access-Control-Allow-Origin: *`)

### Verificar la clave de Stripe:
1. Ve a https://dashboard.stripe.com/test/apikeys
2. Verifica que la clave empieza con `sk_test_`
3. Copia la clave completa (incluye el prefijo)

---

## 💡 Ventajas de Cloudflare Workers:

✅ Se ejecutan en el edge (muy rápido)
✅ Escalado automático
✅ Sin límites de tiempo de ejecución
✅ Funciona perfectamente con Stripe API
✅ Gratis hasta 100,000 requests/día

---

¡Listo! Sigue estos pasos y Stripe debería funcionar perfectamente. 🎉
