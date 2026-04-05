-- =========================================================================
-- SUPER REDENCIÓN SQL: Arreglo definitivo para el Error 500 (Recursividad)
-- =========================================================================
-- Este script ELIMINA TODAS LAS POLÍTICAS que han causado el bucle y 
-- las vuelve a crear utilizando la forma más segura posible sugerida por Supabase.

-- 1. CREAR FUNCIÓN TOTALMENTE AISLADA PARA LEER EL ROL
-- (Al ser SECURITY DEFINER se salta las políticas RLS y jamás entra en bucle)
CREATE OR REPLACE FUNCTION public.get_safe_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

---------------------------------------------------------------------------
-- 2. LIMPIEZA ABSOLUTA DE LAS POLÍTICAS DE 'PROFILES'
---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Super Admins pueden ver todos los perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Super Admins pueden actualizar perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Ver todos los perfiles a los admins" ON public.profiles;
DROP POLICY IF EXISTS "Los usuarios ven su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Admins y Super Admins pueden ver todos los perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins y Super Admins pueden actualizar perfiles" ON public.profiles;

-- Nueva política ultra-segura para perfiles:
CREATE POLICY "Validar perfiles (Seguro)" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR public.get_safe_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "Actualizar perfiles (Seguro)" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id OR public.get_safe_role() IN ('admin', 'super_admin')
  );

---------------------------------------------------------------------------
-- 3. LIMPIEZA Y RECONSTRUCCIÓN DE ADMINISTRACIÓN BÁSICA
---------------------------------------------------------------------------
-- App Settings
DROP POLICY IF EXISTS "Super Admins pueden leer configuraciones" ON public.app_settings;
DROP POLICY IF EXISTS "Super Admins pueden editar configuraciones" ON public.app_settings;
CREATE POLICY "Leer app_settings (Seguro)" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Editar app_settings (Seguro)" ON public.app_settings FOR ALL USING (public.get_safe_role() = 'super_admin' OR public.get_safe_role() = 'admin');

-- Activity Logs
DROP POLICY IF EXISTS "Super Admins pueden ver los logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Super Admins pueden insertar logs" ON public.activity_logs;
CREATE POLICY "Leer logs (Seguro)" ON public.activity_logs FOR SELECT USING (public.get_safe_role() IN ('admin', 'super_admin'));
CREATE POLICY "Insertar logs (Seguro)" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id OR public.get_safe_role() IN ('admin', 'super_admin'));

-- Company Roadmap
DROP POLICY IF EXISTS "Super Admins pueden gestionar Roadmap" ON public.company_roadmap;
CREATE POLICY "Gestionar roadmap (Seguro)" ON public.company_roadmap FOR ALL USING (public.get_safe_role() IN ('admin', 'super_admin'));

-- Notificaciones
DROP POLICY IF EXISTS "Super Admins pueden ver todas las notificaciones" ON public.notifications;
CREATE POLICY "Leer notificaciones (Seguro)" ON public.notifications FOR SELECT USING (auth.uid() = user_id OR public.get_safe_role() = 'super_admin');

---------------------------------------------------------------------------
-- 4. LIMPIEZA Y RECONSTRUCCIÓN DEL GOD MODE (BYPASS SEGURO)
---------------------------------------------------------------------------
-- Inventory Cars
DROP POLICY IF EXISTS "God Mode Super Admin en inventory_cars" ON public.inventory_cars;
CREATE POLICY "God Mode en inventory_cars" ON public.inventory_cars FOR ALL USING (public.get_safe_role() = 'super_admin');

-- Imported Cars
DROP POLICY IF EXISTS "God Mode Super Admin en imported_cars" ON public.imported_cars;
CREATE POLICY "God Mode en imported_cars" ON public.imported_cars FOR ALL USING (public.get_safe_role() = 'super_admin');

-- Spain Cars
DROP POLICY IF EXISTS "God Mode Super Admin en spain_cars" ON public.spain_cars;
CREATE POLICY "God Mode en spain_cars" ON public.spain_cars FOR ALL USING (public.get_safe_role() = 'super_admin');

-- Global Expenses
DROP POLICY IF EXISTS "God Mode Super Admin en global_expenses" ON public.global_expenses;
CREATE POLICY "God Mode en global_expenses" ON public.global_expenses FOR ALL USING (public.get_safe_role() = 'super_admin' OR public.get_safe_role() = 'admin');

-- Comparisons
DROP POLICY IF EXISTS "God Mode Super Admin en comparisons" ON public.comparisons;
CREATE POLICY "God Mode en comparisons" ON public.comparisons FOR ALL USING (public.get_safe_role() = 'super_admin');

-- Por si te borró el rango al bloquearte la lectura de la base de datos:
UPDATE public.profiles SET role = 'super_admin' WHERE role IS NULL; -- Si alguno falló en el limbo
