-- =====================================================
-- DATOS DE PRUEBA PARA HEATMAP DE DISPONIBILIDAD
-- =====================================================
-- Este script simula diferentes niveles de disponibilidad
-- para poder visualizar todos los colores del heatmap
--
-- Ejecuta este SQL en el SQL Editor de Supabase
-- IMPORTANTE: Solo para pruebas, no usar en producción
-- =====================================================

-- Variables para trabajar con fechas del mes actual
DO $$
DECLARE
  today DATE := CURRENT_DATE;
  first_day_of_month DATE;
  last_day_of_month DATE;
  test_date DATE;
  day_of_week INTEGER;
  total_slots INTEGER;
  slots_to_occupy INTEGER;
  i INTEGER;
BEGIN
  -- Calcular primer y último día del mes actual
  first_day_of_month := DATE_TRUNC('month', today)::DATE;
  last_day_of_month := (DATE_TRUNC('month', today) + INTERVAL '1 month - 1 day')::DATE;
  
  -- Limitar a máximo 6 meses desde hoy (regla del sistema)
  last_day_of_month := LEAST(last_day_of_month, (today + INTERVAL '6 months')::DATE);
  
  -- Empezar desde hoy (no desde el primer día del mes si ya pasó)
  test_date := GREATEST(first_day_of_month, today);
  
  -- Solo procesar si hay fechas válidas
  IF test_date > last_day_of_month THEN
    RAISE NOTICE 'No hay fechas válidas para procesar (todas están más de 6 meses en el futuro)';
    RETURN;
  END IF;
  
  WHILE test_date <= last_day_of_month LOOP
    -- Obtener día de la semana (0 = Domingo, 1-6 = Lunes-Sábado)
    day_of_week := EXTRACT(DOW FROM test_date);
    
    -- Determinar total de slots según el día
    IF day_of_week = 0 THEN
      total_slots := 7; -- Domingo
    ELSE
      total_slots := 11; -- Lunes-Sábado
    END IF;
    
    -- Asegurar que los slots existan (solo si la fecha es hoy o futura y dentro del rango de 6 meses)
    IF test_date >= today AND test_date <= (today + INTERVAL '6 months')::DATE THEN
      PERFORM ensure_time_slots_for_date(test_date);
    ELSE
      -- Si está fuera del rango, saltar este día
      test_date := test_date + INTERVAL '1 day';
      CONTINUE;
    END IF;
    
    -- Simular diferentes niveles de disponibilidad según el día del mes
    -- Esto crea un patrón visual interesante en el calendario
    
    IF EXTRACT(DAY FROM test_date) <= 5 THEN
      -- Días 1-5: Alta disponibilidad (80%+) - Verde oscuro
      -- Ocupar solo 1-2 slots (dependiendo del día)
      slots_to_occupy := CASE 
        WHEN day_of_week = 0 THEN 1  -- Domingo: ocupar 1 de 7 (86% disponible)
        ELSE 2                          -- Otros: ocupar 2 de 11 (82% disponible)
      END;
      
    ELSIF EXTRACT(DAY FROM test_date) <= 10 THEN
      -- Días 6-10: Disponibilidad moderada (50-79%) - Verde medio
      slots_to_occupy := CASE 
        WHEN day_of_week = 0 THEN 2  -- Domingo: ocupar 2 de 7 (71% disponible)
        ELSE 3                         -- Otros: ocupar 3 de 11 (73% disponible)
      END;
      
    ELSIF EXTRACT(DAY FROM test_date) <= 15 THEN
      -- Días 11-15: Baja disponibilidad (20-49%) - Verde claro
      slots_to_occupy := CASE 
        WHEN day_of_week = 0 THEN 4  -- Domingo: ocupar 4 de 7 (43% disponible)
        ELSE 5                         -- Otros: ocupar 5 de 11 (55% disponible)
      END;
      
    ELSIF EXTRACT(DAY FROM test_date) <= 20 THEN
      -- Días 16-20: Muy poca disponibilidad (1-19%) - Amarillo
      slots_to_occupy := CASE 
        WHEN day_of_week = 0 THEN 6  -- Domingo: ocupar 6 de 7 (14% disponible)
        ELSE 9                        -- Otros: ocupar 9 de 11 (18% disponible)
      END;
      
    ELSIF EXTRACT(DAY FROM test_date) <= 25 THEN
      -- Días 21-25: Sin disponibilidad (0%) - Rojo
      slots_to_occupy := total_slots; -- Ocupar todos los slots
      
    ELSE
      -- Días 26+: Alta disponibilidad de nuevo - Verde oscuro
      slots_to_occupy := CASE 
        WHEN day_of_week = 0 THEN 0  -- Domingo: todos disponibles
        ELSE 1                         -- Otros: ocupar 1 de 11 (91% disponible)
      END;
    END IF;
    
    -- Marcar algunos días específicos como cerrados (días 28, 29, 30, 31)
    IF EXTRACT(DAY FROM test_date) >= 28 THEN
      -- Insertar o actualizar en availability para marcar como cerrado
      INSERT INTO availability (date, is_closed)
      VALUES (test_date, TRUE)
      ON CONFLICT (date) 
      DO UPDATE SET is_closed = TRUE;
    ELSE
      -- Asegurar que no esté cerrado (por si acaso)
      INSERT INTO availability (date, is_closed)
      VALUES (test_date, FALSE)
      ON CONFLICT (date) 
      DO UPDATE SET is_closed = FALSE;
    END IF;
    
    -- Actualizar is_occupied en los slots para simular ocupación
    -- Actualizamos los primeros N slots del día (solo si la fecha es hoy o futura y dentro del rango)
    IF test_date >= today AND test_date <= (today + INTERVAL '6 months')::DATE THEN
      UPDATE time_slots
      SET is_occupied = TRUE,
          updated_at = NOW()
      WHERE date = test_date
        AND start_time IN (
          SELECT start_time
          FROM time_slots
          WHERE date = test_date
            AND available = TRUE
          ORDER BY start_time
          LIMIT slots_to_occupy
        );
    END IF;
    
    -- Avanzar al siguiente día
    test_date := test_date + INTERVAL '1 day';
  END LOOP;
  
  RAISE NOTICE 'Datos de prueba para heatmap creados exitosamente';
  RAISE NOTICE 'Mes: % a %', first_day_of_month, last_day_of_month;
END $$;

-- Verificar los resultados
SELECT 
  date,
  COUNT(*) FILTER (WHERE is_occupied = FALSE) AS available_slots,
  COUNT(*) FILTER (WHERE is_occupied = TRUE) AS occupied_slots,
  COUNT(*) AS total_slots,
  CASE 
    WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) = 0 THEN 'Sin disponibilidad (Rojo)'
    WHEN EXTRACT(DOW FROM date) = 0 THEN
      CASE 
        WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) >= 6 THEN 'Alta (80%+) - Verde oscuro'
        WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) >= 4 THEN 'Moderada (50-79%) - Verde medio'
        WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) >= 2 THEN 'Baja (20-49%) - Verde claro'
        ELSE 'Muy poca (1-19%) - Amarillo'
      END
    ELSE
      CASE 
        WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) >= 9 THEN 'Alta (80%+) - Verde oscuro'
        WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) >= 6 THEN 'Moderada (50-79%) - Verde medio'
        WHEN COUNT(*) FILTER (WHERE is_occupied = FALSE) >= 2 THEN 'Baja (20-49%) - Verde claro'
        ELSE 'Muy poca (1-19%) - Amarillo'
      END
  END AS heatmap_level
FROM time_slots
WHERE date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
  AND date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE
GROUP BY date
ORDER BY date;

-- Verificar días cerrados
SELECT 
  date,
  is_closed,
  CASE 
    WHEN is_closed THEN 'Día cerrado (Rojo con texto "Cerrado")'
    ELSE 'Día abierto'
  END AS status
FROM availability
WHERE date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
  AND date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE
ORDER BY date;

