-- 1. Añadir columnas a `inventory_cars`
ALTER TABLE public.inventory_cars 
ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS matriculation_checklist jsonb DEFAULT '{}'::jsonb;

-- 2. Crear Storage Bucket para los documentos PDF de los coches (car-documents)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('car-documents', 'car-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

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

-- 4. Crear Storage Bucket para facturas de los Gastos Globales (receipts)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Configuracion RLS para "receipts"
CREATE POLICY "Admins pueden subir facturas"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Admins pueden ver facturas"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts');

CREATE POLICY "Admins pueden borrar facturas"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'receipts');
