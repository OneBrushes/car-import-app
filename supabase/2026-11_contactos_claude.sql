-- =====================================================================================================================
-- NorDrive · "Guardados por Claude": historial de contactos con el vendedor y hasta 30 fotos por coche
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-11_coches_claude_fotos.sql (se puede repetir sin problema).
--
--  · contactos_claude: cada mensaje enviado o recibido con el vendedor (lo registra Claude con registrar_contacto,
--    o tú). Mismas reglas de acceso que coches_claude: solo la cuenta dueña.
--  · Migración: los bloques "--- CONTACTO ---" que Claude dejaba en las notas pasan a contactos_claude y se quitan
--    de las notas.
--  · coches_claude.fotos: máximo 30 (antes 8).
-- =====================================================================================================================

begin;

-- 1. Contactos ---------------------------------------------------------------------------------------------------------
create table if not exists public.contactos_claude (
  id uuid primary key default gen_random_uuid(),
  coche_id uuid not null references public.coches_claude(id) on delete cascade,
  fecha timestamptz not null default now(),
  canal text not null check (canal in ('mobile.de', 'email', 'whatsapp', 'telefono', 'otro')),
  direccion text not null check (direccion in ('enviado', 'recibido')),
  asunto text,
  mensaje text not null,
  enviado_por text not null default 'claude' check (enviado_por in ('claude', 'usuario')),
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists contactos_claude_coche_fecha_idx on public.contactos_claude(coche_id, fecha);

alter table public.contactos_claude enable row level security;
drop policy if exists "contactos_claude_owner" on public.contactos_claude;
create policy "contactos_claude_owner" on public.contactos_claude for all to authenticated
  using (public.is_claude_owner() and exists (select 1 from public.coches_claude c where c.id = coche_id and c.user_id = auth.uid()))
  with check (public.is_claude_owner() and exists (select 1 from public.coches_claude c where c.id = coche_id and c.user_id = auth.uid()));

-- 2. Migración de los bloques "--- CONTACTO ---" de las notas ----------------------------------------------------------
--    Formato que usaba Claude:
--      --- CONTACTO ---
--      21/11/2026 ~20:45 (hora España) · Formulario de mobile.de · Enviado por Claude (sin teléfono)
--      Mensaje:
--      "Hallo, …"
--      Respuesta: pendiente.
insert into public.contactos_claude (coche_id, fecha, canal, direccion, asunto, mensaje, enviado_por, notas)
select
  c.id,
  coalesce(
    (select make_timestamptz(m[3]::int, m[2]::int, m[1]::int, coalesce(m[4], '12')::int, coalesce(m[5], '0')::int, 0, 'Europe/Madrid')
       from regexp_match(b.block, '(\d{1,2})/(\d{1,2})/(\d{4})(?:\D{0,6}(\d{1,2}):(\d{2}))?') as m),
    c.updated_at),
  case
    when b.block ~* 'mobile\.de' then 'mobile.de'
    when b.block ~* 'whats ?app' then 'whatsapp'
    when b.block ~* '(e-?mail|correo)' then 'email'
    when b.block ~* '(tel[eé]fono|llamada)' then 'telefono'
    else 'otro'
  end,
  case when b.block ~* '^\s*(recibido|respuesta del vendedor)' then 'recibido' else 'enviado' end,
  null,
  coalesce(
    nullif(btrim((regexp_match(b.block, 'Mensaje:\s*?(.*?)(?:\n\s*Respuesta:|$)'))[1], E' \r\n\t"“”'), ''),
    btrim(b.block)),
  case when b.block ~* 'enviado por (el )?usuario' then 'usuario' else 'claude' end,
  nullif(btrim(concat_ws(E'\n',
    split_part(btrim(b.block), E'\n', 1),
    (regexp_match(b.block, '(Respuesta:.*)$'))[1])), '')
from public.coches_claude c
cross join lateral unnest((regexp_split_to_array(c.notas, '\s*--- CONTACTO ---\s*'))[2:]) as b(block)
where c.notas like '%--- CONTACTO ---%'
  and btrim(b.block) <> '';

update public.coches_claude
set notas = nullif(rtrim((regexp_split_to_array(notas, '\s*--- CONTACTO ---\s*'))[1]), ''),
    updated_at = now()
where notas like '%--- CONTACTO ---%';

-- 3. Hasta 30 fotos por coche ------------------------------------------------------------------------------------------
alter table public.coches_claude drop constraint if exists coches_claude_fotos_max;
alter table public.coches_claude add constraint coches_claude_fotos_max check (cardinality(fotos) <= 30);

-- 4. Tiempo real: los mensajes aparecen en la pestaña al registrarse ---------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos_claude') then
    alter publication supabase_realtime add table public.contactos_claude;
  end if;
end $$;

commit;
