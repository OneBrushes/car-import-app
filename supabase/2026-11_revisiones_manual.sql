-- Origen "manual" en la tabla revisiones: pasadas guardadas con la herramienta marcar_anuncios
-- (revisión hecha por Claude con el navegador). Ejecutar después de 2026-11_revision_v2.sql.
alter table public.revisiones drop constraint if exists revisiones_origen_check;
alter table public.revisiones add constraint revisiones_origen_check
  check (origen in ('worker', 'local', 'manual'));

notify pgrst, 'reload schema';
