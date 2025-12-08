-- Añadir columna images (array de texto) a imported_cars
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- Migrar datos existentes: poner image_url en images si images está vacío
UPDATE imported_cars 
SET images = ARRAY[image_url] 
WHERE image_url IS NOT NULL AND (images IS NULL OR cardinality(images) = 0);
