-- Actualizar last_sign_in_at cuando el usuario está activo
-- Esta función se puede llamar desde el cliente cuando el usuario está online

CREATE OR REPLACE FUNCTION update_user_last_seen()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET last_sign_in_at = NOW()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permisos para que cualquier usuario autenticado pueda ejecutarla
GRANT EXECUTE ON FUNCTION update_user_last_seen() TO authenticated;
