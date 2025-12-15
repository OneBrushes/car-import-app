-- RLS Policies para spain_cars (compartir coches)

-- Eliminar políticas antiguas si existen
DROP POLICY IF EXISTS "Users can view their own spain cars" ON public.spain_cars;
DROP POLICY IF EXISTS "Users can insert their own spain cars" ON public.spain_cars;
DROP POLICY IF EXISTS "Users can update their own spain cars" ON public.spain_cars;
DROP POLICY IF EXISTS "Users can delete their own spain cars" ON public.spain_cars;

-- Habilitar RLS
ALTER TABLE public.spain_cars ENABLE ROW LEVEL SECURITY;

-- Policy: Los usuarios pueden ver sus propios coches Y los compartidos con ellos
CREATE POLICY "Users can view their own spain cars and shared with them"
  ON public.spain_cars
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    auth.uid() = ANY(shared_with)
  );

-- Policy: Los usuarios pueden insertar sus propios coches
CREATE POLICY "Users can insert their own spain cars"
  ON public.spain_cars
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Los usuarios solo pueden actualizar sus propios coches
CREATE POLICY "Users can update their own spain cars"
  ON public.spain_cars
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Los usuarios solo pueden eliminar sus propios coches
CREATE POLICY "Users can delete their own spain cars"
  ON public.spain_cars
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comentarios
COMMENT ON POLICY "Users can view their own spain cars and shared with them" ON public.spain_cars 
IS 'Permite a los usuarios ver sus propios coches de España y los que han sido compartidos con ellos';
