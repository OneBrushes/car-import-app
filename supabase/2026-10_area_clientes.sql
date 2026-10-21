-- =====================================================================================================================
-- NorDrive · Área de clientes (puente entre la app de gestión y la web www.nordrivecars.com/clientes)
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-10_seguridad_y_funciones.sql
-- (se puede volver a ejecutar sin problema).
--
-- Cómo funciona:
--  · En la app, a un cliente (tabla customers) con correo se le activa "acceso al área de clientes".
--  · El cliente entra en la web con ese correo: recibe un enlace, la primera vez elige contraseña.
--    Su cuenta se crea con el rol 'cliente', que NO tiene acceso a la app de gestión.
--  · Lo que ve el cliente está en client_portal_cars (solo lo que tú decides enseñar: nunca precios de
--    compra, gastos ni márgenes) y sus fotos/documentos en el bucket privado client-portal.
--  · Se enlaza por el correo: el cliente ve los coches asignados a fichas de cliente con su mismo correo.
-- =====================================================================================================================

begin;

-- 1. Rol 'cliente': las cuentas del área de clientes no cuentan como usuarios de la app --------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles where id = auth.uid())
     and public.current_app_role() not in ('banned', 'cliente')
$$;

-- Fichas de cliente con acceso al área: el correo es el enlace con la cuenta de la web
alter table public.customers add column if not exists portal_access boolean not null default false;
create index if not exists customers_portal_email_idx on public.customers (lower(email)) where portal_access;

-- Las cuentas nuevas creadas desde la web (o con el correo de un cliente con acceso) nacen como 'cliente'
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
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when is_client then 'cliente' else 'usuario' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿Tiene este correo acceso al área de clientes? (la web lo pregunta antes de enviar el enlace)
create or replace function public.portal_email_allowed(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.customers c where c.portal_access and lower(c.email) = lower(trim(check_email)))
$$;
grant execute on function public.portal_email_allowed(text) to anon, authenticated;

-- Fichas de cliente de la persona que ha iniciado sesión en la web (por su correo verificado)
create or replace function public.portal_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.customers c
   where c.portal_access
     and auth.uid() is not null
     and lower(c.email) = lower(auth.jwt()->>'email')
$$;
grant execute on function public.portal_customer_ids() to authenticated;

-- 2. Lo que ve el cliente de cada coche ---------------------------------------------------------------------------------

create table if not exists public.client_portal_cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inventory_car_id uuid not null unique references public.inventory_cars(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- ficha del coche
  title text not null default '',
  year integer,
  mileage numeric,
  color text,
  origin text,            -- "Frankfurt, Alemania"
  destination text,       -- "Madrid, España"
  -- estado
  status_text text,       -- titular: "En transporte"
  current_location text,  -- "Burdeos, Francia"
  transport_mode text,    -- 'camion' | 'conduciendo' | 'tren' | 'barco' | null
  route jsonb not null default '[]'::jsonb,   -- [{ name, label?, status: 'passed'|'current'|'pending' }]
  steps jsonb not null default '[]'::jsonb,   -- [{ key, title, desc, status: 'completed'|'current'|'pending', date?, note?, bullets?: [] }]
  photos jsonb not null default '[]'::jsonb,  -- [{ path, name }]   (bucket client-portal)
  documents jsonb not null default '[]'::jsonb, -- [{ path, name, size }] (bucket client-portal)
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_portal_cars_customer_idx on public.client_portal_cars(customer_id);

alter table public.client_portal_cars enable row level security;

drop policy if exists "portal_cars_staff" on public.client_portal_cars;
drop policy if exists "portal_cars_client_select" on public.client_portal_cars;

-- Equipo: quien puede ver el coche del inventario puede gestionar su área de cliente
create policy "portal_cars_staff" on public.client_portal_cars for all to authenticated
  using (public.is_active_user() and exists (select 1 from public.inventory_cars c where c.id = client_portal_cars.inventory_car_id))
  with check (public.has_app_role('gestor', 'importador', 'admin', 'super_admin')
              and exists (select 1 from public.inventory_cars c where c.id = client_portal_cars.inventory_car_id));

-- Cliente: solo lectura de sus coches publicados
create policy "portal_cars_client_select" on public.client_portal_cars for select to authenticated
  using (published and customer_id in (select public.portal_customer_ids()));

-- El cliente puede ver el nombre de su propia ficha (para saludarle en la web)
drop policy if exists "customers_portal_self" on public.customers;
create policy "customers_portal_self" on public.customers for select to authenticated
  using (id in (select public.portal_customer_ids()));

-- 3. Fotos y documentos del área de clientes (bucket privado, enlaces temporales) ---------------------------------------
-- Ruta: "<id de client_portal_cars>/<archivo>"

insert into storage.buckets (id, name, public) values ('client-portal', 'client-portal', false)
on conflict (id) do update set public = false;

drop policy if exists "client_portal_staff_select" on storage.objects;
drop policy if exists "client_portal_staff_insert" on storage.objects;
drop policy if exists "client_portal_staff_delete" on storage.objects;
drop policy if exists "client_portal_client_select" on storage.objects;

create policy "client_portal_staff_select" on storage.objects for select to authenticated
  using (bucket_id = 'client-portal' and public.is_active_user()
         and exists (select 1 from public.client_portal_cars p where p.id::text = left(storage.objects.name, 36)));
create policy "client_portal_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-portal' and public.has_app_role('gestor', 'importador', 'admin', 'super_admin')
              and exists (select 1 from public.client_portal_cars p where p.id::text = left(storage.objects.name, 36)));
create policy "client_portal_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'client-portal' and public.is_active_user()
         and exists (select 1 from public.client_portal_cars p where p.id::text = left(storage.objects.name, 36)));

-- El cliente abre los archivos de sus coches (la política de client_portal_cars ya filtra los suyos)
create policy "client_portal_client_select" on storage.objects for select to authenticated
  using (bucket_id = 'client-portal'
         and exists (select 1 from public.client_portal_cars p
                      where p.id::text = left(storage.objects.name, 36)
                        and p.published and p.customer_id in (select public.portal_customer_ids())));

commit;

-- =====================================================================================================================
-- Ajustes en Supabase (una vez):
--  · Authentication → URL Configuration → Redirect URLs: añadir https://www.nordrivecars.com/clientes/
--    (y http://localhost:3000/clientes/ para probar en local).
--  · Authentication → Providers → Email: dejar activado "Enable Email provider" (y permitir registros nuevos).
-- =====================================================================================================================
