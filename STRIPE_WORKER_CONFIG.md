# 🔧 Configurar Worker de Stripe en Cloudflare

## ⚠️ **Problema actual:**
El worker `stripe-payment-intent.onebrushes.workers.dev` está desplegado pero **no tiene configurada la variable `STRIPE_SECRET_KEY`**.

## 📋 **Pasos para arreglar:**

### **1. Ve al Dashboard de Cloudflare Workers**
https://dash.cloudflare.com/workers

### **2. Selecciona el worker**
- Click en `stripe-payment-intent`

### **3. Configurar Variables de Entorno**
1. Click en **Settings** (pestaña superior)
2. Scroll hasta **Environment Variables**
3. Click en **Add variable**

**Añade esta variable:**
```
Name: STRIPE_SECRET_KEY
Value: sk_live_... (tu Stripe Secret Key)
Type: Secret (encrypted)
```

### **4. Repite para el otro worker**
- Selecciona `stripe-subscription`
- Añade la misma variable `STRIPE_SECRET_KEY`

### **5. Verifica que funcione**
Después de configurar, el worker debería funcionar correctamente.

---

## 🔑 **Dónde encontrar tu Stripe Secret Key:**

1. Ve a: https://dashboard.stripe.com/test/apikeys
2. Copia la **Secret key** (empieza con `sk_test_...` o `sk_live_...`)
3. **⚠️ IMPORTANTE:** Usa la clave de **LIVE** si estás en producción

---

## 🎯 **Alternativa: Desactivar Stripe temporalmente**

Si no vas a usar donaciones/subscripciones ahora, puedes:

1. Ir al **Admin Panel** de tu app
2. Pestaña **Seguridad**
3. Desactivar **Donaciones** y **Subscripciones**

Así el worker no se llamará y no habrá errores.

---

## ✅ **Verificar que funciona:**

Después de configurar la variable:
1. Ve a la pestaña de **Donaciones**
2. Intenta hacer una donación de prueba
3. No debería dar error 400

---

**Nota:** Los workers ya están desplegados, solo falta configurar las variables de entorno.
