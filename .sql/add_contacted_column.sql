-- Añadir columna contacted (boolean) a imported_cars
ALTER TABLE public.imported_cars 
ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT false;
