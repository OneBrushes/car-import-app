-- =====================================================================================================================
-- NorDrive · Blog v2: categorías (importación / noticias), crédito de las fotos y limpieza del artículo de prueba
-- Ejecutar una vez en Supabase → SQL Editor, después de 2026-10_blog.sql (se puede repetir sin problema).
--
--  · category: 'importacion' (guías para importar: lunes, miércoles y viernes) o 'noticias' (actualidad del motor:
--    resto de días). La web tiene una página por categoría.
--  · cover_credit: autor y licencia de la foto de portada ("Foto: Autor / Wikimedia Commons · CC BY-SA 4.0").
--    Las fotos dentro del texto llevan su crédito en el propio Markdown: ![descripción](url "Foto: …").
-- =====================================================================================================================

begin;

alter table public.blog_posts add column if not exists category text not null default 'importacion';
alter table public.blog_posts drop constraint if exists blog_posts_category_check;
alter table public.blog_posts add constraint blog_posts_category_check check (category in ('importacion', 'noticias'));
alter table public.blog_posts add column if not exists cover_credit text;

create index if not exists blog_posts_category_idx on public.blog_posts(category, published_at desc);

-- Artículo de prueba de la primera ejecución de la tarea de Claude (borrador, nunca se publicó)
delete from public.blog_posts where slug = 'impuesto-matriculacion-coche-importado-modelo-576' and status = 'draft';

commit;
