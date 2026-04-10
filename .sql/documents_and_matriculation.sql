-- 1. Añadir columnas a `inventory_cars`
ALTER TABLE public.inventory_cars 
ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS matriculation_checklist jsonb DEFAULT '{}'::jsonb;

-- 2. Crear Storage Bucket para los documentos PDF de los coches (car-documents)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('car-documents', 'car-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Configurar Acceso Seguro RLS para el Bucket "car-documents"
-- Solo usuarios logueados pueden subir archivos
CREATE POLICY "Usuarios pueden subir documentos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'car-documents');

-- Solo usuarios logueados pueden ver/descargar archivos
CREATE POLICY "Usuarios pueden ver documentos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'car-documents');

-- Solo los dueños de los archivos (quien los sube) o admins pueden borrar
CREATE POLICY "Usuarios pueden borrar sus propios documentos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'car-documents');
