-- 1. Obtener tamaño real de la Base de Datos
create or replace function get_database_size()
returns bigint
language sql
security definer
as $$
  select pg_database_size(current_database());
$$;

-- 2. Obtener tamaño real del Storage (Archivos)
create or replace function get_storage_size()
returns bigint
language plpgsql
security definer
as $$
declare
  total_size bigint;
begin
  select sum((metadata->>'size')::bigint)
  into total_size
  from storage.objects;
  
  return coalesce(total_size, 0);
end;
$$;

-- 3. Obtener conteo exacto de usuarios
create or replace function get_users_count()
returns bigint
language sql
security definer
as $$
  select count(*) from auth.users;
$$;
