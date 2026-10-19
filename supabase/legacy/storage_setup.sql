-- 1. Crear el bucket 'car-images' si no existe
insert into storage.buckets (id, name, public)
values ('car-images', 'car-images', true)
on conflict (id) do nothing;

-- 2. Políticas de seguridad (RLS) para 'car-images'

-- Permitir acceso público de lectura
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'car-images' );

-- Permitir subida a usuarios autenticados
create policy "Authenticated Upload"
on storage.objects for insert
with check ( bucket_id = 'car-images' and auth.role() = 'authenticated' );

-- Permitir borrado a usuarios autenticados
create policy "Authenticated Delete"
on storage.objects for delete
using ( bucket_id = 'car-images' and auth.role() = 'authenticated' );
