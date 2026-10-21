-- =====================================================================================================================
-- NorDrive · Blog: lo que aporta cada artículo (visitas y visitas que llegan desde buscadores)
-- Ejecutar una vez en Supabase → SQL Editor, después de 2026-10_blog.sql (se puede repetir sin problema).
--
--  · blog_post_stats(days): por cada artículo, visitas, visitantes y visitantes que llegaron desde Google, Bing,
--    DuckDuckGo, Yahoo o Ecosia en los últimos N días. Lo usa la pestaña Blog de la app.
-- =====================================================================================================================

create or replace function public.blog_post_stats(days integer default 30)
returns table (slug text, views bigint, visitors bigint, search_visitors bigint, first_view date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := (now() at time zone 'Europe/Madrid')::date - greatest(days, 1) + 1;
begin
  if not public.has_app_role('gestor', 'importador', 'admin', 'super_admin') then
    raise exception 'Sin permiso';
  end if;
  return query
    select v.blog_slug,
           count(*),
           count(distinct v.visitor),
           count(distinct v.visitor) filter (where v.referrer_host ~* '(^|\.)(google|bing|duckduckgo|yahoo|ecosia)\.'),
           min(v.day)
      from page_views v
     where v.blog_slug is not null and v.day >= since
     group by v.blog_slug;
end;
$$;
grant execute on function public.blog_post_stats(integer) to authenticated;
