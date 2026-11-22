-- Revisión diaria de anuncios de "Guardados por Claude" (cron del Worker nordrive-mcp, 06:00–07:00 hora de Madrid).

-- Estado del anuncio en cada coche
alter table public.coches_claude
  add column if not exists anuncio_estado text check (anuncio_estado in ('activo', 'retirado', 'no_comprobado')),
  add column if not exists anuncio_ultima_comprobacion timestamptz,
  add column if not exists anuncio_fallos_seguidos integer not null default 0,
  add column if not exists precio_actual numeric,
  add column if not exists precio_bajado boolean not null default false;

create index if not exists coches_claude_revision_idx on public.coches_claude (estado, anuncio_ultima_comprobacion);

-- Historial: una fila por comprobación
create table if not exists public.revisiones_anuncios (
  id bigserial primary key,
  coche_id uuid not null references public.coches_claude(id) on delete cascade,
  fecha timestamptz not null default now(),
  resultado text not null check (resultado in ('activo', 'retirado', 'no_comprobado')),
  http_status integer,
  precio_detectado numeric,
  -- precio guardado antes de esta comprobación (si ha bajado, el de antes de la bajada)
  precio_anterior numeric,
  motivo text,
  -- cron (Worker), claude (marcar_anuncio, comprobado con Chrome) o api
  origen text not null default 'cron'
);
create index if not exists revisiones_anuncios_fecha_idx on public.revisiones_anuncios (fecha desc);
create index if not exists revisiones_anuncios_coche_idx on public.revisiones_anuncios (coche_id, fecha desc);

-- Solo la cuenta dueña de los coches de Claude (como contactos_claude); el Worker escribe con service role
alter table public.revisiones_anuncios enable row level security;
drop policy if exists "revisiones_anuncios_owner" on public.revisiones_anuncios;
create policy "revisiones_anuncios_owner" on public.revisiones_anuncios for select to authenticated
  using (public.is_claude_owner() and exists (select 1 from public.coches_claude c where c.id = coche_id and c.user_id = auth.uid()));

-- Tiempo real para el panel "Revisión de hoy"
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'revisiones_anuncios') then
    alter publication supabase_realtime add table public.revisiones_anuncios;
  end if;
end $$;

notify pgrst, 'reload schema';
