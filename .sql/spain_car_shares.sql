-- Tabla para compartir coches de España
CREATE TABLE IF NOT EXISTS public.spain_car_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id UUID NOT NULL REFERENCES public.spain_cars(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(car_id, shared_with_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_spain_car_shares_car_id ON public.spain_car_shares(car_id);
CREATE INDEX IF NOT EXISTS idx_spain_car_shares_owner_id ON public.spain_car_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_spain_car_shares_shared_with_id ON public.spain_car_shares(shared_with_id);

-- RLS Policies
ALTER TABLE public.spain_car_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Los usuarios pueden ver los coches compartidos con ellos
CREATE POLICY "Users can view spain cars shared with them"
  ON public.spain_car_shares
  FOR SELECT
  USING (
    auth.uid() = owner_id OR 
    auth.uid() = shared_with_id
  );

-- Policy: Los propietarios pueden compartir sus coches
CREATE POLICY "Owners can share their spain cars"
  ON public.spain_car_shares
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Policy: Los propietarios pueden eliminar compartidos
CREATE POLICY "Owners can delete spain car shares"
  ON public.spain_car_shares
  FOR DELETE
  USING (auth.uid() = owner_id);

-- Comentarios
COMMENT ON TABLE public.spain_car_shares IS 'Tabla para gestionar el compartir coches de España entre usuarios';
