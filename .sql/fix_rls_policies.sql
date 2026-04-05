-- Corrección profunda de las Reglas RLS para permitir Edición

DROP POLICY IF EXISTS "Admins pueden gestionar gastos" ON global_expenses;
DROP POLICY IF EXISTS "Admins pueden guardar el roadmap" ON company_roadmap;

-- Para Global Expenses
CREATE POLICY "Admins_Insert_Expense" ON global_expenses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin'))
);

CREATE POLICY "Admins_Update_Expense" ON global_expenses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin'))
);

CREATE POLICY "Admins_Delete_Expense" ON global_expenses FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin'))
);

-- Para Company Roadmap
CREATE POLICY "Admins_Insert_Roadmap" ON company_roadmap FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin'))
);

CREATE POLICY "Admins_Update_Roadmap" ON company_roadmap FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin'))
);

CREATE POLICY "Admins_Delete_Roadmap" ON company_roadmap FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'super_admin'))
);
