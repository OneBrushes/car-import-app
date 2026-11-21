-- =====================================================================================================================
-- NorDrive · "Guardados por Claude": varias fotos por coche y encuadre
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de 2026-11_coches_claude.sql (se puede repetir sin problema).
--
--  · coches_claude.fotos: hasta 8 fotos por coche. El MCP las copia al bucket público "coches-claude" para que no se
--    pierdan si el vendedor borra el anuncio. foto_url sigue siendo la principal (la primera).
--  · coches_claude.foto_posicion_y: encuadre vertical de la foto principal en la tarjeta (0 = arriba, 100 = abajo).
--    Lo calcula el MCP en las fotos verticales (centrado en el tercio inferior, donde suele estar el coche) o lo indica Claude.
-- =====================================================================================================================

begin;

alter table public.coches_claude add column if not exists fotos text[] not null default '{}';
alter table public.coches_claude add column if not exists foto_posicion_y smallint;

alter table public.coches_claude drop constraint if exists coches_claude_fotos_max;
alter table public.coches_claude add constraint coches_claude_fotos_max check (cardinality(fotos) <= 8);
alter table public.coches_claude drop constraint if exists coches_claude_foto_posicion_y_rango;
alter table public.coches_claude add constraint coches_claude_foto_posicion_y_rango check (foto_posicion_y between 0 and 100);

-- Bucket público de las fotos (solo escribe el MCP con la clave de servicio)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coches-claude', 'coches-claude', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do nothing;

commit;
