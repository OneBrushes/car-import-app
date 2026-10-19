-- =============================================================================
-- NorDrive · Seguridad (RLS + Storage) y tablas de las funciones nuevas
-- Ejecutar ENTERO en Supabase → SQL Editor. Se puede ejecutar varias veces.
--
-- Qué hace:
--   1. Funciones de ayuda para saber el rol del usuario.
--   2. Columnas y tablas nuevas: clientes, recordatorios, ajustes de empresa,
--      fase del proceso, datos de venta/factura.
--   3. BORRA TODAS las políticas existentes de las tablas de la app y crea unas
--      nuevas y coherentes (había scripts en supabase/ y .sql/ y no se sabe cuáles
--      se aplicaron).
--   4. Impide que un usuario se cambie su propio rol (antes podía hacerse super_admin).
--   5. Buckets: car-documents y receipts pasan a PRIVADOS; reglas por propietario.
--
-- Modelo de acceso:
--   usuario      → ve lo suyo y lo que le comparten; no crea coches.
--   gestor       → crea coches de importación/España y su inventario.
--   importador   → además ve TODO el inventario e importación de la empresa
--                  (checklist, informes, marcar comprado coches de otros).
--   admin        → además gestiona usuarios, gastos generales y ajustes.
--   super_admin  → todo (Modo Dios).
--   banned       → sin acceso.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Funciones de ayuda (SECURITY DEFINER para poder leer profiles sin recursión)
-- -----------------------------------------------------------------------------

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'usuario')
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles where id = auth.uid())
     and public.current_app_role() <> 'banned'
$$;

create or replace function public.has_app_role(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and public.current_app_role() = any(roles)
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.has_app_role(text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Columnas y tablas nuevas
-- -----------------------------------------------------------------------------

alter table public.profiles add column if not exists can_manage_expenses boolean default false;
alter table public.profiles add column if not exists can_add_profitable_cars boolean default false;

-- Fase del proceso para coches en importación: null = encontrado, 'negotiating', 'discarded'
alter table public.imported_cars add column if not exists pipeline_stage text;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  nif text,
  email text,
  phone text,
  address text,
  city text,
  postal_code text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customers_user_id_idx on public.customers(user_id);

alter table public.inventory_cars add column if not exists imported_car_id uuid references public.imported_cars(id) on delete set null;
alter table public.inventory_cars add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.inventory_cars add column if not exists invoice_number text;
alter table public.inventory_cars add column if not exists invoice_date date;
alter table public.inventory_cars add column if not exists vat_regime text default 'rebu';
alter table public.inventory_cars add column if not exists vin text;
alter table public.inventory_cars add column if not exists plate text;
alter table public.inventory_cars add column if not exists mileage numeric;
create unique index if not exists inventory_cars_invoice_number_key on public.inventory_cars(invoice_number) where invoice_number is not null;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  due_date date not null,
  done boolean not null default false,
  car_table text check (car_table in ('imported_cars', 'inventory_cars', 'spain_cars')),
  car_id uuid,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists reminders_user_due_idx on public.reminders(user_id, done, due_date);

-- Ajustes de empresa con valor JSON (app_settings solo admite booleanos)
create table if not exists public.company_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- El autor de cada registro de actividad se rellena solo
alter table public.activity_logs alter column user_id set default auth.uid();

-- Número de factura correlativo (FV-AAAA-0001) asignado de forma atómica
create or replace function public.assign_invoice_number(car uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_number text;
  year_prefix text := 'FV-' || to_char(now(), 'YYYY') || '-';
  next_value int;
begin
  if not exists (
    select 1 from public.inventory_cars c
    where c.id = car
      and (c.user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin'))
  ) or not public.is_active_user() then
    raise exception 'Sin permiso sobre este coche';
  end if;

  select invoice_number into current_number from public.inventory_cars where id = car;
  if current_number is not null then
    return current_number;
  end if;

  perform pg_advisory_xact_lock(hashtext('nordrive_invoice_number'));

  select coalesce(max(substring(invoice_number from length(year_prefix) + 1)::int), 0) + 1
    into next_value
    from public.inventory_cars
   where invoice_number like year_prefix || '%'
     and substring(invoice_number from length(year_prefix) + 1) ~ '^\d+$';

  update public.inventory_cars
     set invoice_number = year_prefix || lpad(next_value::text, 4, '0'),
         invoice_date = coalesce(invoice_date, current_date)
   where id = car;

  return year_prefix || lpad(next_value::text, 4, '0');
end;
$$;
grant execute on function public.assign_invoice_number(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Borrar todas las políticas existentes de las tablas de la app
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename = any (array[
         'profiles', 'imported_cars', 'spain_cars', 'comparisons', 'profitable_cars',
         'inventory_cars', 'car_expenses', 'car_checklists', 'global_expenses',
         'activity_logs', 'notifications', 'app_settings', 'company_roadmap',
         'customers', 'reminders', 'company_settings'
       ])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.imported_cars enable row level security;
alter table public.spain_cars enable row level security;
alter table public.comparisons enable row level security;
alter table public.profitable_cars enable row level security;
alter table public.inventory_cars enable row level security;
alter table public.car_expenses enable row level security;
alter table public.car_checklists enable row level security;
alter table public.global_expenses enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.company_roadmap enable row level security;
alter table public.customers enable row level security;
alter table public.reminders enable row level security;
alter table public.company_settings enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Políticas nuevas
-- -----------------------------------------------------------------------------

-- PROFILES -------------------------------------------------------------------
-- Todos los usuarios activos ven el directorio (necesario para compartir coches
-- y mostrar el nombre del propietario). Cada uno siempre ve su propia fila
-- (así la app puede detectar si está baneado).
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());

create policy "profiles_insert_self" on public.profiles for insert to authenticated
  with check (id = auth.uid() and coalesce(role, 'usuario') = 'usuario');

create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_app_role('admin', 'super_admin'))
  with check (id = auth.uid() or public.has_app_role('admin', 'super_admin'));

-- Nadie puede subirse de rol a sí mismo; un admin no puede crear ni tocar super_admins
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role: sin restricciones
  if auth.uid() is null then
    return new;
  end if;

  if not public.has_app_role('admin', 'super_admin') then
    new.role := old.role;
    new.can_manage_expenses := old.can_manage_expenses;
    new.can_add_profitable_cars := old.can_add_profitable_cars;
    new.email := old.email;
    new.id := old.id;
    return new;
  end if;

  if not public.has_app_role('super_admin') then
    if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
      raise exception 'Solo un super_admin puede nombrar super_admins';
    end if;
    if old.role = 'super_admin' and new.role is distinct from old.role then
      raise exception 'Solo un super_admin puede cambiar el rol de otro super_admin';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- IMPORTED_CARS --------------------------------------------------------------
create policy "imported_select" on public.imported_cars for select to authenticated
  using (
    public.is_active_user() and (
      user_id = auth.uid()
      or auth.uid()::text = any (coalesce(shared_with::text[], '{}'))
      or public.has_app_role('importador', 'admin', 'super_admin')
    )
  );
create policy "imported_insert" on public.imported_cars for insert to authenticated
  with check (user_id = auth.uid() and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));
create policy "imported_update" on public.imported_cars for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('super_admin')))
  with check (user_id = auth.uid() or public.has_app_role('super_admin'));
create policy "imported_delete" on public.imported_cars for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('admin', 'super_admin')));

-- SPAIN_CARS -----------------------------------------------------------------
create policy "spain_select" on public.spain_cars for select to authenticated
  using (
    public.is_active_user() and (
      user_id = auth.uid()
      or auth.uid()::text = any (coalesce(shared_with::text[], '{}'))
      or public.has_app_role('importador', 'admin', 'super_admin')
    )
  );
create policy "spain_insert" on public.spain_cars for insert to authenticated
  with check (user_id = auth.uid() and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));
create policy "spain_update" on public.spain_cars for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('super_admin')))
  with check (user_id = auth.uid() or public.has_app_role('super_admin'));
create policy "spain_delete" on public.spain_cars for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('admin', 'super_admin')));

-- COMPARISONS ----------------------------------------------------------------
create policy "comparisons_select" on public.comparisons for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('super_admin')));
create policy "comparisons_insert" on public.comparisons for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy "comparisons_update" on public.comparisons for update to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid());
create policy "comparisons_delete" on public.comparisons for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('super_admin')));

-- PROFITABLE_CARS (catálogo de la empresa) -----------------------------------
create policy "profitable_select" on public.profitable_cars for select to authenticated
  using (public.is_active_user());
create policy "profitable_write" on public.profitable_cars for all to authenticated
  using (public.has_app_role('admin', 'super_admin'))
  with check (public.has_app_role('admin', 'super_admin'));

-- INVENTORY_CARS -------------------------------------------------------------
create policy "inventory_select" on public.inventory_cars for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin')));
create policy "inventory_insert" on public.inventory_cars for insert to authenticated
  with check (user_id = auth.uid() and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));
create policy "inventory_update" on public.inventory_cars for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin')))
  with check (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin')));
create policy "inventory_delete" on public.inventory_cars for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin')));

-- CAR_EXPENSES (heredan el acceso del coche) ---------------------------------
create policy "car_expenses_all" on public.car_expenses for all to authenticated
  using (exists (select 1 from public.inventory_cars c where c.id = car_expenses.car_id))
  with check (exists (select 1 from public.inventory_cars c where c.id = car_expenses.car_id));

-- CAR_CHECKLISTS -------------------------------------------------------------
-- Ver: quien ve el coche. Editar: el dueño del coche o los roles de empresa
-- (importador/admin/super_admin), que son quienes hacen las inspecciones.
create policy "checklists_select" on public.car_checklists for select to authenticated
  using (exists (select 1 from public.imported_cars c where c.id = car_checklists.car_id));
create policy "checklists_insert" on public.car_checklists for insert to authenticated
  with check (exists (
    select 1 from public.imported_cars c
     where c.id = car_checklists.car_id
       and (c.user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin'))
  ));
create policy "checklists_update" on public.car_checklists for update to authenticated
  using (exists (
    select 1 from public.imported_cars c
     where c.id = car_checklists.car_id
       and (c.user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin'))
  ));
create policy "checklists_delete" on public.car_checklists for delete to authenticated
  using (exists (
    select 1 from public.imported_cars c
     where c.id = car_checklists.car_id
       and (c.user_id = auth.uid() or public.has_app_role('admin', 'super_admin'))
  ));

-- GLOBAL_EXPENSES ------------------------------------------------------------
create policy "global_expenses_select" on public.global_expenses for select to authenticated
  using (public.has_app_role('importador', 'admin', 'super_admin'));
create policy "global_expenses_write" on public.global_expenses for all to authenticated
  using (public.has_app_role('admin', 'super_admin'))
  with check (public.has_app_role('admin', 'super_admin'));

-- ACTIVITY_LOGS (solo añadir; solo admins leen) ------------------------------
create policy "activity_logs_insert" on public.activity_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy "activity_logs_select" on public.activity_logs for select to authenticated
  using (public.has_app_role('admin', 'super_admin'));

-- NOTIFICATIONS --------------------------------------------------------------
create policy "notifications_select" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (public.is_active_user());
create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "notifications_delete" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- La app ya crea la notificación al compartir: el trigger antiguo la duplicaba
drop trigger if exists trigger_notify_car_shared on public.imported_cars;

-- APP_SETTINGS (la pantalla de login lee "registrations_enabled" sin sesión) --
create policy "app_settings_select" on public.app_settings for select to anon, authenticated
  using (true);
create policy "app_settings_write" on public.app_settings for all to authenticated
  using (public.has_app_role('admin', 'super_admin'))
  with check (public.has_app_role('admin', 'super_admin'));

-- COMPANY_ROADMAP ------------------------------------------------------------
create policy "roadmap_select" on public.company_roadmap for select to authenticated
  using (public.is_active_user());
create policy "roadmap_write" on public.company_roadmap for all to authenticated
  using (public.has_app_role('admin', 'super_admin'))
  with check (public.has_app_role('admin', 'super_admin'));

-- CUSTOMERS ------------------------------------------------------------------
create policy "customers_select" on public.customers for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin')));
create policy "customers_insert" on public.customers for insert to authenticated
  with check (user_id = auth.uid() and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));
create policy "customers_update" on public.customers for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('importador', 'admin', 'super_admin')))
  with check (public.is_active_user());
create policy "customers_delete" on public.customers for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.has_app_role('admin', 'super_admin')));

-- REMINDERS (personales) -----------------------------------------------------
create policy "reminders_own" on public.reminders for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

-- COMPANY_SETTINGS -----------------------------------------------------------
create policy "company_settings_select" on public.company_settings for select to authenticated
  using (public.is_active_user());
create policy "company_settings_write" on public.company_settings for all to authenticated
  using (public.has_app_role('admin', 'super_admin'))
  with check (public.has_app_role('admin', 'super_admin'));

-- -----------------------------------------------------------------------------
-- 5. Métricas del panel de admin: solo para admins
-- -----------------------------------------------------------------------------

create or replace function public.get_database_size()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_app_role('admin', 'super_admin') then
    raise exception 'Solo administradores';
  end if;
  return pg_database_size(current_database());
end;
$$;

create or replace function public.get_storage_size()
returns bigint
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  total_size bigint;
begin
  if not public.has_app_role('admin', 'super_admin') then
    raise exception 'Solo administradores';
  end if;
  select sum((metadata->>'size')::bigint) into total_size from storage.objects;
  return coalesce(total_size, 0);
end;
$$;

create or replace function public.get_users_count()
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.has_app_role('admin', 'super_admin') then
    raise exception 'Solo administradores';
  end if;
  return (select count(*) from auth.users);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Storage
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('car-images', 'car-images', true),
  ('avatars', 'avatars', true),
  ('car-documents', 'car-documents', false),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Fotos y avatares siguen públicos (se ven en mapa, informes, etc.).
-- Documentos y facturas pasan a privados: se abren con enlaces temporales.
update storage.buckets set public = true where id in ('car-images', 'avatars');
update storage.buckets set public = false where id in ('car-documents', 'receipts');

do $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- car-images: lectura pública; subir quien puede crear coches; borrar quien subió o un admin
create policy "car_images_select" on storage.objects for select
  using (bucket_id = 'car-images');
create policy "car_images_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'car-images' and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));
create policy "car_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'car-images' and public.is_active_user()
         and (owner_id = auth.uid()::text or public.has_app_role('admin', 'super_admin')));

-- avatars: lectura pública; cada usuario solo sus archivos ("<uid>-...")
create policy "avatars_select" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name like auth.uid()::text || '-%');
create policy "avatars_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '-%');
create policy "avatars_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '-%');

-- car-documents: el nombre empieza por el id del coche del inventario (36 caracteres).
-- Acceso = quien puede ver ese coche (se aplican las reglas de inventory_cars).
create policy "car_documents_select" on storage.objects for select to authenticated
  using (bucket_id = 'car-documents' and public.is_active_user()
         and exists (select 1 from public.inventory_cars c where c.id::text = left(storage.objects.name, 36)));
create policy "car_documents_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'car-documents' and public.is_active_user()
              and exists (select 1 from public.inventory_cars c where c.id::text = left(storage.objects.name, 36)));
create policy "car_documents_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'car-documents' and public.is_active_user()
         and exists (select 1 from public.inventory_cars c where c.id::text = left(storage.objects.name, 36)));

-- receipts: facturas de gastos generales
create policy "receipts_select" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.has_app_role('importador', 'admin', 'super_admin'));
create policy "receipts_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_app_role('admin', 'super_admin'));
create policy "receipts_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.has_app_role('admin', 'super_admin'));

-- -----------------------------------------------------------------------------
-- 7. Historial de cada coche (se rellena solo con triggers)
-- -----------------------------------------------------------------------------

create table if not exists public.car_events (
  id uuid primary key default gen_random_uuid(),
  car_table text not null check (car_table in ('imported_cars', 'inventory_cars')),
  car_id uuid not null,
  user_id uuid default auth.uid(),
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists car_events_car_idx on public.car_events(car_table, car_id, created_at desc);

alter table public.car_events enable row level security;
drop policy if exists "car_events_select" on public.car_events;
-- Se ve el historial de los coches que se pueden ver (se aplican las reglas de cada tabla)
create policy "car_events_select" on public.car_events for select to authenticated
  using (
    public.has_app_role('admin', 'super_admin')
    or (car_table = 'imported_cars' and exists (select 1 from public.imported_cars c where c.id = car_events.car_id))
    or (car_table = 'inventory_cars' and exists (select 1 from public.inventory_cars c where c.id = car_events.car_id))
  );
-- Sin políticas de escritura: solo escriben los triggers

create or replace function public.log_car_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[];
  tracked text[];
  done_steps int;
  car uuid;
begin
  if TG_OP = 'UPDATE' then
    select coalesce(array_agg(e.key), '{}') into changed
      from jsonb_each(to_jsonb(new)) e
     where e.value is distinct from (to_jsonb(old) -> e.key)
       and e.key not in ('updated_at', 'created_at');
    if array_length(changed, 1) is null then
      return new;
    end if;
  end if;

  -- Coches de importación ------------------------------------------------------
  if TG_TABLE_NAME = 'imported_cars' then
    if TG_OP = 'INSERT' then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', new.id, 'created', jsonb_build_object('brand', new.brand, 'model', new.model, 'price', new.price));
      return new;
    elsif TG_OP = 'DELETE' then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', old.id, 'deleted', jsonb_build_object('brand', old.brand, 'model', old.model));
      return old;
    end if;

    tracked := array['contacted', 'pipeline_stage', 'price', 'total_cost', 'shared_with', 'expenses', 'import_tax', 'shipping_cost', 'registration_tax', 'other_costs'];
    if 'contacted' = any(changed) then
      insert into car_events(car_table, car_id, event) values ('imported_cars', new.id, case when new.contacted then 'contacted' else 'uncontacted' end);
    end if;
    if 'pipeline_stage' = any(changed) then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', new.id, 'stage', jsonb_build_object('from', old.pipeline_stage, 'to', new.pipeline_stage));
    end if;
    if 'price' = any(changed) then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', new.id, 'price', jsonb_build_object('from', old.price, 'to', new.price));
    end if;
    if 'total_cost' = any(changed) then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', new.id, 'cost', jsonb_build_object('from', old.total_cost, 'to', new.total_cost));
    end if;
    if 'shared_with' = any(changed) then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', new.id, 'shared', jsonb_build_object('count', coalesce(cardinality(new.shared_with), 0)));
    end if;
    if exists (select 1 from unnest(changed) k where k <> all(tracked)) then
      insert into car_events(car_table, car_id, event, details)
      values ('imported_cars', new.id, 'updated', jsonb_build_object('fields', (select to_jsonb(array_agg(k)) from unnest(changed) k where k <> all(tracked))));
    end if;
    return new;
  end if;

  -- Coches comprados -----------------------------------------------------------
  if TG_TABLE_NAME = 'inventory_cars' then
    if TG_OP = 'INSERT' then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'bought', jsonb_build_object('price', new.initial_price, 'expenses', new.initial_expenses, 'date', new.date_purchased));
      if new.imported_car_id is not null then
        insert into car_events(car_table, car_id, event, details)
        values ('imported_cars', new.imported_car_id, 'moved_to_inventory', jsonb_build_object('inventory_id', new.id));
      end if;
      return new;
    elsif TG_OP = 'DELETE' then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', old.id, 'deleted', jsonb_build_object('brand', old.brand, 'model', old.model));
      return old;
    end if;

    tracked := array['logistic_status', 'status', 'sell_price', 'date_sold', 'buyer', 'customer_id', 'documents', 'matriculation_checklist', 'invoice_number', 'invoice_date', 'vat_regime', 'plate', 'vin'];
    if 'logistic_status' = any(changed) then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'logistic', jsonb_build_object('from', old.logistic_status, 'to', new.logistic_status));
    end if;
    if 'status' = any(changed) and new.status = 'sold' then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'sold', jsonb_build_object('price', new.sell_price, 'buyer', new.buyer, 'date', new.date_sold));
    elsif 'sell_price' = any(changed) and new.status = 'sold' then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'sale_updated', jsonb_build_object('from', old.sell_price, 'to', new.sell_price));
    end if;
    if 'documents' = any(changed) then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'documents', jsonb_build_object(
        'from', coalesce(jsonb_array_length(case when jsonb_typeof(to_jsonb(old.documents)) = 'array' then to_jsonb(old.documents) end), 0),
        'to', coalesce(jsonb_array_length(case when jsonb_typeof(to_jsonb(new.documents)) = 'array' then to_jsonb(new.documents) end), 0)));
    end if;
    if 'matriculation_checklist' = any(changed) then
      select count(*) into done_steps from jsonb_each(coalesce(to_jsonb(new.matriculation_checklist), '{}'::jsonb)) e where e.value = 'true'::jsonb;
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'matriculation', jsonb_build_object('done', done_steps, 'total', 6));
    end if;
    if 'invoice_number' = any(changed) and new.invoice_number is not null then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'invoiced', jsonb_build_object('number', new.invoice_number));
    end if;
    if exists (select 1 from unnest(changed) k where k <> all(tracked)) then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.id, 'updated', jsonb_build_object('fields', (select to_jsonb(array_agg(k)) from unnest(changed) k where k <> all(tracked))));
    end if;
    return new;
  end if;

  -- Gastos de un coche comprado --------------------------------------------------
  if TG_TABLE_NAME = 'car_expenses' then
    if TG_OP = 'INSERT' then
      insert into car_events(car_table, car_id, event, details)
      values ('inventory_cars', new.car_id, 'expense_added', jsonb_build_object('concept', new.concept, 'amount', new.amount, 'category', new.category));
      return new;
    elsif TG_OP = 'DELETE' then
      car := old.car_id;
      -- Si se borra el coche entero, sus gastos se borran en cascada: no ensuciar el historial
      if exists (select 1 from public.inventory_cars where id = car) then
        insert into car_events(car_table, car_id, event, details)
        values ('inventory_cars', car, 'expense_removed', jsonb_build_object('concept', old.concept, 'amount', old.amount));
      end if;
      return old;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists log_car_event on public.imported_cars;
create trigger log_car_event after insert or update or delete on public.imported_cars
  for each row execute function public.log_car_event();
drop trigger if exists log_car_event on public.inventory_cars;
create trigger log_car_event after insert or update or delete on public.inventory_cars
  for each row execute function public.log_car_event();
drop trigger if exists log_car_event on public.car_expenses;
create trigger log_car_event after insert or delete on public.car_expenses
  for each row execute function public.log_car_event();

commit;

-- -----------------------------------------------------------------------------
-- Comprobación rápida (opcional): debería devolver 0 filas sin iniciar sesión.
--   set role anon; select count(*) from public.imported_cars; reset role;
-- -----------------------------------------------------------------------------
