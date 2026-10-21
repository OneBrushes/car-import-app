-- =====================================================================================================================
-- NorDrive · Conversaciones con vendedores y "vendido por el vendedor"
-- Ejecutar una vez en Supabase → SQL Editor (se puede volver a ejecutar sin problema).
--
-- 1. imported_cars.seller_sold_at: el vendedor ya ha vendido el coche. A los 30 días se borran los datos del coche,
--    pero la conversación se conserva (guarda una copia de los datos básicos del coche).
-- 2. car_conversations: la conversación con el vendedor de cada coche (mensajes enviados y respuestas).
-- 3. purge_seller_sold_cars(): borra los coches marcados hace más de 30 días. La app la llama al abrir la pestaña
--    de importación; opcionalmente se puede programar con pg_cron (al final del archivo).
-- =====================================================================================================================

alter table public.imported_cars add column if not exists seller_sold_at timestamptz;

create table if not exists public.car_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- se queda en null cuando se borra el coche: la conversación sigue
  car_id uuid references public.imported_cars(id) on delete set null,
  -- copia de los datos del coche para cuando ya no exista
  car_title text not null default '',
  car_url text,
  car_snapshot jsonb not null default '{}'::jsonb,
  language text not null default 'de',
  -- [{ "from": "me" | "seller", "text": "...", "at": "2026-10-21T10:00:00Z" }]
  messages jsonb not null default '[]'::jsonb,
  seller_sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists car_conversations_car_unique on public.car_conversations(car_id) where car_id is not null;
create index if not exists car_conversations_user_idx on public.car_conversations(user_id, updated_at desc);

alter table public.car_conversations enable row level security;

drop policy if exists "car_conversations_own" on public.car_conversations;
create policy "car_conversations_own" on public.car_conversations for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

-- Al marcar un coche como vendido por el vendedor, la conversación guarda la fecha
create or replace function public.sync_conversation_seller_sold()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.seller_sold_at is distinct from old.seller_sold_at then
    update public.car_conversations set seller_sold_at = new.seller_sold_at, updated_at = now() where car_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists imported_cars_seller_sold on public.imported_cars;
create trigger imported_cars_seller_sold after update of seller_sold_at on public.imported_cars
  for each row execute function public.sync_conversation_seller_sold();

-- Borra los coches del usuario marcados como vendidos hace más de 30 días (la conversación se queda)
create or replace function public.purge_seller_sold_cars()
returns integer language plpgsql security invoker set search_path = public as $$
declare removed integer;
begin
  delete from public.imported_cars
   where user_id = auth.uid()
     and seller_sold_at is not null
     and seller_sold_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end $$;

grant execute on function public.purge_seller_sold_cars() to authenticated;

-- Opcional: borrado automático cada noche para todos los usuarios aunque no abran la app.
-- Requiere la extensión pg_cron (Database → Extensions → pg_cron). Descomentar y ejecutar:
-- select cron.schedule('purge-seller-sold-cars', '15 3 * * *', $$
--   delete from public.imported_cars where seller_sold_at is not null and seller_sold_at < now() - interval '30 days'
-- $$);
