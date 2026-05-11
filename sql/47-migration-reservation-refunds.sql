-- =====================================================
-- 47 - Reembolsos por cancelación (1 fila por cargo Conekta)
-- =====================================================
-- Permite reintentos con backoff y reconciliación vía webhook
-- `charge.refunded`. Ver `src/lib/payments/refund-processor.ts`.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reservation_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  charge_id TEXT,
  charge_kind TEXT NOT NULL CHECK (charge_kind IN ('initial', 'additional')),
  amount_mxn DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed', 'cancelled')),
  refund_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_message TEXT,
  last_error_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_refunds_reservation_id
  ON reservation_refunds(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservation_refunds_pending_retry
  ON reservation_refunds(next_retry_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reservation_refunds_reservation_charge_kind
  ON reservation_refunds(reservation_id, charge_kind);

COMMENT ON TABLE reservation_refunds IS
  'Filas de reembolso Conekta por cancelación (initial/additional). Cron reintenta pending.';

ALTER TABLE reservation_refunds ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_reservation_refunds_updated_at ON reservation_refunds;
CREATE TRIGGER update_reservation_refunds_updated_at
  BEFORE UPDATE ON reservation_refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
