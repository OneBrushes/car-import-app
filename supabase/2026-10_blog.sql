-- =====================================================================================================================
-- NorDrive · Blog del motor gestionado desde la app + visitas de la web
-- Ejecutar una vez en Supabase → SQL Editor (se puede repetir sin problema).
--
--  · blog_posts: los artículos. Se crean y editan en la app (pestaña Blog), a mano o los escribe Claude.
--    La web los lee al publicarse (cada artículo es una página propia, optimizada para Google).
--  · app_settings 'blog_auto_publish': si es true, lo que escribe Claude se publica solo; si no, queda en borrador.
--  · page_views: visitas de la web (sin datos personales: solo la página, el día y un identificador aleatorio del
--    navegador). La web solo puede apuntar visitas con track_page_view(); la app ve los totales con site_stats().
-- =====================================================================================================================

begin;

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text not null default '',
  content text not null default '',          -- Markdown
  cover_url text,
  cover_alt text,
  tags text[] not null default '{}',
  author text not null default 'NorDrive',
  seo_title text,                            -- si está vacío se usa el título
  seo_description text,                      -- si está vacío se usa el resumen
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,                  -- puede ser futuro: se publica ese día
  source text not null default 'manual' check (source in ('manual', 'claude')),
  reading_minutes integer,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_published_idx on public.blog_posts(status, published_at desc);

alter table public.blog_posts enable row level security;

drop policy if exists "blog_public_read" on public.blog_posts;
create policy "blog_public_read" on public.blog_posts for select to anon, authenticated
  using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "blog_staff_all" on public.blog_posts;
create policy "blog_staff_all" on public.blog_posts for all to authenticated
  using (public.has_app_role('gestor', 'importador', 'admin', 'super_admin'))
  with check (public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));

-- Imágenes de portada: bucket público "blog"
insert into storage.buckets (id, name, public) values ('blog', 'blog', true)
on conflict (id) do update set public = true;
drop policy if exists "blog_images_select" on storage.objects;
drop policy if exists "blog_images_insert" on storage.objects;
drop policy if exists "blog_images_delete" on storage.objects;
create policy "blog_images_select" on storage.objects for select using (bucket_id = 'blog');
create policy "blog_images_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'blog' and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));
create policy "blog_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'blog' and public.has_app_role('gestor', 'importador', 'admin', 'super_admin'));

-- Ajuste: publicar solo lo que escribe Claude (por defecto, no: queda en borrador para que lo revises)
insert into public.app_settings (key, value) values ('blog_auto_publish', false)
on conflict (key) do nothing;

-- Visitas ---------------------------------------------------------------------------------------------------------
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  day date not null default (now() at time zone 'Europe/Madrid')::date,
  path text not null,
  is_blog boolean not null default false,
  blog_slug text,
  visitor text not null,                    -- identificador aleatorio del navegador (no personal)
  referrer_host text,
  created_at timestamptz not null default now()
);
create index if not exists page_views_day_idx on public.page_views(day);
create index if not exists page_views_blog_idx on public.page_views(blog_slug) where blog_slug is not null;

alter table public.page_views enable row level security;
drop policy if exists "page_views_staff_read" on public.page_views;
create policy "page_views_staff_read" on public.page_views for select to authenticated
  using (public.has_app_role('importador', 'admin', 'super_admin'));

-- La web apunta una visita (validada y recortada; nada de datos personales)
create or replace function public.track_page_view(page_path text, visitor_id text, referrer text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_path text := left(split_part(coalesce(page_path, '/'), '?', 1), 300);
  clean_visitor text := left(regexp_replace(coalesce(visitor_id, ''), '[^a-zA-Z0-9-]', '', 'g'), 64);
  slug text;
  ref_host text;
begin
  if clean_visitor = '' or clean_path !~ '^/' then
    return;
  end if;
  slug := substring(clean_path from '^/blog/([a-z0-9-]+)/?$');
  ref_host := nullif(left(substring(coalesce(referrer, '') from '^https?://([^/]+)'), 120), '');
  if ref_host ilike '%nordrivecars.com' then ref_host := null; end if;
  insert into public.page_views (path, is_blog, blog_slug, visitor, referrer_host)
  values (clean_path, clean_path ~ '^/blog(/|$)', slug, clean_visitor, ref_host);
end;
$$;
grant execute on function public.track_page_view(text, text, text) to anon, authenticated;

-- Totales para la app: visitas y visitantes únicos de la web y del blog en los últimos N días
create or replace function public.site_stats(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := (now() at time zone 'Europe/Madrid')::date - greatest(days, 1) + 1;
  result jsonb;
begin
  if not public.has_app_role('gestor', 'importador', 'admin', 'super_admin') then
    raise exception 'Sin permiso';
  end if;
  select jsonb_build_object(
    'site_views', (select count(*) from page_views where day >= since),
    'site_visitors', (select count(distinct visitor) from page_views where day >= since),
    'blog_views', (select count(*) from page_views where day >= since and is_blog),
    'blog_visitors', (select count(distinct visitor) from page_views where day >= since and is_blog),
    'by_day', coalesce((select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', day, 'site', count(distinct visitor), 'blog', count(distinct visitor) filter (where is_blog)) d
          from page_views where day >= since group by day) x), '[]'::jsonb),
    'top_posts', coalesce((select jsonb_agg(t) from (
        select jsonb_build_object('slug', blog_slug, 'views', count(*), 'visitors', count(distinct visitor)) t
          from page_views where day >= since and blog_slug is not null
         group by blog_slug order by count(*) desc limit 10) y), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(r) from (
        select jsonb_build_object('host', referrer_host, 'visitors', count(distinct visitor)) r
          from page_views where day >= since and referrer_host is not null
         group by referrer_host order by count(distinct visitor) desc limit 8) z), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.site_stats(integer) to authenticated;

commit;
