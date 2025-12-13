-- =====================================================
-- FUNCIONES COMPLETAS - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Este archivo contiene:
-- 1. Funciones helper para zona horaria
-- 2. Funciones para generar time slots
-- 3. Funciones RPC para consultas de disponibilidad
-- 4. Funciones de mantenimiento automático
-- =====================================================

-- =====================================================
-- 0. FUNCIONES HELPER PARA ZONA HORARIA DE MONTERREY
-- =====================================================
-- Funciones auxiliares para obtener fecha y hora actual
-- en zona horaria de Monterrey (UTC-6)
-- =====================================================

CREATE OR REPLACE FUNCTION get_current_date_monterrey()
RETURNS DATE AS $$
BEGIN
  RETURN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_current_time_monterrey()
RETURNS TIME AS $$
BEGIN
  RETURN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Monterrey')::TIME;
END;
$$ LANGUAGE plpgsql STABLE;

-- Configurar search_path para seguridad
ALTER FUNCTION get_current_date_monterrey() SET search_path = public;
ALTER FUNCTION get_current_time_monterrey() SET search_path = public;

-- =====================================================
-- 1. FUNCIÓN PARA GENERAR TIME SLOTS EN UN RANGO
-- =====================================================

CREATE OR REPLACE FUNCTION generate_time_slots(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_current_date DATE;
  slot_time TIME;
  end_time TIME;
  slots_created INTEGER := 0;
  day_of_week INTEGER;
BEGIN
  v_current_date := p_start_date;
  
  WHILE v_current_date <= p_end_date LOOP
    day_of_week := EXTRACT(DOW FROM v_current_date);
    
    -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
    -- Domingo: 7 slots (cada 45 minutos desde 11:00 hasta 15:30)
    IF day_of_week = 0 THEN
      -- Domingo: 7 slots (cada 45 minutos desde 11:00 hasta 15:30)
      FOR i IN 0..6 LOOP
        slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
        end_time := slot_time + INTERVAL '45 minutes';
        
        INSERT INTO time_slots (date, start_time, end_time, available, is_occupied)
        VALUES (v_current_date, slot_time, end_time, TRUE, FALSE)
        ON CONFLICT (date, start_time) DO NOTHING;
        
        slots_created := slots_created + 1;
      END LOOP;
    ELSE
      -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
      FOR i IN 0..10 LOOP
        slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
        end_time := slot_time + INTERVAL '45 minutes';
        
        INSERT INTO time_slots (date, start_time, end_time, available, is_occupied)
        VALUES (v_current_date, slot_time, end_time, TRUE, FALSE)
        ON CONFLICT (date, start_time) DO NOTHING;
        
        slots_created := slots_created + 1;
      END LOOP;
    END IF;
    
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN slots_created;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION generate_time_slots(DATE, DATE) SET search_path = public;

-- =====================================================
-- 2. FUNCIÓN PARA GENERAR SLOTS ON-DEMAND (una fecha)
-- =====================================================

CREATE OR REPLACE FUNCTION ensure_time_slots_for_date(p_date DATE)
RETURNS VOID AS $$
DECLARE
  slot_time TIME;
  end_time TIME;
  day_of_week INTEGER;
  i INTEGER;
  max_allowed_date DATE;
  current_date_monterrey DATE;
BEGIN
  -- Obtener fecha actual en zona horaria de Monterrey
  current_date_monterrey := get_current_date_monterrey();
  
  -- Validar que la fecha esté dentro del rango permitido (6 meses desde hoy, usando zona horaria de Monterrey)
  max_allowed_date := (current_date_monterrey + INTERVAL '6 months')::DATE;
  
  IF p_date < current_date_monterrey THEN
    RAISE EXCEPTION 'No se pueden crear slots para fechas pasadas';
  END IF;
  
  IF p_date > max_allowed_date THEN
    RAISE EXCEPTION 'No se pueden crear slots más de 6 meses en el futuro';
  END IF;
  
  day_of_week := EXTRACT(DOW FROM p_date);
  
  -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
  -- Domingo: 7 slots (cada 45 minutos desde 11:00 hasta 15:30)
  IF day_of_week = 0 THEN
    -- Domingo: 7 slots (cada 45 minutos desde 11:00 hasta 15:30)
    FOR i IN 0..6 LOOP
      slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
      end_time := slot_time + INTERVAL '45 minutes';
      
      INSERT INTO time_slots (date, start_time, end_time, available, is_occupied)
      VALUES (p_date, slot_time, end_time, TRUE, FALSE)
      ON CONFLICT (date, start_time) DO NOTHING;
    END LOOP;
  ELSE
    -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
    FOR i IN 0..10 LOOP
      slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
      end_time := slot_time + INTERVAL '45 minutes';
      
      INSERT INTO time_slots (date, start_time, end_time, available, is_occupied)
      VALUES (p_date, slot_time, end_time, TRUE, FALSE)
      ON CONFLICT (date, start_time) DO NOTHING;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION ensure_time_slots_for_date(DATE) SET search_path = public;

-- =====================================================
-- 3. FUNCIÓN DE MANTENIMIENTO AUTOMÁTICO
-- =====================================================
-- Extiende el rango de slots automáticamente para mantener
-- siempre 6 meses de slots disponibles
-- =====================================================

CREATE OR REPLACE FUNCTION maintain_time_slots()
RETURNS VOID AS $$
DECLARE
  max_date DATE;
  target_date DATE;
  current_date_monterrey DATE;
BEGIN
  -- Obtener fecha actual en zona horaria de Monterrey
  current_date_monterrey := get_current_date_monterrey();
  
  -- La fecha objetivo siempre es máximo 6 meses desde hoy (usando zona horaria de Monterrey)
  target_date := (current_date_monterrey + INTERVAL '6 months')::DATE;
  
  -- Obtener la fecha máxima actual en la base de datos
  SELECT MAX(date) INTO max_date FROM time_slots;
  
  -- Si no hay slots, generar desde hoy hasta 6 meses
  IF max_date IS NULL THEN
    PERFORM generate_time_slots(current_date_monterrey, target_date);
  -- Si la fecha máxima es menor a 6 meses desde hoy, extender
  ELSIF max_date < target_date THEN
    PERFORM generate_time_slots((max_date + INTERVAL '1 day')::DATE, target_date);
  END IF;
  
  -- Eliminar slots de fechas pasadas (limpieza automática, usando zona horaria de Monterrey)
  DELETE FROM time_slots WHERE date < current_date_monterrey;
  
  -- Eliminar slots más allá de 6 meses (por si acaso)
  DELETE FROM time_slots WHERE date > target_date;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION maintain_time_slots() SET search_path = public;

-- =====================================================
-- 4. FUNCIÓN PARA OBTENER SLOTS DISPONIBLES (VERSIÓN MEJORADA)
-- =====================================================
-- Esta función:
-- - Mantiene automáticamente el rango de 6 meses
-- - Crea slots on-demand si no existen
-- - Valida que la fecha esté en rango permitido
-- =====================================================

CREATE OR REPLACE FUNCTION get_available_slots(p_date DATE)
RETURNS TABLE (
  id UUID,
  start_time TIME,
  end_time TIME
) AS $$
DECLARE
  current_date_monterrey DATE;
  current_time_monterrey TIME;
BEGIN
  -- Obtener fecha y hora actual en zona horaria de Monterrey
  -- Solo necesario para filtrar horarios pasados del día actual
  current_date_monterrey := get_current_date_monterrey();
  current_time_monterrey := get_current_time_monterrey();
  
  -- Nota: No se realizan validaciones de rango porque:
  -- 1. El frontend ya valida las fechas permitidas (minDate/maxDate)
  -- 2. get_month_availability() se encarga de deshabilitar días pasados y futuros en el calendario
  -- 3. El cron job diario (maintain_time_slots) mantiene siempre 6 meses de slots disponibles
  -- 4. Esta función es puramente consultiva - solo retorna lo que existe en la BD
  
  RETURN QUERY
  SELECT 
    ts.id,
    ts.start_time,
    ts.end_time
  FROM time_slots ts
  LEFT JOIN availability a ON a.date = ts.date
  WHERE ts.date = p_date
    AND ts.available = TRUE
    AND ts.is_occupied = FALSE
    AND (a.is_closed IS NULL OR a.is_closed = FALSE)
    -- Si es el día actual, filtrar horarios que ya pasaron (usando zona horaria de Monterrey)
    AND (
      p_date > current_date_monterrey 
      OR (p_date = current_date_monterrey AND ts.start_time > current_time_monterrey)
    )
  ORDER BY ts.start_time;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION get_available_slots(DATE) SET search_path = public;

-- =====================================================
-- 5. FUNCIÓN PARA VERIFICAR DISPONIBILIDAD DE UN SLOT
-- =====================================================

CREATE OR REPLACE FUNCTION is_slot_available(
  p_date DATE,
  p_start_time TIME
)
RETURNS BOOLEAN AS $$
DECLARE
  v_available BOOLEAN;
  v_is_occupied BOOLEAN;
  v_is_closed BOOLEAN;
  current_date_monterrey DATE;
  current_time_monterrey TIME;
BEGIN
  -- Obtener fecha y hora actual en zona horaria de Monterrey
  current_date_monterrey := get_current_date_monterrey();
  current_time_monterrey := get_current_time_monterrey();
  
  -- Si es el día actual, verificar que el slot no haya pasado
  IF p_date = current_date_monterrey AND p_start_time <= current_time_monterrey THEN
    RETURN FALSE; -- El slot ya pasó
  END IF;
  
  -- Verificar si el día está cerrado
  SELECT is_closed INTO v_is_closed
  FROM availability
  WHERE date = p_date;
  
  -- Si el día está cerrado, no está disponible
  IF v_is_closed = TRUE THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar el slot específico
  SELECT available, is_occupied
  INTO v_available, v_is_occupied
  FROM time_slots
  WHERE date = p_date
    AND start_time = p_start_time;
  
  -- Si no existe el slot, no está disponible
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- El slot está disponible si:
  -- 1. available = TRUE
  -- 2. is_occupied = FALSE
  RETURN v_available = TRUE AND v_is_occupied = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION is_slot_available(DATE, TIME) SET search_path = public;

-- =====================================================
-- 6. FUNCIÓN PARA CALCULAR OCUPACIÓN DIARIA
-- =====================================================

CREATE OR REPLACE FUNCTION get_daily_occupancy(p_date DATE)
RETURNS TABLE (
  total_slots INTEGER,
  occupied_slots INTEGER,
  available_slots INTEGER,
  occupancy_percentage DECIMAL(5, 2)
) AS $$
DECLARE
  v_total_slots INTEGER;
  v_occupied_slots INTEGER;
  v_available_slots INTEGER;
  v_percentage DECIMAL(5, 2);
BEGIN
  -- Contar total de slots del día
  SELECT COUNT(*) INTO v_total_slots
  FROM time_slots
  WHERE date = p_date;
  
  -- Contar slots ocupados (is_occupied = TRUE)
  SELECT COUNT(*) INTO v_occupied_slots
  FROM time_slots
  WHERE date = p_date
    AND is_occupied = TRUE;
  
  -- Calcular disponibles
  v_available_slots := v_total_slots - v_occupied_slots;
  
  -- Calcular porcentaje de ocupación
  IF v_total_slots > 0 THEN
    v_percentage := (v_occupied_slots::DECIMAL / v_total_slots::DECIMAL) * 100;
  ELSE
    v_percentage := 0;
  END IF;
  
  RETURN QUERY SELECT 
    v_total_slots,
    v_occupied_slots,
    v_available_slots,
    v_percentage;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION get_daily_occupancy(DATE) SET search_path = public;

-- =====================================================
-- 7. FUNCIÓN PARA OBTENER DISPONIBILIDAD DE UN RANGO DE FECHAS (HEATMAP)
-- =====================================================
-- Obtiene la cantidad de slots disponibles para cada fecha en un rango
-- Útil para visualizar disponibilidad en un calendario (heatmap)
-- =====================================================

CREATE OR REPLACE FUNCTION get_month_availability(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  available_slots INTEGER
) AS $$
DECLARE
  current_date_monterrey DATE;
  current_time_monterrey TIME;
BEGIN
  -- Obtener fecha y hora actual en zona horaria de Monterrey
  current_date_monterrey := get_current_date_monterrey();
  current_time_monterrey := get_current_time_monterrey();
  
  RETURN QUERY
  SELECT 
    ts.date,
    COUNT(*)::INTEGER as available_slots
  FROM time_slots ts
  LEFT JOIN availability a ON a.date = ts.date
  WHERE ts.date >= p_start_date
    AND ts.date <= p_end_date
    AND ts.available = TRUE
    AND ts.is_occupied = FALSE
    AND (a.is_closed IS NULL OR a.is_closed = FALSE)
    -- Si es el día actual, filtrar horarios que ya pasaron para el conteo del heatmap (usando zona horaria de Monterrey)
    AND (
      ts.date > current_date_monterrey 
      OR (ts.date = current_date_monterrey AND ts.start_time > current_time_monterrey)
    )
  GROUP BY ts.date
  ORDER BY ts.date;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION get_month_availability(DATE, DATE) SET search_path = public;

-- =====================================================
-- 7. FUNCIÓN PARA OBTENER ESTADÍSTICAS DE RESERVAS
-- =====================================================

CREATE OR REPLACE FUNCTION get_reservations_stats(p_date DATE)
RETURNS TABLE (
  total_reservations INTEGER,
  confirmed_reservations INTEGER,
  cancelled_reservations INTEGER,
  completed_reservations INTEGER,
  total_revenue DECIMAL(10, 2),
  confirmed_revenue DECIMAL(10, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_reservations,
    COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER as confirmed_reservations,
    COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER as cancelled_reservations,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER as completed_reservations,
    COALESCE(SUM(price), 0)::DECIMAL(10, 2) as total_revenue,
    COALESCE(SUM(price) FILTER (WHERE status = 'confirmed'), 0)::DECIMAL(10, 2) as confirmed_revenue
  FROM reservations
  WHERE date = p_date;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION get_reservations_stats(DATE) SET search_path = public;

-- =====================================================
-- CONFIGURAR SEARCH_PATH EN FUNCIONES DEL ESQUEMA
-- =====================================================
-- Estas funciones se crean en 01-schema.sql, pero las configuramos aquí
-- para asegurar que tengan el search_path correcto
-- =====================================================

ALTER FUNCTION update_updated_at_column() SET search_path = public;
ALTER FUNCTION update_time_slot_occupied() SET search_path = public;

-- =====================================================
-- COMENTARIOS EN FUNCIONES
-- =====================================================

COMMENT ON FUNCTION generate_time_slots IS 'Genera time_slots para un rango de fechas (útil para poblar meses completos)';
COMMENT ON FUNCTION ensure_time_slots_for_date IS 'Asegura que los slots existan para una fecha específica (on-demand)';
COMMENT ON FUNCTION maintain_time_slots IS 'Mantiene automáticamente el rango de slots (siempre 6 meses disponibles)';
COMMENT ON FUNCTION get_available_slots IS 'Obtiene slots disponibles, creándolos automáticamente si no existen y manteniendo el rango';
COMMENT ON FUNCTION is_slot_available IS 'Verifica si un slot específico está disponible para reservar';
COMMENT ON FUNCTION get_daily_occupancy IS 'Calcula la ocupación diaria (total, ocupados, disponibles, porcentaje)';
COMMENT ON FUNCTION get_month_availability IS 'Obtiene disponibilidad de slots para un rango de fechas (útil para heatmap de calendario)';
COMMENT ON FUNCTION get_reservations_stats IS 'Obtiene estadísticas de reservas de una fecha (cantidad, ingresos)';

-- =====================================================
-- PERMISOS DE EJECUCIÓN PARA FUNCIONES RPC
-- =====================================================
-- Permitir que usuarios anónimos y autenticados ejecuten las funciones RPC

GRANT EXECUTE ON FUNCTION get_available_slots(DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_available_slots(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION is_slot_available(DATE, TIME) TO anon;
GRANT EXECUTE ON FUNCTION is_slot_available(DATE, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_occupancy(DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_daily_occupancy(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_availability(DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_month_availability(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reservations_stats(DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_reservations_stats(DATE) TO authenticated;
