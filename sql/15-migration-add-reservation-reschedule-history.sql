-- =====================================================
-- MIGRATION: Historial de reagendamientos
-- =====================================================
-- Descripción: Tabla para registrar cada reagendamiento y quién lo hizo,
--              visible para admins y usuarios.
-- =====================================================

CREATE TABLE IF NOT EXISTS reservation_reschedule_history (
  id SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  rescheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rescheduled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_date DATE NOT NULL,
  previous_start_time TIME NOT NULL,
  new_date DATE NOT NULL,
  new_start_time TIME NOT NULL,
  additional_payment_amount DECIMAL(10, 2),
  additional_payment_method TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservation_reschedule_history_reservation_id
  ON reservation_reschedule_history(reservation_id);

COMMENT ON TABLE reservation_reschedule_history IS 'Cada reagendamiento: quién, cuándo, de qué fecha/hora a cuál';
