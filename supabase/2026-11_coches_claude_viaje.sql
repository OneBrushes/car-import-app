-- Viaje para ir a buscar el coche conduciendo (lo rellena Claude con ViaMichelin).
-- Si viaje_coste_ruta tiene valor, el transporte del coche = viaje_coste_ruta + viaje_extras.
alter table public.coches_claude
  add column if not exists viaje_ciudad_origen text,
  add column if not exists viaje_km integer,
  add column if not exists viaje_horas numeric,
  add column if not exists viaje_coste_ruta numeric,   -- gasolina + peajes (ViaMichelin)
  add column if not exists viaje_extras numeric,       -- vuelo + hotel + comidas + placas de exportación
  add column if not exists viaje_detalle text;

notify pgrst, 'reload schema';
