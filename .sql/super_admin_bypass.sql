-- =========================================================================
-- SUPER ADMIN & ADMIN BYPASS - SEGURIDAD (Supabase PostgreSQL)
-- Ejecutar en Supabase -> SQL Editor
-- =========================================================================

-- Función Bypass para UPDATE (Editar coches ajenos)
CREATE OR REPLACE FUNCTION god_mode_update_car(
    p_table text,
    p_car_id uuid,
    p_payload jsonb
) RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    
    -- En Inventario (Comprados), tanto admin como super_admin tienen autoridad total
    IF p_table = 'inventory_cars' THEN
        IF v_role NOT IN ('admin', 'super_admin') THEN
            RAISE EXCEPTION 'Acceso denegado: Solo Admin/Super Admin pueden ejercer God Mode en Comprados.';
        END IF;

        UPDATE public.inventory_cars 
        SET 
            brand = COALESCE((p_payload->>'brand')::text, brand),
            model = COALESCE((p_payload->>'model')::text, model),
            year = COALESCE((p_payload->>'year')::int, year),
            status = COALESCE((p_payload->>'status')::text, status),
            logistic_status = COALESCE((p_payload->>'logistic_status')::text, logistic_status),
            sell_price = COALESCE((p_payload->>'sell_price')::numeric, sell_price),
            date_sold = COALESCE((p_payload->>'date_sold')::text, date_sold),
            buyer = COALESCE((p_payload->>'buyer')::text, buyer)
        WHERE id = p_car_id;
        
    -- Resto de zonas: SÓLO super_admin
    ELSE
        IF v_role != 'super_admin' THEN
            RAISE EXCEPTION 'Acceso denegado: Solo Super Admin puede ejercer God Mode Global.';
        END IF;

        IF p_table = 'imported_cars' THEN
            -- Implementación dinámica si hiciese falta en el futuro para God mode avanzado
            RAISE NOTICE 'God mode update on imported cars';
        ELSIF p_table = 'spain_cars' THEN
            RAISE NOTICE 'God mode update on spain cars';
        ELSE
            RAISE EXCEPTION 'Tabla no soportada en el god mode';
        END IF;
    END IF;
END;
$$;


-- Función Bypass Principal para DELETE (Eliminar coches de otros)
CREATE OR REPLACE FUNCTION god_mode_delete_car(
    p_table text,
    p_car_id uuid
) RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

    -- En inventario (comprados), admin y super_admin pueden destruir
    IF p_table = 'inventory_cars' THEN
        IF v_role NOT IN ('admin', 'super_admin') THEN
            RAISE EXCEPTION 'No eres admin ni super_admin';
        END IF;
        DELETE FROM public.inventory_cars WHERE id = p_car_id;
        
    -- Restos de tablas: SÓLO super admin
    ELSE
        IF v_role != 'super_admin' THEN
            RAISE EXCEPTION 'Hack detectado: Tu cuenta no es Super Admin.';
        END IF;

        IF p_table = 'imported_cars' THEN
            DELETE FROM public.imported_cars WHERE id = p_car_id;
        ELSIF p_table = 'spain_cars' THEN
            DELETE FROM public.spain_cars WHERE id = p_car_id;
        ELSE
            RAISE EXCEPTION 'La tabla provista no tiene permisos God Mode.';
        END IF;
    END IF;
END;
$$;
