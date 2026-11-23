-- Revisión diaria v2: Worker por tandas (sin mobile.de) + script del PC de casa (solo mobile.de) + resumen por día.

-- 1) Precio con el que se guardó el coche, antes del primer cambio de precio (bajadas y subidas se recalculan)
alter table public.coches_claude add column if not exists precio_original integer;

-- 2) Valor de Hacienda "pendiente": no está en las tablas del BOE y no se usa el precio de compra
alter table public.coches_claude drop constraint if exists coches_claude_valor_hacienda_origen_check;
alter table public.coches_claude add constraint coches_claude_valor_hacienda_origen_check
  check (valor_hacienda_origen in ('claude', 'tabla', 'pendiente'));

-- 3) Resumen de cada revisión (una fila por ejecución del Worker y una por pasada del script local)
create table if not exists public.revisiones (
  id bigserial primary key,
  fecha date not null,                       -- día de Madrid
  origen text not null check (origen in ('worker', 'local')),
  inicio timestamptz not null default now(),
  fin timestamptz,
  revisados integer not null default 0,
  activos integer not null default 0,
  retirados integer not null default 0,
  cambios_precio integer not null default 0,
  errores integer not null default 0,
  -- true = no quedaba nada por revisar de ese origen ese día (el script local no repite el día)
  completa boolean not null default false,
  detalle jsonb not null default '{}'
);
create index if not exists revisiones_fecha_idx on public.revisiones (fecha desc, origen);

alter table public.revisiones enable row level security;
drop policy if exists "revisiones_owner" on public.revisiones;
create policy "revisiones_owner" on public.revisiones for select to authenticated using (public.is_claude_owner());

-- 4) Guardar muchas revisiones en una sola llamada (el Worker gratuito tiene 50 peticiones por ejecución).
--    cambios = [{ "id": uuid, "patch": { columna: valor, ... } }, ...]. Las columnas que no existen se ignoran.
create or replace function public.aplicar_revisiones_anuncios(cambios jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  c jsonb;
  sets text;
  n integer := 0;
begin
  for c in select * from jsonb_array_elements(cambios) loop
    select string_agg(format('%I = (jsonb_populate_record(null::public.coches_claude, $1)).%I', k, k), ', ')
      into sets
      from jsonb_object_keys(c->'patch') as k
      where k <> 'id' and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'coches_claude' and column_name = k
      );
    if sets is not null then
      execute format('update public.coches_claude set %s where id = $2', sets) using c->'patch', (c->>'id')::uuid;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.aplicar_revisiones_anuncios(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_revisiones_anuncios(jsonb) to service_role;

notify pgrst, 'reload schema';
