-- SQL: Configuración del SUPER ADMIN y permisos ampliados
-- EJECUTA ESTO EN SUPABASE SQL EDITOR

-- 1. Añadimos el permiso de gastos a la tabla profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_manage_expenses BOOLEAN DEFAULT FALSE;

-- 2. Limpieza de reglas antiguas
DROP POLICY IF EXISTS "Users can view own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can insert own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can update own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can delete own cars" ON imported_cars;
DROP POLICY IF EXISTS "Users can view shared cars" ON imported_cars;
DROP POLICY IF EXISTS "super_admin_all_imported" ON imported_cars;

-- (Por si el array de shared_with falla al ser NULL se castea)
CREATE POLICY "super_admin_all_imported" ON imported_cars FOR ALL TO authenticated USING (
  user_id = auth.uid() 
  OR auth.uid() = ANY(COALESCE(shared_with, ARRAY[]::uuid[]))
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
);

-- Para `spain_cars`
DROP POLICY IF EXISTS "Users can view own spain cars" ON spain_cars;
DROP POLICY IF EXISTS "Users can view shared spain cars" ON spain_cars;
DROP POLICY IF EXISTS "Users can insert own spain cars" ON spain_cars;
DROP POLICY IF EXISTS "Users can update own spain cars" ON spain_cars;
DROP POLICY IF EXISTS "Users can delete own spain cars" ON spain_cars;
DROP POLICY IF EXISTS "super_admin_all_spain" ON spain_cars;

CREATE POLICY "super_admin_all_spain" ON spain_cars FOR ALL TO authenticated USING (
  user_id = auth.uid()
  OR auth.uid() = ANY(COALESCE(shared_with, ARRAY[]::uuid[]))
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
);

-- Para `inventory_cars`
DROP POLICY IF EXISTS "Users can view own inventory cars" ON inventory_cars;
DROP POLICY IF EXISTS "Users can insert own inventory cars" ON inventory_cars;
DROP POLICY IF EXISTS "Users can update own inventory cars" ON inventory_cars;
DROP POLICY IF EXISTS "Users can delete own inventory cars" ON inventory_cars;
DROP POLICY IF EXISTS "super_admin_all_inventory" ON inventory_cars;

CREATE POLICY "super_admin_all_inventory" ON inventory_cars FOR ALL TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'super_admin' OR profiles.role = 'admin' OR profiles.role = 'importador'))
);

-- Para `comparisons`
DROP POLICY IF EXISTS "Users can view own comparisons" ON comparisons;
DROP POLICY IF EXISTS "Users can insert own comparisons" ON comparisons;
DROP POLICY IF EXISTS "Users can update own comparisons" ON comparisons;
DROP POLICY IF EXISTS "Users can delete own comparisons" ON comparisons;
DROP POLICY IF EXISTS "super_admin_all_comparisons" ON comparisons;

CREATE POLICY "super_admin_all_comparisons" ON comparisons FOR ALL TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
);

-- Para `global_expenses` (se incluye también el can_manage_expenses nuevo)
DROP POLICY IF EXISTS "Admins_Insert_Expense" ON global_expenses;
DROP POLICY IF EXISTS "Admins_Update_Expense" ON global_expenses;
DROP POLICY IF EXISTS "Admins_Delete_Expense" ON global_expenses;

CREATE POLICY "Admins_Insert_Expense" ON global_expenses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin' OR profiles.can_manage_expenses = TRUE))
);

CREATE POLICY "Admins_Update_Expense" ON global_expenses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin' OR profiles.can_manage_expenses = TRUE))
);

CREATE POLICY "Admins_Delete_Expense" ON global_expenses FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin' OR profiles.can_manage_expenses = TRUE))
);
