-- ========================================
-- TABLA: profitable_cars (ACTUALIZADA)
-- ========================================

-- Primero, si la tabla ya existe, añadimos las nuevas columnas
ALTER TABLE profitable_cars 
ADD COLUMN IF NOT EXISTS avg_mileage integer,
ADD COLUMN IF NOT EXISTS avg_cv integer,
ADD COLUMN IF NOT EXISTS transmission text;

-- Si la tabla NO existe, créala completa
CREATE TABLE IF NOT EXISTS profitable_cars (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Información del coche
    country text NOT NULL,
    brand text NOT NULL,
    model text NOT NULL,
    year_from integer NOT NULL,
    year_to integer,
    motor_type text NOT NULL,
    
    -- Especificaciones técnicas
    avg_mileage integer,
    avg_cv integer,
    transmission text,
    
    -- Costes y rentabilidad
    avg_import_cost numeric NOT NULL,
    avg_spain_price numeric NOT NULL,
    profit_margin numeric GENERATED ALWAYS AS (
        CASE 
            WHEN avg_import_cost > 0 
            THEN ((avg_spain_price - avg_import_cost) / avg_import_cost * 100)
            ELSE 0
        END
    ) STORED,
    
    -- Notas
    notes text,
    
    -- Metadata
    updated_at timestamptz DEFAULT now()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_profitable_cars_country ON profitable_cars(country);
CREATE INDEX IF NOT EXISTS idx_profitable_cars_brand ON profitable_cars(brand);
CREATE INDEX IF NOT EXISTS idx_profitable_cars_profit ON profitable_cars(profit_margin DESC);

-- ========================================
-- RLS POLICIES
-- ========================================

-- Habilitar RLS
ALTER TABLE profitable_cars ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas viejas
DROP POLICY IF EXISTS "Anyone can view profitable cars" ON profitable_cars;
DROP POLICY IF EXISTS "Only admins can insert profitable cars" ON profitable_cars;
DROP POLICY IF EXISTS "Only admins can update profitable cars" ON profitable_cars;
DROP POLICY IF EXISTS "Only admins can delete profitable cars" ON profitable_cars;

-- Todos pueden VER
CREATE POLICY "Anyone can view profitable cars" 
ON profitable_cars FOR SELECT 
USING (true);

-- Solo ADMINS pueden INSERTAR
CREATE POLICY "Only admins can insert profitable cars" 
ON profitable_cars FOR INSERT 
WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Solo ADMINS pueden ACTUALIZAR
CREATE POLICY "Only admins can update profitable cars" 
ON profitable_cars FOR UPDATE 
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Solo ADMINS pueden ELIMINAR
CREATE POLICY "Only admins can delete profitable cars" 
ON profitable_cars FOR DELETE 
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_profitable_cars_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profitable_cars_updated_at ON profitable_cars;
CREATE TRIGGER trigger_update_profitable_cars_updated_at
    BEFORE UPDATE ON profitable_cars
    FOR EACH ROW
    EXECUTE FUNCTION update_profitable_cars_updated_at();

-- ========================================
-- ARREGLAR LOGS (ACTIVITY_LOGS)
-- ========================================

-- Eliminar políticas viejas
DROP POLICY IF EXISTS "Users can view own logs" ON activity_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON activity_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON activity_logs;
DROP POLICY IF EXISTS "Anyone can insert logs" ON activity_logs;
DROP POLICY IF EXISTS "Public can insert logs" ON activity_logs;

-- PERMITIR A ADMINS VER TODOS LOS LOGS
CREATE POLICY "Admins can view all logs" 
ON activity_logs FOR SELECT 
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- PERMITIR A TODOS INSERTAR LOGS (necesario para registro de actividad)
CREATE POLICY "Anyone authenticated can insert logs" 
ON activity_logs FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);
