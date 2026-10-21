-- =====================================================================================================================
-- NorDrive · Reseñas de los clientes y "por dónde va el coche"
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-10_area_clientes_v2.sql (se puede repetir sin problema).
--
--  · client_portal_cars.destination ("Camino a …") + current_location ("Ahora en …") + location_updated_at:
--    por dónde va el coche cuando está en ruta (lo escribes tú en la tarjeta del coche en Comprados, debajo de
--    "Trámites de matriculación"; el cliente lo ve en la web).
--  · client_reviews: cuando el coche está entregado, el cliente deja su valoración (estrellas, qué le ha gustado y
--    qué cambiaría). Tú la ves en su ficha de cliente y te llega un aviso.
-- =====================================================================================================================

begin;

alter table public.client_portal_cars add column if not exists current_location text;
alter table public.client_portal_cars add column if not exists location_updated_at timestamptz;

create table if not exists public.client_reviews (
  id uuid primary key default gen_random_uuid(),
  portal_car_id uuid not null unique references public.client_portal_cars(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  inventory_car_id uuid references public.inventory_cars(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  liked text,       -- qué le ha gustado
  improve text,     -- qué cambiaría
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_reviews_customer_idx on public.client_reviews(customer_id);

alter table public.client_reviews enable row level security;
drop policy if exists "reviews_staff_select" on public.client_reviews;
create policy "reviews_staff_select" on public.client_reviews for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.customers c where c.id = client_reviews.customer_id));
drop policy if exists "reviews_staff_delete" on public.client_reviews;
create policy "reviews_staff_delete" on public.client_reviews for delete to authenticated
  using (public.has_app_role('admin', 'super_admin'));

-- El cliente deja (o cambia) su reseña de un coche ya entregado
create or replace function public.portal_submit_review(portal_car uuid, stars integer, liked_text text, improve_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  inv record;
  customer_name text;
  car_name text;
begin
  if stars is null or stars < 1 or stars > 5 then
    raise exception 'La valoración va de 1 a 5 estrellas';
  end if;
  select * into p from public.client_portal_cars
   where id = portal_car and published and customer_id in (select public.portal_customer_ids());
  if not found then
    raise exception 'Coche no encontrado';
  end if;
  select * into inv from public.inventory_cars where id = p.inventory_car_id;
  if coalesce(inv.status, '') <> 'sold' then
    raise exception 'Podrás valorar cuando te hayamos entregado el coche';
  end if;

  insert into public.client_reviews (portal_car_id, customer_id, inventory_car_id, rating, liked, improve)
  values (p.id, p.customer_id, p.inventory_car_id, stars,
          nullif(left(trim(coalesce(liked_text, '')), 2000), ''), nullif(left(trim(coalesce(improve_text, '')), 2000), ''))
  on conflict (portal_car_id) do update
     set rating = excluded.rating, liked = excluded.liked, improve = excluded.improve, updated_at = now();

  select name into customer_name from public.customers where id = p.customer_id;
  car_name := trim(coalesce(inv.brand, '') || ' ' || coalesce(inv.model, ''));
  insert into public.notifications (user_id, type, title, message, link, metadata)
  values (p.user_id, 'client_review', customer_name || ' ha dejado su reseña · ' || repeat('★', stars),
          car_name || coalesce(' · «' || left(nullif(trim(coalesce(improve_text, liked_text, '')), ''), 140) || '»', ''), null,
          jsonb_build_object('customer_id', p.customer_id, 'portal_car_id', p.id, 'rating', stars));
end;
$$;
grant execute on function public.portal_submit_review(uuid, integer, text, text) to authenticated;

-- Coches del cliente: se añaden por dónde va y su reseña (cambia el tipo de resultado: borrar y crear)
drop function if exists public.portal_my_cars();
create function public.portal_my_cars()
returns table (
  id uuid,
  brand text, model text, year integer, mileage numeric, cv numeric, fuel_type text, transmission text, color text,
  origin text, images text[],
  stage text,
  purchased_on text,
  delivered_on text,
  transport_mode text,
  note text,
  destination text,          -- "Camino a …" (lo escribes tú en la tarjeta del coche)
  current_location text,
  location_updated_at timestamptz,
  checklist jsonb,
  checklist_updated_at timestamptz,
  photos jsonb, documents jsonb,
  review_rating integer, review_liked text, review_improve text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(i.brand::text, ic.brand::text), coalesce(i.model::text, ic.model::text),
         nullif(coalesce(i.year::text, ic.year::text), '')::numeric::integer,
         coalesce(i.mileage::numeric, ic.mileage::numeric), ic.cv::numeric, ic.fuel_type::text, ic.transmission::text, ic.color::text,
         coalesce(nullif(ic.location::text, ''), nullif(ic.origin::text, '')),
         coalesce(nullif(ic.images::text[], '{}'), case when ic.image_url is not null then array[ic.image_url::text] end, '{}'::text[]),
         case when i.status = 'sold' then 'delivered' else coalesce(i.logistic_status::text, 'purchased') end,
         left(i.date_purchased::text, 10),
         case when i.status = 'sold' then left(i.date_sold::text, 10) end,
         coalesce(nullif(p.transport_mode, ''), 'conduciendo'),
         p.note,
         nullif(trim(p.destination), ''),
         p.current_location,
         p.location_updated_at,
         coalesce(cl.data::jsonb, '{}'::jsonb),
         cl.updated_at::timestamptz,
         p.photos, p.documents,
         r.rating, r.liked, r.improve,
         greatest(p.updated_at, cl.updated_at::timestamptz)
    from public.client_portal_cars p
    join public.inventory_cars i on i.id = p.inventory_car_id
    left join public.imported_cars ic on ic.id = i.imported_car_id
    left join public.car_checklists cl on cl.car_id = i.imported_car_id
    left join public.client_reviews r on r.portal_car_id = p.id
   where p.published
     and p.customer_id in (select public.portal_customer_ids())
   order by greatest(p.updated_at, cl.updated_at::timestamptz) desc nulls last
$$;
grant execute on function public.portal_my_cars() to authenticated;

commit;
