-- =====================================================================================================================
-- NorDrive · Enlace del mapa en "por dónde va"
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-10_coches_de_cliente.sql (se puede repetir sin problema).
--
--  · client_portal_cars.location_url: enlace de Google Maps o Apple Maps de dónde está el coche. Lo pegas desde el
--    móvil (o lo crea el botón "Usar mi ubicación") en la tarjeta del coche; el cliente pulsa "Ver en el mapa".
--  · Solo se aceptan enlaces https de Google Maps / Apple Maps.
-- =====================================================================================================================

begin;

alter table public.client_portal_cars add column if not exists location_url text;

alter table public.client_portal_cars drop constraint if exists client_portal_cars_location_url_check;
alter table public.client_portal_cars add constraint client_portal_cars_location_url_check check (
  location_url is null
  or location_url ~* '^https://((www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps|maps\.apple\.com)(/|\?|$)'
);

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
  destination text,
  current_location text,
  location_url text,         -- enlace de Google Maps / Apple Maps (el cliente lo abre con "Ver en el mapa")
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
         case
           when i.status = 'sold' or i.logistic_status = 'delivered' then 'delivered'
           when i.logistic_status = 'preparing' then 'detailing'
           else coalesce(i.logistic_status::text, 'purchased')
         end,
         left(i.date_purchased::text, 10),
         case
           when i.logistic_status = 'delivered' then left(coalesce(i.delivered_at::text, i.date_sold::text), 10)
           when i.status = 'sold' then left(i.date_sold::text, 10)
         end,
         coalesce(nullif(p.transport_mode, ''), 'conduciendo'),
         p.note,
         nullif(trim(p.destination), ''),
         p.current_location,
         p.location_url,
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
