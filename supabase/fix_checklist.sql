-- 1. Eliminar duplicados, manteniendo solo el más reciente para cada coche
DELETE FROM car_checklists a USING car_checklists b
WHERE a.id < b.id AND a.car_id = b.car_id;

-- 2. Añadir restricción UNIQUE para asegurar que solo haya un checklist por coche
ALTER TABLE car_checklists ADD CONSTRAINT car_checklists_car_id_key UNIQUE (car_id);

-- 3. Refrescar permisos (para asegurar que no sea problema de RLS)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON car_checklists;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON car_checklists;
DROP POLICY IF EXISTS "Enable read access for all users" ON car_checklists;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON car_checklists;

CREATE POLICY "Enable read access for all users" ON car_checklists FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON car_checklists FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON car_checklists FOR UPDATE USING (auth.role() = 'authenticated');
