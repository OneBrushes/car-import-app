-- =========================================================================
-- SUPER ADMIN & ADMIN BYPASS - SEGURIDAD (Supabase PostgreSQL)
-- Ejecutar en Supabase -> SQL Editor
-- (Versión DEFINITIVA: Tolera strings vacíos ("") convirtiéndolos en NULL)
-- =========================================================================

-- Función Bypass para UPDATE (Editar coches ajenos)
CREATE OR REPLACE FUNCTION god_mode_update_car(
    p_table text,
    p_car_id uuid,
    p_payload jsonb
) RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    
    IF p_table = 'inventory_cars' THEN
        IF v_role NOT IN ('admin', 'super_admin') THEN
            RAISE EXCEPTION 'Acceso denegado: Solo Admin/Super Admin pueden ejercer God Mode en Comprados.';
        END IF;

        -- El uso del NULLIF(trim(), '') protege contra errores de "invalid input syntax for type numeric" cuando el frontend envía un string vacío en vez de null.
        IF p_payload ? 'brand' THEN UPDATE public.inventory_cars SET brand = NULLIF(trim(p_payload->>'brand'), '') WHERE id = p_car_id; END IF;
        IF p_payload ? 'model' THEN UPDATE public.inventory_cars SET model = NULLIF(trim(p_payload->>'model'), '') WHERE id = p_car_id; END IF;
        IF p_payload ? 'year' THEN UPDATE public.inventory_cars SET year = NULLIF(trim(p_payload->>'year'), '')::int WHERE id = p_car_id; END IF;
        IF p_payload ? 'status' THEN UPDATE public.inventory_cars SET status = p_payload->>'status' WHERE id = p_car_id; END IF;
        IF p_payload ? 'logistic_status' THEN UPDATE public.inventory_cars SET logistic_status = p_payload->>'logistic_status' WHERE id = p_car_id; END IF;
        IF p_payload ? 'sell_price' THEN UPDATE public.inventory_cars SET sell_price = NULLIF(trim(p_payload->>'sell_price'), '')::numeric WHERE id = p_car_id; END IF;
        IF p_payload ? 'date_sold' THEN UPDATE public.inventory_cars SET date_sold = NULLIF(trim(p_payload->>'date_sold'), '') WHERE id = p_car_id; END IF;
        IF p_payload ? 'buyer' THEN UPDATE public.inventory_cars SET buyer = NULLIF(trim(p_payload->>'buyer'), '') WHERE id = p_car_id; END IF;

    ELSE
        IF v_role != 'super_admin' THEN
            RAISE EXCEPTION 'Acceso denegado: Solo Super Admin puede ejercer God Mode Global.';
        END IF;

        IF p_table = 'imported_cars' THEN
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
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

    IF p_table = 'inventory_cars' THEN
        IF v_role NOT IN ('admin', 'super_admin') THEN
            RAISE EXCEPTION 'No eres admin ni super_admin';
        END IF;
        DELETE FROM public.inventory_cars WHERE id = p_car_id;
        
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
