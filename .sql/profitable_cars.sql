-- ========================================
-- TABLA: profitable_cars
-- ========================================
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

CREATE TRIGGER trigger_update_profitable_cars_updated_at
    BEFORE UPDATE ON profitable_cars
    FOR EACH ROW
    EXECUTE FUNCTION update_profitable_cars_updated_at();
