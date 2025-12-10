-- 1. Crear tabla base si no existe
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default now()
);

-- 2. Añadir columna description si no existe (A prueba de fallos)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'app_settings' and column_name = 'description') then
    alter table app_settings add column description text;
  end if;
end $$;

-- 3. Configurar Seguridad (RLS)
alter table app_settings enable row level security;

-- Limpiar políticas antiguas para evitar duplicados
drop policy if exists "Public read access" on app_settings;
drop policy if exists "Authenticated update" on app_settings;
drop policy if exists "Authenticated insert" on app_settings;

-- Crear políticas
create policy "Public read access" on app_settings for select using (true);
create policy "Authenticated update" on app_settings for update to authenticated using (true) with check (true);
create policy "Authenticated insert" on app_settings for insert to authenticated with check (true);

-- 4. Insertar configuración por defecto
insert into app_settings (key, value, description)
values
  ('donations_enabled', 'false'::jsonb, 'Toggle visibility of the Donations tab')
on conflict (key) do update
set description = excluded.description; -- Actualizar descripción si ya existe
