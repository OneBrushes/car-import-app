-- =====================================================================================================================
-- NorDrive · Invitar usuarios del equipo desde la app y cuentas "pendientes"
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-10_area_clientes.sql (se puede repetir sin problema).
--
--  · Los usuarios del equipo se invitan desde la app (Admin → Usuarios → "Invitar usuario") con la Edge Function
--    invite-user: llegan con el rol que elijas.
--  · Cualquier cuenta que se cree SIN invitación empieza como 'pendiente': no ve nada de la app hasta que un admin
--    le dé un rol en el panel de administración. (Las de clientes siguen naciendo como 'cliente'.)
-- =====================================================================================================================

begin;

-- 'pendiente' y 'cliente' no son usuarios activos de la app
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles where id = auth.uid())
     and public.current_app_role() not in ('banned', 'cliente', 'pendiente')
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_client boolean;
begin
  is_client := coalesce(new.raw_user_meta_data->>'portal', '') = 'clientes'
    or exists (select 1 from public.customers c where c.portal_access and lower(c.email) = lower(new.email));
  insert into public.profiles (id, email, role, first_name, last_name)
  values (
    new.id,
    new.email,
    case when is_client then 'cliente' else 'pendiente' end,   -- la invitación del equipo pone luego el rol elegido
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Al registrarse desde la app, el perfil se intentaba crear también desde el navegador como 'usuario':
-- ahora solo se permite como 'pendiente' (el disparador de arriba ya lo crea así).
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert to authenticated
  with check (id = auth.uid() and coalesce(role, 'pendiente') = 'pendiente');

commit;
