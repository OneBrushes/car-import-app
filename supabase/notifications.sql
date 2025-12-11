-- Tabla de notificaciones
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'car_shared', 'car_unshared', 'role_changed', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT, -- URL para navegar al hacer click
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    
    -- Metadata adicional (JSON flexible)
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Los usuarios solo pueden ver sus propias notificaciones
CREATE POLICY "Users can view own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Los usuarios pueden actualizar (marcar como leídas) sus propias notificaciones
CREATE POLICY "Users can update own notifications"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Solo el sistema puede insertar notificaciones (service_role)
-- Los usuarios NO pueden crear notificaciones manualmente
CREATE POLICY "Service role can insert notifications"
    ON public.notifications
    FOR INSERT
    WITH CHECK (true); -- Se controla desde el backend

-- Policy: Los usuarios pueden eliminar sus propias notificaciones
CREATE POLICY "Users can delete own notifications"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id);

-- Función para crear notificación cuando se comparte un coche
CREATE OR REPLACE FUNCTION notify_car_shared()
RETURNS TRIGGER AS $$
DECLARE
    shared_user_id UUID;
    car_name TEXT;
    owner_name TEXT;
BEGIN
    -- Obtener el nombre del coche
    SELECT CONCAT(brand, ' ', model, ' (', year, ')') INTO car_name
    FROM imported_cars
    WHERE id = NEW.id;
    
    -- Obtener el nombre del propietario
    SELECT CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, email)) INTO owner_name
    FROM profiles
    WHERE id = NEW.user_id;
    
    -- Crear notificación para cada usuario con quien se comparte
    IF NEW.shared_with IS NOT NULL AND array_length(NEW.shared_with, 1) > 0 THEN
        FOREACH shared_user_id IN ARRAY NEW.shared_with
        LOOP
            -- Solo crear notificación si es un nuevo usuario compartido
            IF NOT (OLD.shared_with @> ARRAY[shared_user_id]) THEN
                INSERT INTO notifications (user_id, type, title, message, link, metadata)
                VALUES (
                    shared_user_id,
                    'car_shared',
                    '🚗 Coche compartido contigo',
                    owner_name || ' ha compartido ' || car_name || ' contigo',
                    '/', -- Link a la página principal donde verá el coche
                    jsonb_build_object(
                        'car_id', NEW.id,
                        'owner_id', NEW.user_id,
                        'car_name', car_name
                    )
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para notificar cuando se comparte un coche
DROP TRIGGER IF EXISTS trigger_notify_car_shared ON imported_cars;
CREATE TRIGGER trigger_notify_car_shared
    AFTER UPDATE OF shared_with ON imported_cars
    FOR EACH ROW
    WHEN (OLD.shared_with IS DISTINCT FROM NEW.shared_with)
    EXECUTE FUNCTION notify_car_shared();

-- Comentarios para documentación
COMMENT ON TABLE public.notifications IS 'Notificaciones del sistema para los usuarios';
COMMENT ON COLUMN public.notifications.type IS 'Tipo de notificación: car_shared, car_unshared, role_changed, etc.';
COMMENT ON COLUMN public.notifications.metadata IS 'Datos adicionales en formato JSON para cada tipo de notificación';
