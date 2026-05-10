-- =====================================================
-- MIGRATION 43: agrega estado 'refund_in_progress' a pending_reservations
-- =====================================================
-- Cierra una race condition entre el cron de huérfanos y el webhook de
-- Conekta: ambos pueden ver un mismo `pending_reservations` pendiente y
-- actuar simultáneamente (uno crea reserva, el otro reembolsa).
--
-- El cron toma claim atómico moviendo el row a 'refund_in_progress' y solo
-- procede si el UPDATE devolvió fila (otra ejecución no pudo hacerlo).
-- Si el reembolso falla, se revierte a 'pending_payment' para reintentar.
-- El webhook respeta este estado y NO crea la reserva.
--
-- Idempotente: si ya se aplicó la 41 con esta variante, este script no
-- cambia nada. Si la 41 instaló el CHECK viejo, lo recrea.
-- =====================================================

BEGIN;

-- Recrea el CHECK con el nuevo valor permitido. Postgres no admite
-- IF NOT EXISTS para constraints, así que primero lo eliminamos si existe.
ALTER TABLE pending_reservations
  DROP CONSTRAINT IF EXISTS pending_reservations_status_check;

ALTER TABLE pending_reservations
  ADD CONSTRAINT pending_reservations_status_check
  CHECK (status IN (
    'pending_payment',
    'refund_in_progress',
    'consumed',
    'refunded',
    'failed'
  ));

COMMENT ON COLUMN pending_reservations.status IS
  'pending_payment | refund_in_progress (cron tomó claim) | consumed | refunded | failed';

COMMIT;
