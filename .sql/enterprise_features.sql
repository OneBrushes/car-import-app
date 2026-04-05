-- 1. GASTRON GLOBAL (GLOBAL EXPENSES)
CREATE TABLE IF NOT EXISTS global_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('Software/Suscripciones', 'Marketing/Publicidad', 'Equipamiento', 'Viajes/Transporte', 'Honorarios/Gestoría', 'Otro')),
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE global_expenses ENABLE ROW LEVEL SECURITY;

-- Crear política de visualización (Todos los perfiles autenticados pueden ver los gastos, especialmente útil para que afecte al Dashboard)
CREATE POLICY "Gastos visibles por todo el equipo"
ON global_expenses FOR SELECT
TO authenticated
USING (true);

-- Crear política de Inserción/Modificación (Solo admins o importadores con permiso explícito)
-- En este caso lo ataremos al rol 'admin' de la tabla profiles. 
-- (Si deseas granularidad en el futuro se usaría una columna extra)
CREATE POLICY "Admins pueden gestionar gastos"
ON global_expenses FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);


-- 2. ROADMAP EMPRESARIAL INTERACTIVO
CREATE TABLE IF NOT EXISTS company_roadmap (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL DEFAULT 'Roadmap Principal',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE company_roadmap ENABLE ROW LEVEL SECURITY;

-- Política de visualización general
CREATE POLICY "Roadmap visible por todo el equipo"
ON company_roadmap FOR SELECT
TO authenticated
USING (true);

-- Política de edición restringida a admins
CREATE POLICY "Admins pueden guardar el roadmap"
ON company_roadmap FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- Crear la fila base por defecto para el roadmap
INSERT INTO company_roadmap (id, title, nodes, edges) 
VALUES (uuid_generate_v4(), 'Roadmap Inicial', '[]'::jsonb, '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- 3. [Extra] Preparación de roles de futuro si deseas usar 'super_admin'
-- Asegúrate de que tu constraint anterior sobre roles permita 'super_admin' si lo tenías limitado en un CHECK de tu tabla profiles.
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'admin', 'importador', 'usuario')); -- Modifica según tu estructura real.
