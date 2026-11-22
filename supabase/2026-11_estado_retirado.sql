-- Estado "retirado" (en la app: "🏷️ Vendido / retirado") para los coches de Claude cuyo anuncio ha desaparecido.
-- La revisión diaria (cron) y marcar_anuncio lo ponen a la 2.ª revisión seguida con el anuncio retirado.

-- 1) Nuevo estado en el CHECK
alter table public.coches_claude drop constraint if exists coches_claude_estado_check;
alter table public.coches_claude add constraint coches_claude_estado_check
  check (estado in ('candidato', 'nuevo', 'interesante', 'contactado', 'descartado', 'comprado', 'retirado'));

-- 2) Cuándo pasó a "retirado"
alter table public.coches_claude add column if not exists retirado_en timestamptz;

-- 3) Coches actuales: los descartados por anuncio retirado pasan a "retirado"
--    (notas que empiezan por "❌ Anuncio retirado" o "retirado", la nota que añadía la revisión diaria, o anuncio_estado = 'retirado')
update public.coches_claude
set estado = 'retirado',
    retirado_en = coalesce(anuncio_ultima_comprobacion, updated_at, now())
where estado = 'descartado'
  and (
    anuncio_estado = 'retirado'
    or btrim(coalesce(notas, '')) ilike '❌ Anuncio retirado%'
    or btrim(coalesce(notas, '')) ilike 'retirado%'
    or notas ilike '%Anuncio retirado o vendido (detectado el %'
  );

notify pgrst, 'reload schema';
