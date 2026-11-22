-- Búsqueda automática de coches (tools/buscador, cada noche en el PC con Windows).

-- 1) Nuevo estado "candidato": lo que encuentra la búsqueda nocturna y pasa todos los filtros
alter table public.coches_claude drop constraint if exists coches_claude_estado_check;
alter table public.coches_claude add constraint coches_claude_estado_check
  check (estado in ('candidato', 'nuevo', 'interesante', 'contactado', 'descartado', 'comprado'));

-- 2) Búsquedas guardadas (las crea Claude con crear_busqueda o tú desde la app)
create table if not exists public.busquedas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca text not null,
  modelos text[] not null default '{}',
  -- palabras que debe tener la versión (p. ej. {"R"} para Golf R, {"VZ"} para León VZ)
  palabras_version text[] not null default '{}',
  anio_min smallint,
  anio_max smallint,
  km_max integer,
  precio_max integer,
  cv_min integer,
  combustibles text[] not null default '{}',
  carrocerias_excluidas text[] not null default '{}',
  activa boolean not null default true,
  ultima_ejecucion timestamptz,
  created_at timestamptz not null default now()
);

-- 3) Anuncios ya vistos (no repetir: se vuelve a mirar solo si cambia el precio)
create table if not exists public.anuncios_vistos (
  portal text not null,
  anuncio_id text not null,
  url text not null,
  precio_hash text,
  busqueda_id uuid references public.busquedas(id) on delete set null,
  resultado text,          -- candidato / descartado / error
  motivo text,
  visto_en timestamptz not null default now(),
  primary key (portal, anuncio_id)
);

-- 4) Registro de cada noche
create table if not exists public.ejecuciones (
  id bigserial primary key,
  inicio timestamptz not null default now(),
  fin timestamptz,
  simulacion boolean not null default false,
  busquedas integer not null default 0,
  fichas_vistas integer not null default 0,
  candidatos integer not null default 0,
  descartes jsonb not null default '{}',   -- {"palabra de alarma": 12, "IA: accidente": 3, ...}
  errores jsonb not null default '[]',
  detalle jsonb not null default '[]'       -- una línea por ficha (portal, url, resultado, motivo)
);
create index if not exists ejecuciones_inicio_idx on public.ejecuciones (inicio desc);

-- Solo la cuenta dueña de los coches de Claude; el script escribe con service role
alter table public.busquedas enable row level security;
alter table public.anuncios_vistos enable row level security;
alter table public.ejecuciones enable row level security;
drop policy if exists "busquedas_owner" on public.busquedas;
create policy "busquedas_owner" on public.busquedas for all to authenticated using (public.is_claude_owner()) with check (public.is_claude_owner());
drop policy if exists "ejecuciones_owner" on public.ejecuciones;
create policy "ejecuciones_owner" on public.ejecuciones for select to authenticated using (public.is_claude_owner());

notify pgrst, 'reload schema';
