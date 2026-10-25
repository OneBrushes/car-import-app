-- =====================================================================================================================
-- NorDrive · Estado del área de clientes: si el cliente ya se ha registrado, su última conexión y si está en línea
-- Ejecutar una vez en Supabase → SQL Editor, después de 2026-10_area_clientes.sql (se puede repetir sin problema).
--
--  · portal_presence: última vez que se vio a cada cliente con su área abierta. La web la actualiza cada minuto
--    mientras el cliente la tiene abierta (portal_heartbeat). Nadie la lee directamente, solo con las funciones.
--  · portal_access_status(): para la app (equipo): invitación, registro, último inicio de sesión y última actividad.
-- =====================================================================================================================

begin;

create table if not exists public.portal_presence (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.portal_presence enable row level security;

-- La web: "sigo aquí" (solo actualiza las fichas del propio cliente)
create or replace function public.portal_heartbeat()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.portal_presence (customer_id, last_seen)
  select id, now() from public.portal_customer_ids() as id
  on conflict (customer_id) do update set last_seen = excluded.last_seen;
$$;
grant execute on function public.portal_heartbeat() to authenticated;

-- La app: estado de la cuenta de cada cliente con área de clientes
create or replace function public.portal_access_status()
returns table (
  customer_id uuid,
  invited_at timestamptz,
  registered boolean,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.has_app_role('gestor', 'importador', 'admin', 'super_admin') then
    raise exception 'Sin permiso';
  end if;
  return query
    select c.id,
           u.invited_at,
           (u.id is not null and (u.email_confirmed_at is not null or u.last_sign_in_at is not null)),
           u.email_confirmed_at,
           u.last_sign_in_at,
           p.last_seen
      from public.customers c
      left join auth.users u on lower(u.email) = lower(c.email)
      left join public.portal_presence p on p.customer_id = c.id
     where c.portal_access and c.email is not null;
end;
$$;
grant execute on function public.portal_access_status() to authenticated;

commit;
