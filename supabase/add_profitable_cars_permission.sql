-- Añadir permisos granulares a la tabla profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS can_add_profitable_cars BOOLEAN DEFAULT FALSE;

-- Por defecto, los admin pueden añadir coches rentables
UPDATE profiles
SET can_add_profitable_cars = TRUE
WHERE role = 'admin';

-- Comentario
COMMENT ON COLUMN profiles.can_add_profitable_cars IS 'Permiso para añadir/editar coches rentables';
