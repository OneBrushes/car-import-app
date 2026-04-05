-- SOLUCIÓN DE EMERGENCIA: Romper Recursion Infinita en Supabase (RLS)

-- 1. Eliminar las políticas rotas (causa del problema)
DROP POLICY IF EXISTS "Super Admins pueden ver todos los perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Super Admins pueden actualizar perfiles" ON public.profiles;

-- 2. Crear una función de 'Bypass Segura' para que PostgreSQL no entre en bucle infinito
-- Esta función lee el rol sin activar las políticas RLS.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 3. Restaurar política basica para usuarios: cada uno ve lo suyo
DROP POLICY IF EXISTS "Los usuarios ven su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios ven su propio perfil" ON public.profiles
  FOR SELECT USING ( auth.uid() = id );

-- 4. Recrear las políticas pero usando la NUEVA FUNCIÓN SEGURA
CREATE POLICY "Admins y Super Admins pueden ver todos los perfiles" ON public.profiles
  FOR SELECT USING (
    public.get_my_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "Admins y Super Admins pueden actualizar perfiles" ON public.profiles
  FOR UPDATE USING (
    public.get_my_role() IN ('admin', 'super_admin')
  );

-- Opcional: Re-establecer tu correo a 'super_admin' si el error lo reseteó
-- (Cambia 'tucorreo@ejemplo.com' por tu email real)
UPDATE public.profiles SET role = 'super_admin' WHERE email = 'tucorreo@ejemplo.com';
