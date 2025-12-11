# 🔧 SOLUCIÓN RÁPIDA - Errores de Stripe y Login

## ❌ Problema 1: "Unexpected end of JSON input" (Stripe)

### Causa:
Las claves de Stripe no están configuradas en el archivo `.env.local`

### Solución:

1. **Abre el archivo `.env.local`** (está en la raíz del proyecto)
2. **Reemplaza** las claves de Stripe con tus claves reales:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_TU_CLAVE_AQUI
STRIPE_SECRET_KEY=sk_test_TU_CLAVE_SECRETA_AQUI
```

3. **Obtén tus claves** de Stripe:
   - Ve a: https://dashboard.stripe.com/test/apikeys
   - Copia **Publishable key** (pk_test_...)
   - Copia **Secret key** (sk_test_...) - Click en "Reveal test key"

4. **Reinicia el servidor**:
```bash
# Detén el servidor (Ctrl+C)
npm run dev
```

---

## ❌ Problema 2: "Database error granting user" (Login)

### Causa:
Los triggers de sincronización de usuarios están causando conflicto

### Solución:

1. **Abre Supabase** → SQL Editor
2. **Copia y pega** el contenido del archivo: `supabase/fix_login_error.sql`
3. **Ejecuta** el SQL (Click en "Run")
4. **Prueba** a iniciar sesión de nuevo

### Alternativa rápida (SQL directo):

```sql
-- Eliminar triggers conflictivos
DROP TRIGGER IF EXISTS trigger_sync_user_metadata ON auth.users;
DROP TRIGGER IF EXISTS trigger_update_user_metadata ON profiles;

-- Eliminar funciones
DROP FUNCTION IF EXISTS sync_user_metadata_to_profile();
DROP FUNCTION IF EXISTS update_user_metadata_from_profile();

-- Recrear función básica
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'usuario')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## ✅ Verificación

### Para Stripe:
1. Ve a la pestaña "Donaciones"
2. Selecciona 5€
3. Click en "Donar"
4. Deberías ver el formulario de pago

### Para Login:
1. Intenta iniciar sesión
2. No debería aparecer el error "Database error granting user"

---

## 🆘 Si sigue sin funcionar:

### Stripe:
- Verifica que las claves empiezan con `pk_test_` y `sk_test_`
- Verifica que no hay espacios extra en `.env.local`
- Reinicia el servidor completamente

### Login:
- Ejecuta el SQL de nuevo
- Verifica en Supabase → Database → Triggers que no hay triggers duplicados
- Intenta crear un usuario nuevo para probar

---

## 📞 Contacto

Si los problemas persisten, revisa:
- Consola del navegador (F12) para ver errores específicos
- Logs de Supabase → SQL Editor → History
- Logs del servidor de desarrollo

---

¡Listo! Estos pasos deberían solucionar ambos problemas. 🎉
