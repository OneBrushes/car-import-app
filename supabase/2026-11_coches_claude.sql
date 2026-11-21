-- =====================================================================================================================
-- NorDrive · "Guardados por Claude": coches que guarda Claude (claude.ai) a través del servidor MCP
-- Ejecutar una vez en Supabase → SQL Editor (se puede repetir sin problema).
--
--  · coches_claude: coches que guarda Claude. Tabla aparte de imported_cars para que nunca se mezclen con los tuyos
--    (el pipeline, el buscador, el Excel… leen imported_cars) y para que el MCP no pueda tocar tus coches.
--  · mcp_logs: registro de cada llamada al MCP (fecha, herramienta, resultado).
--  · mcp_config: quién es el dueño. SOLO esa cuenta ve la pestaña y los datos; ni admins ni super_admins.
--  · company_settings 'import_costs': gastos fijos de importación y comunidad por defecto (los editas en la Calculadora;
--    los usan la Calculadora y el MCP).
--
-- Dueño: gfabregaat@gmail.com (sección 1). Para cambiarlo, edita ese email y vuelve a ejecutar.
-- =====================================================================================================================

begin;

-- 1. Dueño ------------------------------------------------------------------------------------------------------------
create table if not exists public.mcp_config (
  id boolean primary key default true check (id),          -- una sola fila
  owner_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

insert into public.mcp_config (id, owner_id)
select true, u.id from auth.users u where lower(u.email) = lower('gfabregaat@gmail.com')
on conflict (id) do update set owner_id = excluded.owner_id, updated_at = now();

do $$
begin
  if not exists (select 1 from public.mcp_config) then
    raise exception 'No se ha encontrado el usuario gfabregaat@gmail.com en auth.users';
  end if;
end $$;

alter table public.mcp_config enable row level security;
-- Sin políticas: nadie la lee desde la app. La consulta is_claude_owner() y el MCP usa la clave de servicio.

create or replace function public.is_claude_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.mcp_config where owner_id = auth.uid())
     and public.is_active_user()
$$;
revoke all on function public.is_claude_owner() from public, anon;
grant execute on function public.is_claude_owner() to authenticated;

-- 2. Coches de Claude -------------------------------------------------------------------------------------------------
create table if not exists public.coches_claude (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null unique,
  marca text,
  modelo text,
  version text,
  anio integer,
  mes_matriculacion integer check (mes_matriculacion between 1 and 12),
  km integer,
  potencia_cv integer,
  combustible text,
  precio_alemania numeric,
  precio_neto numeric,
  iva_deducible boolean not null default false,
  tipo_vendedor text check (tipo_vendedor in ('particular', 'concesionario')),
  nombre_vendedor text,
  valoracion_vendedor numeric,
  unfallfrei boolean,
  duenos integer,
  co2 numeric,
  valor_hacienda numeric,
  impuesto_matriculacion numeric,        -- el que indica Claude (si lo da, es el que se aplica)
  impuesto_calculado numeric,            -- el que da la fórmula de la app, como referencia
  aviso_impuesto text,                   -- si los dos difieren más de 100 €
  precio_venta_estimado_espana numeric,
  transporte numeric,                    -- gastos que indica Claude; vacíos = los de los ajustes
  itv numeric,
  homologacion numeric,
  placas numeric,
  gestoria numeric,
  coste_total_espana numeric,
  beneficio numeric,
  margen_pct numeric,
  desglose jsonb not null default '{}'::jsonb,
  foto_url text,
  notas text,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'interesante', 'contactado', 'descartado', 'comprado')),
  movido_a uuid references public.imported_cars(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coches_claude_estado_idx on public.coches_claude(estado, created_at desc);

alter table public.coches_claude enable row level security;
drop policy if exists "coches_claude_owner" on public.coches_claude;
create policy "coches_claude_owner" on public.coches_claude for all to authenticated
  using (public.is_claude_owner() and user_id = auth.uid())
  with check (public.is_claude_owner() and user_id = auth.uid());

-- 3. Registro de llamadas ---------------------------------------------------------------------------------------------
create table if not exists public.mcp_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  herramienta text not null,
  ok boolean not null,
  coche_id uuid,
  resumen text,
  error text
);
create index if not exists mcp_logs_created_idx on public.mcp_logs(created_at desc);

alter table public.mcp_logs enable row level security;
drop policy if exists "mcp_logs_owner_select" on public.mcp_logs;
create policy "mcp_logs_owner_select" on public.mcp_logs for select to authenticated
  using (public.is_claude_owner());

-- 4. Gastos fijos de importación (editables en la Calculadora) --------------------------------------------------------
insert into public.company_settings (key, value)
values ('import_costs', '{"transport": 900, "itv": 180, "homologation": 250, "plates": 25, "agency": 200, "region": "general"}'::jsonb)
on conflict (key) do nothing;

-- 5. Tiempo real: los coches aparecen en la pestaña mientras Claude los guarda ---------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coches_claude') then
    alter publication supabase_realtime add table public.coches_claude;
  end if;
end $$;

commit;
