-- Añadir columna itv_link a la tabla profitable_cars
ALTER TABLE profitable_cars
ADD COLUMN IF NOT EXISTS itv_link TEXT;

-- Comentario para documentar
COMMENT ON COLUMN profitable_cars.itv_link IS 'URL del enlace a la ITV del coche';
