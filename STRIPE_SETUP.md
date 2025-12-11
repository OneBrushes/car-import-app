# 🔐 Guía de Configuración de Stripe

## 📋 Pasos para vincular tu cuenta de Stripe

### 1. Obtener las claves de API de Stripe

1. **Inicia sesión** en tu cuenta de Stripe: https://dashboard.stripe.com/
2. **Ve a Developers** → **API keys**
3. Verás dos claves:
   - **Publishable key** (Clave pública) - Empieza con `pk_test_` o `pk_live_`
   - **Secret key** (Clave secreta) - Empieza con `sk_test_` o `sk_live_`

### 2. Configurar variables de entorno

1. **Crea un archivo `.env.local`** en la raíz del proyecto (si no existe)
2. **Añade tus claves** de Stripe:

```env
# Stripe Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_tu_clave_publica_aqui
STRIPE_SECRET_KEY=sk_test_tu_clave_secreta_aqui
```

⚠️ **IMPORTANTE**: 
- Usa claves de **TEST** (`pk_test_` y `sk_test_`) para desarrollo
- Usa claves de **LIVE** (`pk_live_` y `sk_live_`) solo en producción
- **NUNCA** compartas tu `STRIPE_SECRET_KEY` públicamente

### 3. Configurar en Cloudflare Pages (Producción)

1. Ve a tu proyecto en **Cloudflare Pages**
2. **Settings** → **Environment variables**
3. Añade las mismas variables:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
   - `STRIPE_SECRET_KEY` = `sk_live_...`

### 4. Reiniciar el servidor de desarrollo

```bash
# Detén el servidor (Ctrl+C)
# Inicia de nuevo
npm run dev
```

---

## ✅ Verificar que funciona

1. Ve a la pestaña **"Donaciones"** en tu app
2. Selecciona una cantidad (ej: 5€)
3. Click en **"Donar"**
4. Deberías ver el formulario de pago de Stripe
5. Usa una **tarjeta de prueba**:
   - Número: `4242 4242 4242 4242`
   - Fecha: Cualquier fecha futura (ej: 12/25)
   - CVC: Cualquier 3 dígitos (ej: 123)
   - Código postal: Cualquiera (ej: 12345)

---

## 🧪 Tarjetas de prueba de Stripe

Para probar diferentes escenarios:

| Escenario | Número de tarjeta |
|-----------|-------------------|
| ✅ Pago exitoso | `4242 4242 4242 4242` |
| ❌ Pago rechazado | `4000 0000 0000 0002` |
| 🔐 Requiere autenticación 3D | `4000 0027 6000 3184` |

---

## 📊 Ver pagos en Stripe Dashboard

1. Ve a https://dashboard.stripe.com/
2. **Payments** → Verás todos los pagos de prueba
3. **Customers** → Verás los clientes (para suscripciones)
4. **Subscriptions** → Verás las suscripciones mensuales

---

## 🚀 Pasar a producción

Cuando estés listo para recibir pagos reales:

1. **Activa tu cuenta** de Stripe (completa el proceso de verificación)
2. **Cambia las claves** en Cloudflare Pages a las claves **LIVE**:
   - `pk_live_...`
   - `sk_live_...`
3. **Despliega** la aplicación
4. **Prueba** con una tarjeta real (puedes hacer un pago pequeño y luego reembolsarlo)

---

## 💡 Características implementadas

✅ **Pagos únicos**: Donaciones de una sola vez
✅ **Suscripciones mensuales**: Donaciones recurrentes
✅ **Formulario seguro**: Stripe Elements integrado
✅ **Múltiples montos**: Predefinidos + personalizado
✅ **Responsive**: Funciona en móvil y desktop
✅ **Confirmación visual**: Mensaje de éxito después del pago

---

## 🔧 Solución de problemas

### Error: "Stripe API key not configured"
- Verifica que `.env.local` existe
- Verifica que las variables están correctamente escritas
- Reinicia el servidor de desarrollo

### El formulario no aparece
- Abre la consola del navegador (F12)
- Busca errores relacionados con Stripe
- Verifica que `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` está configurada

### Pago no se procesa
- Verifica que estás usando tarjetas de prueba válidas
- Revisa el dashboard de Stripe para ver logs de errores
- Verifica que `STRIPE_SECRET_KEY` está configurada correctamente

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en la consola del navegador
2. Revisa los logs en Stripe Dashboard → Developers → Logs
3. Consulta la documentación de Stripe: https://stripe.com/docs

---

¡Listo! Tu sistema de donaciones con Stripe está completamente configurado. 🎉
