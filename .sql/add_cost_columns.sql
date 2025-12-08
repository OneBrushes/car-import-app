-- Añadir columnas de costes desglosados si no existen
ALTER TABLE imported_cars 
ADD COLUMN IF NOT EXISTS total_cost numeric,
ADD COLUMN IF NOT EXISTS import_tax numeric,
ADD COLUMN IF NOT EXISTS shipping_cost numeric,
ADD COLUMN IF NOT EXISTS registration_tax numeric,
ADD COLUMN IF NOT EXISTS other_costs numeric;
