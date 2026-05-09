-- =====================================================
-- MIGRACIÓN 39: ocupación de time_slots por rango [start_time, end_time)
-- =====================================================
-- Hasta ahora, el trigger `update_time_slot_occupied` solo marcaba como ocupado
-- el slot cuyo `start_time` coincidía exactamente con `reservations.start_time`.
-- Eso funciona si todas las reservas son de 45 min, pero las citas tipo Alvero
-- ahora ocupan 90 min (2 bloques consecutivos), por lo que el segundo slot
-- quedaba "libre" en `time_slots` y podía reasignarse.
--
-- Esta migración reemplaza la lógica para que el trigger ocupe/libere TODOS
-- los `time_slots` cuyo `start_time` cae dentro del rango
-- [reservation.start_time, reservation.end_time).
-- Es retro-compatible con reservas de 45 min: el rango cubre exactamente 1 slot.
--
-- Adicionalmente: al LIBERAR (UPDATE/DELETE), se verifica con NOT EXISTS que
-- ninguna OTRA reserva confirmada siga ocupando ese slot, evitando que un
-- cancel/reagenda libere por error un slot que otra reserva todavía usa
-- (defensa ante race conditions o datos importados solapados).
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_time_slot_occupied()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  old_start_time TIME;
  old_end_time TIME;
  old_status TEXT;
  new_date DATE;
  new_start_time TIME;
  new_end_time TIME;
  new_status TEXT;
  current_id INTEGER;
BEGIN
  current_id := COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'INSERT' THEN
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_end_time := NEW.end_time;
    new_status := NEW.status;

    IF new_status = 'confirmed' THEN
      UPDATE time_slots
      SET is_occupied = TRUE,
          updated_at = NOW()
      WHERE date = new_date
        AND start_time >= new_start_time
        AND start_time < new_end_time;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_end_time := OLD.end_time;
    old_status := OLD.status;

    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_end_time := NEW.end_time;
    new_status := NEW.status;

    -- Reagendamiento o cambio de duración: liberar rango antiguo y ocupar el nuevo
    IF old_date <> new_date
       OR old_start_time <> new_start_time
       OR old_end_time <> new_end_time THEN
      IF old_status = 'confirmed' THEN
        UPDATE time_slots ts
        SET is_occupied = FALSE,
            updated_at = NOW()
        WHERE ts.date = old_date
          AND ts.start_time >= old_start_time
          AND ts.start_time < old_end_time
          AND NOT EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.id <> current_id
              AND r.status = 'confirmed'
              AND r.date = ts.date
              AND ts.start_time >= r.start_time
              AND ts.start_time < r.end_time
          );
      END IF;

      IF new_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = TRUE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time >= new_start_time
          AND start_time < new_end_time;
      END IF;
    END IF;

    -- Cambio de status sin cambio de fecha/hora/duración
    IF old_date = new_date
       AND old_start_time = new_start_time
       AND old_end_time = new_end_time THEN
      IF old_status <> 'confirmed' AND new_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = TRUE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time >= new_start_time
          AND start_time < new_end_time;
      END IF;

      IF old_status = 'confirmed' AND new_status <> 'confirmed' THEN
        UPDATE time_slots ts
        SET is_occupied = FALSE,
            updated_at = NOW()
        WHERE ts.date = new_date
          AND ts.start_time >= new_start_time
          AND ts.start_time < new_end_time
          AND NOT EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.id <> current_id
              AND r.status = 'confirmed'
              AND r.date = ts.date
              AND ts.start_time >= r.start_time
              AND ts.start_time < r.end_time
          );
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_end_time := OLD.end_time;
    old_status := OLD.status;

    IF old_status = 'confirmed' THEN
      UPDATE time_slots ts
      SET is_occupied = FALSE,
          updated_at = NOW()
      WHERE ts.date = old_date
        AND ts.start_time >= old_start_time
        AND ts.start_time < old_end_time
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.id <> current_id
            AND r.status = 'confirmed'
            AND r.date = ts.date
            AND ts.start_time >= r.start_time
            AND ts.start_time < r.end_time
        );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION update_time_slot_occupied() SET search_path = public;

COMMIT;
