-- Precios medios de venta de Hacienda (Orden HAC/1501/2025, BOE-A-2025-26357, anexo I: turismos y todoterrenos).
-- Valor del coche nuevo con el que se calcula el impuesto de matriculación. Se rellena con scripts/import-hacienda.ts.
create table if not exists public.valores_hacienda (
  id bigserial primary key,
  ejercicio smallint not null default 2026,
  marca text not null,
  modelo text not null,
  inicio smallint,
  fin smallint,
  cc integer,
  cilindros smallint,
  combustible text,
  kw numeric,
  cvf numeric,
  cv integer,
  valor integer not null
);

create index if not exists valores_hacienda_marca_modelo_periodo_idx
  on public.valores_hacienda (ejercicio, marca, modelo, inicio, fin);

-- Datos públicos del BOE: los puede leer cualquier usuario con sesión; solo el servidor (service role) escribe
alter table public.valores_hacienda enable row level security;
drop policy if exists "valores_hacienda lectura" on public.valores_hacienda;
create policy "valores_hacienda lectura" on public.valores_hacienda for select to authenticated using (true);

-- Marcas que hay en las tablas (para encontrar "Mercedes" → "MERCEDES-BENZ", etc.)
create or replace function public.hacienda_marcas()
returns table (marca text)
language sql stable
as $$ select distinct marca from public.valores_hacienda order by marca $$;
grant execute on function public.hacienda_marcas() to authenticated, service_role;

-- En los coches de Claude: de dónde sale valor_hacienda y qué versión del BOE se usó
alter table public.coches_claude
  add column if not exists valor_hacienda_origen text check (valor_hacienda_origen in ('claude', 'tabla')),
  add column if not exists valor_hacienda_version text,
  add column if not exists verificar_version boolean not null default false;

notify pgrst, 'reload schema';
