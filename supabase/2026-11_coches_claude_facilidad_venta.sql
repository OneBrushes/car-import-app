-- Facilidad de venta en España de los coches de Claude: 1 = fácil, 2 = bastante fácil, 3 = media, 4 = bastante difícil, 5 = difícil
alter table public.coches_claude
  add column if not exists facilidad_venta smallint check (facilidad_venta between 1 and 5),
  add column if not exists facilidad_venta_motivo text;

-- Que PostgREST vea las columnas nuevas al momento
notify pgrst, 'reload schema';
