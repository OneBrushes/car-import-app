-- 1. Crear tabla base si no existe
create table if not exists app_settings (
  key text primary key,
  value boolean not null default false,
  description text,
  updated_at timestamp with time zone default now()
);

-- 2. Configurar Seguridad (RLS)
alter table app_settings enable row level security;

-- Limpiar políticas antiguas para evitar duplicados
drop policy if exists "Public read access" on app_settings;
drop policy if exists "Admin write access" on app_settings;

-- Políticas: Todos pueden leer, solo admins pueden escribir
create policy "Public read access" 
  on app_settings for select 
  using (true);

create policy "Admin write access" 
  on app_settings for all 
  to authenticated
  using (
    exists (
      select 1 from profiles 
      where profiles.id = auth.uid() 
      and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles 
      where profiles.id = auth.uid() 
      and profiles.role = 'admin'
    )
  );

-- 3. Insertar configuración por defecto
insert into app_settings (key, value, description)
values
  ('donations_enabled', false, 'Toggle visibility of the Donations tab'),
  ('registrations_enabled', true, 'Allow new user registrations')
on conflict (key) do update
set description = excluded.description;

-- 4. Habilitar Realtime para esta tabla
alter publication supabase_realtime add table app_settings;
