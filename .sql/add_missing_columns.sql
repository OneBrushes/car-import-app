-- SQL DEFINITIVO: Añadir TODAS las columnas posibles para imported_cars

-- 1. Especificaciones Básicas y Ubicación
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS platform text,
ADD COLUMN IF NOT EXISTS vehicle_type text,
ADD COLUMN IF NOT EXISTS month integer,
ADD COLUMN IF NOT EXISTS origin text,
ADD COLUMN IF NOT EXISTS url text;

-- 2. Apariencia y Motor
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS color text,
ADD COLUMN IF NOT EXISTS doors text,
ADD COLUMN IF NOT EXISTS motor_type text,
ADD COLUMN IF NOT EXISTS displacement text,
ADD COLUMN IF NOT EXISTS co2 text,
ADD COLUMN IF NOT EXISTS fuel_type text,
ADD COLUMN IF NOT EXISTS transmission text,
ADD COLUMN IF NOT EXISTS traction text,
ADD COLUMN IF NOT EXISTS steering text;

-- 3. Inspección y Estado
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS inspection_name text,
ADD COLUMN IF NOT EXISTS inspection_status text,
ADD COLUMN IF NOT EXISTS inspection_expiry text,
ADD COLUMN IF NOT EXISTS defects text,
ADD COLUMN IF NOT EXISTS notes text;

-- 4. Costes Detallados
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS transfer_cost numeric,
ADD COLUMN IF NOT EXISTS total_cost numeric,
ADD COLUMN IF NOT EXISTS import_tax numeric,
ADD COLUMN IF NOT EXISTS shipping_cost numeric,
ADD COLUMN IF NOT EXISTS registration_tax numeric,
ADD COLUMN IF NOT EXISTS other_costs numeric;

-- 5. Arrays y Multimedia
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS equipment text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- 6. Migración de datos (opcional, para arreglar datos antiguos)
-- Copiar image_url a images si images está vacío
UPDATE imported_cars 
SET images = ARRAY[image_url] 
WHERE image_url IS NOT NULL AND (images IS NULL OR cardinality(images) = 0);
