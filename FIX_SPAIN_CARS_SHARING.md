# 🔧 ARREGLAR COMPARTIR COCHES DE ESPAÑA

## ❌ Problema
Las notificaciones se envían correctamente, pero el coche compartido **NO aparece** para el otro usuario.

## ✅ Solución
El problema son las **políticas RLS** (Row Level Security) de Supabase. Necesitas ejecutar el SQL para permitir que los usuarios vean coches compartidos con ellos.

---

## 📋 PASOS PARA ARREGLAR:

### 1. Ve a Supabase SQL Editor
1. Abre tu proyecto en [Supabase](https://supabase.com)
2. Ve a **SQL Editor** (icono de base de datos en el menú izquierdo)
3. Click en **"New query"**

### 2. Ejecuta este SQL:

```sql
-- RLS Policies para spain_cars (compartir coches)

-- Eliminar políticas antiguas si existen
DROP POLICY IF EXISTS "Users can view their own spain cars" ON public.spain_cars;
DROP POLICY IF EXISTS "Users can insert their own spain cars" ON public.spain_cars;
DROP POLICY IF EXISTS "Users can update their own spain cars" ON public.spain_cars;
DROP POLICY IF EXISTS "Users can delete their own spain cars" ON public.spain_cars;

-- Habilitar RLS
ALTER TABLE public.spain_cars ENABLE ROW LEVEL SECURITY;

-- Policy: Los usuarios pueden ver sus propios coches Y los compartidos con ellos
CREATE POLICY "Users can view their own spain cars and shared with them"
  ON public.spain_cars
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    auth.uid() = ANY(shared_with)
  );

-- Policy: Los usuarios pueden insertar sus propios coches
CREATE POLICY "Users can insert their own spain cars"
  ON public.spain_cars
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Los usuarios solo pueden actualizar sus propios coches
CREATE POLICY "Users can update their own spain cars"
  ON public.spain_cars
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Los usuarios solo pueden eliminar sus propios coches
CREATE POLICY "Users can delete their own spain cars"
  ON public.spain_cars
  FOR DELETE
  USING (auth.uid() = user_id);
```

### 3. Click en **"Run"** (o presiona Ctrl+Enter)

### 4. Verifica que se ejecutó correctamente
Deberías ver un mensaje de éxito en verde.

---

## 🧪 PRUEBA:

1. **Usuario A** (tú): Comparte un coche con **Usuario B**
2. **Usuario B**: Recarga la página de "Coches de España"
3. **Usuario B**: Debería ver el coche compartido con:
   - Borde azul
   - Tag "Compartido"
   - **NO** puede editarlo ni eliminarlo (solo verlo)

---

## 🔍 CÓMO FUNCIONA:

La política RLS más importante es esta:

```sql
auth.uid() = user_id OR auth.uid() = ANY(shared_with)
```

Esto significa:
- ✅ Puedes ver coches donde **TÚ eres el propietario** (`user_id`)
- ✅ Puedes ver coches donde **TU ID está en el array `shared_with`**

---

## ⚠️ IMPORTANTE:

- El archivo SQL está en: `.sql/spain_cars_rls.sql`
- Solo necesitas ejecutarlo **UNA VEZ**
- Después de ejecutarlo, el compartir funcionará automáticamente

---

## 📊 VERIFICAR EN SUPABASE:

1. Ve a **Table Editor** → `spain_cars`
2. Busca el coche que compartiste
3. Verifica que la columna `shared_with` contiene el UUID del otro usuario
4. Ejemplo: `{550e8400-e29b-41d4-a716-446655440000}`

Si ves el UUID ahí, significa que el compartir funcionó, solo falta la política RLS.
