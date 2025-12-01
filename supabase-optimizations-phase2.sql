-- =====================================================
-- OPTIMIZACIONES FASE 2 - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Esta fase incluye:
-- 1. Función para verificar disponibilidad de un slot
-- 2. Función para obtener slots disponibles de una fecha
-- 3. Función para calcular ocupación diaria
-- 4. Función para obtener estadísticas de reservas
-- =====================================================

-- =====================================================
-- 1. FUNCIÓN PARA VERIFICAR DISPONIBILIDAD DE UN SLOT
-- =====================================================

CREATE OR REPLACE FUNCTION is_slot_available(
  p_date DATE,
  p_start_time TIME
)
RETURNS BOOLEAN AS $$
DECLARE
  v_available BOOLEAN;
  v_reservations_count INTEGER;
  v_is_closed BOOLEAN;
BEGIN
  -- Verificar si el día está cerrado
  SELECT is_closed INTO v_is_closed
  FROM availability
  WHERE date = p_date;
  
  -- Si el día está cerrado, no está disponible
  IF v_is_closed = TRUE THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar el slot específico
  SELECT available, reservations_count
  INTO v_available, v_reservations_count
  FROM time_slots
  WHERE date = p_date
    AND start_time = p_start_time;
  
  -- Si no existe el slot, no está disponible
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- El slot está disponible si:
  -- 1. available = TRUE
  -- 2. reservations_count = 0
  RETURN v_available = TRUE AND v_reservations_count = 0;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. FUNCIÓN PARA OBTENER SLOTS DISPONIBLES DE UNA FECHA
-- =====================================================

CREATE OR REPLACE FUNCTION get_available_slots(p_date DATE)
RETURNS TABLE (
  id UUID,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ts.id,
    ts.start_time,
    ts.end_time
  FROM time_slots ts
  LEFT JOIN availability a ON a.date = ts.date
  WHERE ts.date = p_date
    AND ts.available = TRUE
    AND ts.reservations_count = 0
    AND (a.is_closed IS NULL OR a.is_closed = FALSE)
  ORDER BY ts.start_time;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. FUNCIÓN PARA CALCULAR OCUPACIÓN DIARIA
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
  
  -- Contar slots ocupados (reservations_count > 0)
  SELECT COUNT(*) INTO v_occupied_slots
  FROM time_slots
  WHERE date = p_date
    AND reservations_count > 0;
  
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

-- =====================================================
-- 4. FUNCIÓN PARA OBTENER ESTADÍSTICAS DE RESERVAS POR FECHA
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

-- =====================================================
-- COMENTARIOS EN FUNCIONES
-- =====================================================

COMMENT ON FUNCTION is_slot_available IS 'Verifica si un slot específico está disponible para reservar';
COMMENT ON FUNCTION get_available_slots IS 'Obtiene todos los slots disponibles de una fecha específica';
COMMENT ON FUNCTION get_daily_occupancy IS 'Calcula la ocupación diaria (total, ocupados, disponibles, porcentaje)';
COMMENT ON FUNCTION get_reservations_stats IS 'Obtiene estadísticas de reservas de una fecha (cantidad, ingresos)';

-- =====================================================
-- NOTAS DE USO
-- =====================================================
-- 
-- Ejemplos de uso:
--
-- 1. Verificar disponibilidad:
--    SELECT is_slot_available('2024-01-15', '11:00:00');
--
-- 2. Obtener slots disponibles:
--    SELECT * FROM get_available_slots('2024-01-15');
--
-- 3. Calcular ocupación:
--    SELECT * FROM get_daily_occupancy('2024-01-15');
--
-- 4. Estadísticas de reservas:
--    SELECT * FROM get_reservations_stats('2024-01-15');

