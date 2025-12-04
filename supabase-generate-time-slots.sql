-- =====================================================
-- FUNCIÓN PARA GENERAR TIME SLOTS AUTOMÁTICAMENTE
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Esta función crea los time_slots para un rango de fechas
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
        
        INSERT INTO time_slots (date, start_time, end_time, available, reservations_count)
        VALUES (v_current_date, slot_time, end_time, TRUE, 0)
        ON CONFLICT (date, start_time) DO NOTHING;
        
        slots_created := slots_created + 1;
      END LOOP;
    ELSE
      -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
      FOR i IN 0..10 LOOP
        slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
        end_time := slot_time + INTERVAL '45 minutes';
        
        INSERT INTO time_slots (date, start_time, end_time, available, reservations_count)
        VALUES (v_current_date, slot_time, end_time, TRUE, 0)
        ON CONFLICT (date, start_time) DO NOTHING;
        
        slots_created := slots_created + 1;
      END LOOP;
    END IF;
    
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN slots_created;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN PARA GENERAR SLOTS ON-DEMAND (cuando se necesiten)
-- =====================================================

CREATE OR REPLACE FUNCTION ensure_time_slots_for_date(p_date DATE)
RETURNS VOID AS $$
DECLARE
  slot_time TIME;
  end_time TIME;
  day_of_week INTEGER;
  i INTEGER;
BEGIN
  day_of_week := EXTRACT(DOW FROM p_date);
  
  -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
  -- Domingo: 7 slots (cada 45 minutos desde 11:00 hasta 15:30)
  IF day_of_week = 0 THEN
    -- Domingo: 7 slots (cada 45 minutos desde 11:00 hasta 15:30)
    FOR i IN 0..6 LOOP
      slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
      end_time := slot_time + INTERVAL '45 minutes';
      
      INSERT INTO time_slots (date, start_time, end_time, available, reservations_count)
      VALUES (p_date, slot_time, end_time, TRUE, 0)
      ON CONFLICT (date, start_time) DO NOTHING;
    END LOOP;
  ELSE
    -- Lunes a Sábado: 11 slots (cada 45 minutos desde 11:00 hasta 18:30)
    FOR i IN 0..10 LOOP
      slot_time := (TIME '11:00:00' + (i * 45 || ' minutes')::INTERVAL);
      end_time := slot_time + INTERVAL '45 minutes';
      
      INSERT INTO time_slots (date, start_time, end_time, available, reservations_count)
      VALUES (p_date, slot_time, end_time, TRUE, 0)
      ON CONFLICT (date, start_time) DO NOTHING;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ACTUALIZAR FUNCIÓN get_available_slots PARA CREAR SLOTS ON-DEMAND
-- =====================================================

CREATE OR REPLACE FUNCTION get_available_slots(p_date DATE)
RETURNS TABLE (
  id UUID,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  -- Asegurar que los slots existan para esta fecha
  PERFORM ensure_time_slots_for_date(p_date);
  
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
-- COMENTARIOS
-- =====================================================

COMMENT ON FUNCTION generate_time_slots IS 'Genera time_slots para un rango de fechas (útil para poblar meses completos)';
COMMENT ON FUNCTION ensure_time_slots_for_date IS 'Asegura que los slots existan para una fecha específica (on-demand)';
COMMENT ON FUNCTION get_available_slots IS 'Obtiene slots disponibles, creándolos automáticamente si no existen';

-- =====================================================
-- EJEMPLOS DE USO
-- =====================================================
--
-- Generar slots para los próximos 3 meses:
-- SELECT generate_time_slots(CURRENT_DATE, CURRENT_DATE + INTERVAL '3 months');
--
-- Asegurar slots para una fecha específica:
-- SELECT ensure_time_slots_for_date('2024-12-17');
--
-- Obtener slots (se crean automáticamente si no existen):
-- SELECT * FROM get_available_slots('2024-12-17');

