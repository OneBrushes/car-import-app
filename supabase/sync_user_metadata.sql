-- Sincronizar raw_user_meta_data con profiles
-- Este script actualiza la tabla profiles con los datos de auth.users

-- 1. Actualizar profiles existentes con datos de raw_user_meta_data
UPDATE profiles
SET 
  first_name = COALESCE(
    (SELECT (raw_user_meta_data->>'first_name') FROM auth.users WHERE id = profiles.id),
    first_name
  ),
  last_name = COALESCE(
    (SELECT (raw_user_meta_data->>'last_name') FROM auth.users WHERE id = profiles.id),
    last_name
  ),
  email = COALESCE(
    (SELECT email FROM auth.users WHERE id = profiles.id),
    email
  )
WHERE id IN (SELECT id FROM auth.users);

-- 2. Crear función para sincronizar automáticamente
CREATE OR REPLACE FUNCTION sync_user_metadata_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar o insertar en profiles cuando cambia raw_user_meta_data
  INSERT INTO profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    'usuario' -- rol por defecto
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear trigger para sincronizar en INSERT y UPDATE
DROP TRIGGER IF EXISTS trigger_sync_user_metadata ON auth.users;
CREATE TRIGGER trigger_sync_user_metadata
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_metadata_to_profile();

-- 4. Función para actualizar raw_user_meta_data desde profiles
CREATE OR REPLACE FUNCTION update_user_metadata_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar raw_user_meta_data cuando cambia profiles
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{first_name}',
      to_jsonb(NEW.first_name)
    ),
    '{last_name}',
    to_jsonb(NEW.last_name)
  )
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Crear trigger para sincronizar de profiles a auth.users
DROP TRIGGER IF EXISTS trigger_update_user_metadata ON profiles;
CREATE TRIGGER trigger_update_user_metadata
  AFTER UPDATE OF first_name, last_name ON profiles
  FOR EACH ROW
  WHEN (OLD.first_name IS DISTINCT FROM NEW.first_name OR OLD.last_name IS DISTINCT FROM NEW.last_name)
  EXECUTE FUNCTION update_user_metadata_from_profile();

-- Comentarios
COMMENT ON FUNCTION sync_user_metadata_to_profile() IS 'Sincroniza raw_user_meta_data de auth.users a profiles';
COMMENT ON FUNCTION update_user_metadata_from_profile() IS 'Sincroniza cambios de profiles a raw_user_meta_data de auth.users';
