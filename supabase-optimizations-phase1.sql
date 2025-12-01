-- =====================================================
-- OPTIMIZACIONES FASE 1 - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Esta fase incluye:
-- 1. Índices compuestos para consultas rápidas
-- 2. Trigger para actualizar reservations_count automáticamente
-- =====================================================

-- =====================================================
-- 1. ÍNDICES COMPUESTOS PARA MEJORAR PERFORMANCE
-- =====================================================

-- Índice para consultar reservas por fecha y estado (para cálculo de ocupación)
-- Útil cuando necesitas saber cuántas reservas confirmadas hay en una fecha
CREATE INDEX IF NOT EXISTS idx_reservations_date_status 
ON reservations(date, status) 
WHERE status = 'confirmed';

-- Índice para consultar time_slots por fecha y disponibilidad
-- Útil cuando buscas slots disponibles en una fecha específica
CREATE INDEX IF NOT EXISTS idx_time_slots_date_available 
ON time_slots(date, available) 
WHERE available = true;

-- Índice compuesto para consultar reservas por fecha, hora y estado
-- Útil para verificar disponibilidad en un horario específico
CREATE INDEX IF NOT EXISTS idx_reservations_date_time_status 
ON reservations(date, start_time, status) 
WHERE status = 'confirmed';

-- =====================================================
-- 2. FUNCIÓN PARA ACTUALIZAR RESERVATIONS_COUNT EN EL SLOT EXACTO
-- =====================================================

CREATE OR REPLACE FUNCTION update_time_slot_reservations_count()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  old_start_time TIME;
  old_status TEXT;
  new_date DATE;
  new_start_time TIME;
  new_status TEXT;
BEGIN
  -- Determinar valores según la operación
  IF TG_OP = 'INSERT' THEN
    -- NUEVA RESERVA: Si es confirmada, incrementar contador del slot exacto
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_status := NEW.status;
    
    IF new_status = 'confirmed' THEN
      -- Actualizar solo el slot exacto de la reserva
      UPDATE time_slots
      SET reservations_count = reservations_count + 1,
          updated_at = NOW()
      WHERE date = new_date
        AND start_time = new_start_time;
    END IF;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- ACTUALIZACIÓN: Manejar cambios de fecha, hora o status
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_status := OLD.status;
    
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_status := NEW.status;
    
    -- Si cambió la fecha o la hora (re-agendamiento)
    IF old_date != new_date OR old_start_time != new_start_time THEN
      -- Decrementar en la fecha/hora antigua (si estaba confirmada)
      IF old_status = 'confirmed' THEN
        UPDATE time_slots
        SET reservations_count = GREATEST(0, reservations_count - 1),
            updated_at = NOW()
        WHERE date = old_date
          AND start_time = old_start_time;
      END IF;
      
      -- Incrementar en la fecha/hora nueva (si está confirmada)
      IF new_status = 'confirmed' THEN
        UPDATE time_slots
        SET reservations_count = reservations_count + 1,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
    END IF;
    
    -- Si solo cambió el status (cancelación o reactivación)
    IF old_date = new_date AND old_start_time = new_start_time THEN
      -- De 'confirmed' a 'cancelled' o 'completed': decrementar
      IF old_status = 'confirmed' AND new_status IN ('cancelled', 'completed') THEN
        UPDATE time_slots
        SET reservations_count = GREATEST(0, reservations_count - 1),
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
      
      -- De 'cancelled' o 'completed' a 'confirmed': incrementar
      IF old_status IN ('cancelled', 'completed') AND new_status = 'confirmed' THEN
        UPDATE time_slots
        SET reservations_count = reservations_count + 1,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
    END IF;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- ELIMINACIÓN: Si se elimina una reserva confirmada, decrementar
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_status := OLD.status;
    
    IF old_status = 'confirmed' THEN
      UPDATE time_slots
      SET reservations_count = GREATEST(0, reservations_count - 1),
          updated_at = NOW()
      WHERE date = old_date
        AND start_time = old_start_time;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. TRIGGER PARA ACTUALIZAR RESERVATIONS_COUNT AUTOMÁTICAMENTE
-- =====================================================

DROP TRIGGER IF EXISTS update_time_slot_count_on_reservation ON reservations;
CREATE TRIGGER update_time_slot_count_on_reservation
AFTER INSERT OR UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION update_time_slot_reservations_count();

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- Este trigger actualiza automáticamente reservations_count en time_slots
-- cuando se crea, actualiza o elimina una reserva.
--
-- Lógica simplificada:
-- - Una reserva ocupa exactamente 1 slot (1 hora)
-- - El slot se identifica por date + start_time
--
-- Ejemplo:
-- - Reserva: 11:00-12:00
-- - Slot afectado: 11:00-12:00 (solo ese slot)
-- - El slot incrementa su reservations_count en 1
--
-- Cada slot solo puede tener 1 reserva a la vez

