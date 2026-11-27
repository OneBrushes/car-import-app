-- Fase "Reservado" en Comprados (precio negociado y señal pagada, falta pagar el resto) y enlace con "Guardados por Claude".
-- Ejecutar una vez en Supabase → SQL Editor. Se puede repetir sin problema.

-- 1) Comprados: señal pagada y coche de Claude del que viene
alter table public.inventory_cars add column if not exists senal numeric;
alter table public.inventory_cars add column if not exists coche_claude_id uuid references public.coches_claude(id) on delete set null;
create unique index if not exists inventory_cars_coche_claude_idx on public.inventory_cars (coche_claude_id) where coche_claude_id is not null;
-- logistic_status es texto: la fase nueva es 'reserved'. Por si alguna vez se le puso un CHECK desde el panel, se quita
alter table public.inventory_cars drop constraint if exists inventory_cars_logistic_status_check;

-- 2) Guardados por Claude: estado 'reservado'
alter table public.coches_claude drop constraint if exists coches_claude_estado_check;
alter table public.coches_claude add constraint coches_claude_estado_check
  check (estado in ('candidato', 'nuevo', 'interesante', 'contactado', 'descartado', 'reservado', 'comprado', 'retirado'));
