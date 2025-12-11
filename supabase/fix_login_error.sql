-- Arreglar el problema de "Database error granting user"
-- Este script elimina triggers conflictivos y recrea la función correcta

-- 1. Eliminar triggers que pueden estar causando problemas
DROP TRIGGER IF EXISTS trigger_sync_user_metadata ON auth.users;
DROP TRIGGER IF EXISTS trigger_update_user_metadata ON profiles;

-- 2. Eliminar funciones antiguas
DROP FUNCTION IF EXISTS sync_user_metadata_to_profile();
DROP FUNCTION IF EXISTS update_user_metadata_from_profile();

-- 3. Verificar que existe la función handle_new_user
-- Si no existe, crearla
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    'usuario' -- rol por defecto
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recrear el trigger para nuevos usuarios
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Actualizar perfiles existentes con datos de raw_user_meta_data (opcional)
UPDATE profiles
SET 
  first_name = COALESCE(
    (SELECT (raw_user_meta_data->>'first_name') FROM auth.users WHERE id = profiles.id),
    first_name
  ),
  last_name = COALESCE(
    (SELECT (raw_user_meta_data->>'last_name') FROM auth.users WHERE id = profiles.id),
    last_name
  )
WHERE id IN (SELECT id FROM auth.users WHERE raw_user_meta_data ? 'first_name');

-- Listo! Ahora deberías poder iniciar sesión sin problemas
