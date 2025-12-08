-- Resetear políticas RLS para imported_cars para evitar conflictos
DROP POLICY IF EXISTS "Enable read access for all users" ON imported_cars;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON imported_cars;
DROP POLICY IF EXISTS "Enable update for owners and admins" ON imported_cars;
DROP POLICY IF EXISTS "Enable delete for owners and admins" ON imported_cars;
DROP POLICY IF EXISTS "Users can view their own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can insert their own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can update their own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can delete their own cars" ON imported_cars;

-- Asegurar que RLS está activo
ALTER TABLE imported_cars ENABLE ROW LEVEL SECURITY;

-- 1. LECTURA: Permitir ver a todos (necesario para compartir) o restringir si prefieres
CREATE POLICY "Enable read access for all users" ON imported_cars 
FOR SELECT USING (true);

-- 2. INSERCIÓN: Solo usuarios autenticados pueden crear coches
CREATE POLICY "Enable insert for authenticated users only" ON imported_cars 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. ACTUALIZACIÓN: Propietarios y Administradores
-- Esta política permite actualizar SI el usuario es el dueño O es admin
CREATE POLICY "Enable update for owners and admins" ON imported_cars 
FOR UPDATE USING (
  auth.uid() = user_id OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 4. ELIMINACIÓN: Propietarios y Administradores
CREATE POLICY "Enable delete for owners and admins" ON imported_cars 
FOR DELETE USING (
  auth.uid() = user_id OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
