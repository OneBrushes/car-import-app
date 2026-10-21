-- =====================================================================================================================
-- NorDrive · Conversación en las propuestas: el cliente comenta un coche propuesto y tú le contestas desde la app
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-10_area_clientes_v2.sql (se puede repetir sin problema).
--
--  · client_proposals.thread: [{ "from": "client" | "nordrive", "text": "...", "at": "2026-10-21T10:00:00Z" }]
--  · El cliente escribe con portal_comment_proposal() (te llega un aviso en la app); tú contestas desde la app.
--  · client_comment se mantiene como "último comentario del cliente" (para las etiquetas de las tarjetas).
-- =====================================================================================================================

begin;

alter table public.client_proposals add column if not exists thread jsonb not null default '[]'::jsonb;

-- Los comentarios que ya había pasan a ser el primer mensaje de la conversación
update public.client_proposals
   set thread = jsonb_build_array(jsonb_build_object('from', 'client', 'text', client_comment, 'at', coalesce(reacted_at, created_at)))
 where client_comment is not null and thread = '[]'::jsonb;

-- Valorar ya no borra el comentario si no se manda uno nuevo
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

  if favorite then
    update public.client_proposals set is_favorite = false where customer_id = pr.customer_id and id <> pr.id and is_favorite;
  end if;

  update public.client_proposals
     set reaction = new_reaction,
         client_comment = coalesce(nullif(left(trim(coalesce(new_comment, '')), 1000), ''), client_comment),
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
         else customer_name || ' ha cambiado su valoración' end,
    car_name,
    null,
    jsonb_build_object('proposal_id', pr.id, 'imported_car_id', pr.imported_car_id, 'customer_id', pr.customer_id,
                       'reaction', new_reaction, 'favorite', favorite)
  );
end;
$$;
grant execute on function public.portal_react_proposal(uuid, text, text, boolean) to authenticated;

-- El cliente escribe en la conversación de una propuesta
create or replace function public.portal_comment_proposal(proposal uuid, body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr record;
  clean text := left(trim(coalesce(body, '')), 1000);
  car_name text;
  customer_name text;
begin
  if clean = '' then
    raise exception 'El mensaje está vacío';
  end if;
  select * into pr from public.client_proposals
   where id = proposal and customer_id in (select public.portal_customer_ids());
  if not found then
    raise exception 'Propuesta no encontrada';
  end if;
  if jsonb_array_length(pr.thread) >= 200 then
    raise exception 'La conversación es demasiado larga';
  end if;

  update public.client_proposals
     set thread = thread || jsonb_build_array(jsonb_build_object('from', 'client', 'text', clean, 'at', now())),
         client_comment = clean,
         reacted_at = now()
   where id = pr.id;

  select trim(coalesce(c.brand, '') || ' ' || coalesce(c.model, '')) into car_name from public.imported_cars c where c.id = pr.imported_car_id;
  select name into customer_name from public.customers where id = pr.customer_id;

  insert into public.notifications (user_id, type, title, message, link, metadata)
  values (pr.user_id, 'client_proposal', customer_name || ' te ha escrito sobre un coche',
          car_name || ' · «' || left(clean, 140) || '»', null,
          jsonb_build_object('proposal_id', pr.id, 'imported_car_id', pr.imported_car_id, 'customer_id', pr.customer_id));
end;
$$;
grant execute on function public.portal_comment_proposal(uuid, text) to authenticated;

-- Tú contestas desde la app (se aplican las reglas normales: solo quien puede gestionar esa propuesta)
create or replace function public.reply_proposal(proposal uuid, body text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.client_proposals
     set thread = thread || jsonb_build_array(jsonb_build_object('from', 'nordrive', 'text', left(trim(body), 2000), 'at', now()))
   where id = proposal and trim(coalesce(body, '')) <> ''
  returning thread
$$;
grant execute on function public.reply_proposal(uuid, text) to authenticated;

-- La web recibe también la conversación (cambia el tipo de resultado: hay que borrarla y crearla de nuevo)
drop function if exists public.portal_my_proposals();
create function public.portal_my_proposals()
returns table (
  id uuid,
  brand text, model text, year integer, month integer, mileage numeric, cv numeric, fuel_type text, transmission text,
  color text, origin text, images text[], equipment text[],
  client_price numeric, message text,
  reaction text, client_comment text, is_favorite boolean,
  checklist jsonb,
  thread jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, c.brand::text, c.model::text, nullif(c.year::text, '')::numeric::integer, nullif(c.month::text, '')::numeric::integer,
         c.mileage::numeric, c.cv::numeric, c.fuel_type::text, c.transmission::text,
         c.color::text, coalesce(nullif(c.location::text, ''), nullif(c.origin::text, '')),
         coalesce(nullif(c.images::text[], '{}'), case when c.image_url is not null then array[c.image_url::text] end, '{}'::text[]),
         coalesce(c.equipment::text[], '{}'::text[]),
         pr.client_price, pr.message, pr.reaction, pr.client_comment, pr.is_favorite,
         coalesce(cl.data::jsonb, '{}'::jsonb),
         pr.thread,
         pr.created_at
    from public.client_proposals pr
    join public.imported_cars c on c.id = pr.imported_car_id
    left join public.car_checklists cl on cl.car_id = pr.imported_car_id
   where pr.customer_id in (select public.portal_customer_ids())
   order by pr.is_favorite desc, pr.created_at desc
$$;
grant execute on function public.portal_my_proposals() to authenticated;

commit;
