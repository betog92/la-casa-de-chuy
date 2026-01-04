-- =====================================================
-- MIGRACIÓN: reservations_count → is_occupied
-- =====================================================
-- IMPORTANTE: Ejecutar esto EN ORDEN en Supabase SQL Editor
-- =====================================================

BEGIN;

-- Paso 1: Agregar nueva columna is_occupied
ALTER TABLE time_slots 
ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN DEFAULT FALSE;

-- Paso 2: Migrar datos solo si la columna legacy existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'time_slots'
      AND column_name = 'reservations_count'
  ) THEN
    UPDATE time_slots 
    SET is_occupied = (reservations_count > 0);
  ELSE
    RAISE NOTICE 'Columna reservations_count no existe; se omite la migración de datos.';
  END IF;
END $$;

DO $$
DECLARE
  v_count_mismatch INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'time_slots'
      AND column_name = 'reservations_count'
  ) THEN
    SELECT COUNT(*) INTO v_count_mismatch
    FROM time_slots
    WHERE (reservations_count > 0) != is_occupied;
    
    IF v_count_mismatch > 0 THEN
      RAISE EXCEPTION 'Error en migración: % registros no coinciden', v_count_mismatch;
    END IF;
    
    RAISE NOTICE 'Migración de datos exitosa: % registros verificados', 
      (SELECT COUNT(*) FROM time_slots);
  ELSE
    RAISE NOTICE 'Columna reservations_count no existe; se omite verificación de migración.';
  END IF;
END $$;

-- Paso 4: Eliminar función y trigger antiguos ANTES de crear los nuevos
DROP TRIGGER IF EXISTS update_time_slot_count_on_reservation ON reservations;
DROP FUNCTION IF EXISTS update_time_slot_reservations_count();

-- Paso 5: Crear nueva función del trigger (CON EL NUEVO CAMPO)
CREATE OR REPLACE FUNCTION update_time_slot_occupied()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  old_start_time TIME;
  old_status TEXT;
  new_date DATE;
  new_start_time TIME;
  new_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_status := NEW.status;
    
    IF new_status = 'confirmed' THEN
      UPDATE time_slots
      SET is_occupied = TRUE,
          updated_at = NOW()
      WHERE date = new_date
        AND start_time = new_start_time;
    END IF;
    
  ELSIF TG_OP = 'UPDATE' THEN
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_status := OLD.status;
    
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_status := NEW.status;
    
    -- Si cambió la fecha o la hora (re-agendamiento)
    IF old_date != new_date OR old_start_time != new_start_time THEN
      IF old_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = FALSE,
            updated_at = NOW()
        WHERE date = old_date
          AND start_time = old_start_time;
      END IF;
      
      IF new_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = TRUE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
    END IF;
    
    -- Si solo cambió el status
    IF old_date = new_date AND old_start_time = new_start_time THEN
      IF old_status != 'confirmed' AND new_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = TRUE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
      
      IF old_status = 'confirmed' AND new_status != 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = FALSE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
    END IF;
    
  ELSIF TG_OP = 'DELETE' THEN
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_status := OLD.status;
    
    IF old_status = 'confirmed' THEN
      UPDATE time_slots
      SET is_occupied = FALSE,
          updated_at = NOW()
      WHERE date = old_date
        AND start_time = old_start_time;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION update_time_slot_occupied() SET search_path = public;

-- Paso 6: Crear nuevo trigger (el antiguo ya fue eliminado en el Paso 4)
DROP TRIGGER IF EXISTS update_time_slot_occupied_on_reservation ON reservations;
CREATE TRIGGER update_time_slot_occupied_on_reservation
AFTER INSERT OR UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION update_time_slot_occupied();

-- Paso 7: Eliminar la columna legacy reservations_count (ya no se usa)
ALTER TABLE time_slots
  DROP COLUMN IF EXISTS reservations_count;

COMMIT;

-- Verificación final
SELECT 
  'Slots disponibles' AS tipo,
  COUNT(*) AS cantidad
FROM time_slots
WHERE is_occupied = FALSE AND available = TRUE

UNION ALL

SELECT 
  'Slots ocupados' AS tipo,
  COUNT(*) AS cantidad
FROM time_slots
WHERE is_occupied = TRUE;

