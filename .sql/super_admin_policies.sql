-- Dar acceso total de Super Admin a la gestión de Configuración de la App
DROP POLICY IF EXISTS "Super Admins pueden leer configuraciones" ON public.app_settings;
CREATE POLICY "Super Admins pueden leer configuraciones" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super Admins pueden editar configuraciones" ON public.app_settings;
CREATE POLICY "Super Admins pueden editar configuraciones" ON public.app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Dar acceso total de Super Admin a la gestión de perfiles (Profiles)
DROP POLICY IF EXISTS "Super Admins pueden ver todos los perfiles" ON public.profiles;
CREATE POLICY "Super Admins pueden ver todos los perfiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Super Admins pueden actualizar perfiles" ON public.profiles;
CREATE POLICY "Super Admins pueden actualizar perfiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Dar acceso total de Super Admin a los Activity Logs
DROP POLICY IF EXISTS "Super Admins pueden ver los logs" ON public.activity_logs;
CREATE POLICY "Super Admins pueden ver los logs" ON public.activity_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Super Admins pueden insertar logs" ON public.activity_logs;
CREATE POLICY "Super Admins pueden insertar logs" ON public.activity_logs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Dar acceso total a la configuración del Roadmap Empresarial
DROP POLICY IF EXISTS "Super Admins pueden gestionar Roadmap" ON public.company_roadmap;
CREATE POLICY "Super Admins pueden gestionar Roadmap" ON public.company_roadmap
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Dar acceso total de lectura a Notificaciones
DROP POLICY IF EXISTS "Super Admins pueden ver todas las notificaciones" ON public.notifications;
CREATE POLICY "Super Admins pueden ver todas las notificaciones" ON public.notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Asegurar Control Absoluto de las Políticas Base y el God Mode (Por si alguna faltaba)
DROP POLICY IF EXISTS "God Mode Super Admin en inventory_cars" ON public.inventory_cars;
CREATE POLICY "God Mode Super Admin en inventory_cars" ON public.inventory_cars
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "God Mode Super Admin en imported_cars" ON public.imported_cars;
CREATE POLICY "God Mode Super Admin en imported_cars" ON public.imported_cars
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "God Mode Super Admin en spain_cars" ON public.spain_cars;
CREATE POLICY "God Mode Super Admin en spain_cars" ON public.spain_cars
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "God Mode Super Admin en global_expenses" ON public.global_expenses;
CREATE POLICY "God Mode Super Admin en global_expenses" ON public.global_expenses
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "God Mode Super Admin en comparisons" ON public.comparisons;
CREATE POLICY "God Mode Super Admin en comparisons" ON public.comparisons
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
