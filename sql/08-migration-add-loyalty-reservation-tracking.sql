-- =====================================================
-- MIGRACIÓN: rastreo y revocación de puntos/créditos por reserva
-- =====================================================
-- Agrega columnas para asociar puntos/créditos a una reserva
-- y permitir revocarlos al cancelar.
-- =====================================================

BEGIN;

-- loyalty_points: asociar a reserva y permitir revocación
ALTER TABLE loyalty_points
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id),
  ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- credits: asociar a reserva y permitir revocación
ALTER TABLE credits
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id),
  ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Índices para consultas por reserva/estado
CREATE INDEX IF NOT EXISTS idx_loyalty_points_reservation_id
  ON loyalty_points(reservation_id, revoked, used);

CREATE INDEX IF NOT EXISTS idx_credits_reservation_id
  ON credits(reservation_id, revoked, used);

COMMIT;

