-- Script para actualizar app_settings de jsonb a boolean
-- Ejecutar en Supabase SQL Editor

-- 1. Eliminar políticas existentes
drop policy if exists "Public read access" on app_settings;
drop policy if exists "Admin write access" on app_settings;
drop policy if exists "Authenticated update" on app_settings;
drop policy if exists "Authenticated insert" on app_settings;

-- 2. Eliminar tabla existente y recrear
drop table if exists app_settings cascade;

-- 3. Crear tabla con el tipo correcto
create table app_settings (
  key text primary key,
  value boolean not null default false,
  description text,
  updated_at timestamp with time zone default now()
);

-- 4. Configurar Seguridad (RLS)
alter table app_settings enable row level security;

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

-- 5. Insertar configuración por defecto
insert into app_settings (key, value, description)
values
  ('donations_enabled', false, 'Toggle visibility of the Donations tab'),
  ('registrations_enabled', true, 'Allow new user registrations');

-- 6. Habilitar Realtime para esta tabla
alter publication supabase_realtime add table app_settings;

-- 7. Crear función para actualizar updated_at automáticamente
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 8. Crear trigger para updated_at
drop trigger if exists update_app_settings_updated_at on app_settings;
create trigger update_app_settings_updated_at
  before update on app_settings
  for each row
  execute function update_updated_at_column();
