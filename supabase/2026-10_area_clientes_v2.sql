-- =====================================================================================================================
-- NorDrive · Área de clientes v2: los datos salen de la app, checks con fotos y propuestas de coches
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-10_area_clientes.sql (se puede repetir sin problema).
--
--  · El coche del cliente ya no se rellena a mano: la web lee de la app (marca, modelo, año, km, fotos, fase del
--    tablero de Comprados y los checks de la inspección) a través de funciones que solo devuelven datos seguros
--    (nunca precio de compra, gastos ni márgenes).
--  · client_portal_cars queda como el enlace coche ↔ cliente + lo que tú añades (cómo viaja, nota, documentos y
--    fotos extra).
--  · client_proposals: coches que aún no ha comprado y que le propones; el cliente los valora, comenta y elige
--    favorito; a ti te llega un aviso en la app.
-- =====================================================================================================================

begin;

-- 1. Enlace coche ↔ cliente: lo que antes se escribía a mano ya no hace falta ---------------------------------------
alter table public.client_portal_cars add column if not exists note text;            -- nota para el cliente (opcional)
alter table public.client_portal_cars alter column title set default '';
update public.client_portal_cars set transport_mode = 'conduciendo' where coalesce(transport_mode, '') = '';
alter table public.client_portal_cars alter column transport_mode set default 'conduciendo';

-- 2. Coches comprados del cliente, con los datos de la app ----------------------------------------------------------
create or replace function public.portal_my_cars()
returns table (
  id uuid,
  brand text, model text, year integer, mileage numeric, cv numeric, fuel_type text, transmission text, color text,
  origin text, images text[],
  stage text,                -- 'purchased' | 'in_transit' | 'homologation' | 'detailing' | 'ready' | 'delivered'
  purchased_on text,         -- fecha tal y como está en la app (AAAA-MM-DD)
  delivered_on text,
  transport_mode text,       -- 'conduciendo' | 'camion'
  note text,
  checklist jsonb,           -- { "<punto>": { checked, note, photos: [url] } }
  checklist_updated_at timestamptz,
  photos jsonb, documents jsonb,
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
         coalesce(cl.data::jsonb, '{}'::jsonb),
         cl.updated_at::timestamptz,
         p.photos, p.documents,
         greatest(p.updated_at, cl.updated_at::timestamptz)
    from public.client_portal_cars p
    join public.inventory_cars i on i.id = p.inventory_car_id
    left join public.imported_cars ic on ic.id = i.imported_car_id
    left join public.car_checklists cl on cl.car_id = i.imported_car_id
   where p.published
     and p.customer_id in (select public.portal_customer_ids())
   order by greatest(p.updated_at, cl.updated_at::timestamptz) desc nulls last
$$;
grant execute on function public.portal_my_cars() to authenticated;

-- 3. Propuestas: coches encontrados que compartes con un cliente -------------------------------------------------------
create table if not exists public.client_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  imported_car_id uuid not null references public.imported_cars(id) on delete cascade,
  client_price numeric,            -- precio para el cliente (opcional; si no, no se enseña precio)
  message text,                    -- comentario tuyo para el cliente (opcional)
  reaction text check (reaction in ('like', 'dislike')),
  client_comment text,
  is_favorite boolean not null default false,
  reacted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, imported_car_id)
);
create index if not exists client_proposals_car_idx on public.client_proposals(imported_car_id);

alter table public.client_proposals enable row level security;
drop policy if exists "proposals_staff" on public.client_proposals;
create policy "proposals_staff" on public.client_proposals for all to authenticated
  using (public.is_active_user() and exists (select 1 from public.imported_cars c where c.id = client_proposals.imported_car_id))
  with check (public.has_app_role('gestor', 'importador', 'admin', 'super_admin')
              and exists (select 1 from public.imported_cars c where c.id = client_proposals.imported_car_id));

-- El cliente ve sus propuestas con los datos del coche (sin precio de compra ni costes)
create or replace function public.portal_my_proposals()
returns table (
  id uuid,
  brand text, model text, year integer, month integer, mileage numeric, cv numeric, fuel_type text, transmission text,
  color text, origin text, images text[], equipment text[],
  client_price numeric, message text,
  reaction text, client_comment text, is_favorite boolean,
  checklist jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, c.brand::text, c.model::text, nullif(c.year::text, '')::numeric::integer, nullif(c.month::text, '')::numeric::integer, c.mileage::numeric, c.cv::numeric,
         c.fuel_type::text, c.transmission::text,
         c.color::text, coalesce(nullif(c.location::text, ''), nullif(c.origin::text, '')),
         coalesce(nullif(c.images::text[], '{}'), case when c.image_url is not null then array[c.image_url::text] end, '{}'::text[]),
         coalesce(c.equipment::text[], '{}'::text[]),
         pr.client_price, pr.message, pr.reaction, pr.client_comment, pr.is_favorite,
         coalesce(cl.data::jsonb, '{}'::jsonb),
         pr.created_at
    from public.client_proposals pr
    join public.imported_cars c on c.id = pr.imported_car_id
    left join public.car_checklists cl on cl.car_id = pr.imported_car_id
   where pr.customer_id in (select public.portal_customer_ids())
   order by pr.is_favorite desc, pr.created_at desc
$$;
grant execute on function public.portal_my_proposals() to authenticated;

-- El cliente valora una propuesta (y opcionalmente la marca como favorita). Avisa a quien se la compartió.
create or replace function public.portal_react_proposal(proposal uuid, new_reaction text, new_comment text, favorite boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr record;
  car_name text;
  customer_name text;
begin
  select * into pr from public.client_proposals
   where id = proposal and customer_id in (select public.portal_customer_ids());
  if not found then
    raise exception 'Propuesta no encontrada';
  end if;
  if new_reaction is not null and new_reaction not in ('like', 'dislike') then
    raise exception 'Valoración no válida';
  end if;

  -- solo un favorito por cliente
  if favorite then
    update public.client_proposals set is_favorite = false where customer_id = pr.customer_id and id <> pr.id and is_favorite;
  end if;

  update public.client_proposals
     set reaction = new_reaction,
         client_comment = nullif(left(trim(coalesce(new_comment, '')), 1000), ''),
         is_favorite = coalesce(favorite, false),
         reacted_at = now()
   where id = pr.id;

  select trim(coalesce(c.brand, '') || ' ' || coalesce(c.model, '')) into car_name from public.imported_cars c where c.id = pr.imported_car_id;
  select name into customer_name from public.customers where id = pr.customer_id;

  insert into public.notifications (user_id, type, title, message, link, metadata)
  values (
    pr.user_id,
    'client_proposal',
    case when favorite then customer_name || ' ha elegido su favorito'
         when new_reaction = 'like' then customer_name || ' quiere un coche que le propusiste'
         when new_reaction = 'dislike' then customer_name || ' ha descartado un coche'
         else customer_name || ' ha comentado una propuesta' end,
    car_name || coalesce(' · «' || nullif(left(trim(coalesce(new_comment, '')), 140), '') || '»', ''),
    null,
    jsonb_build_object('proposal_id', pr.id, 'imported_car_id', pr.imported_car_id, 'customer_id', pr.customer_id,
                       'reaction', new_reaction, 'favorite', favorite)
  );
end;
$$;
grant execute on function public.portal_react_proposal(uuid, text, text, boolean) to authenticated;

commit;
