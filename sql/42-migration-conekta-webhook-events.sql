-- =====================================================
-- MIGRATION 42: tabla `conekta_webhook_events`
-- =====================================================
-- Bitácora de cada evento de webhook recibido de Conekta.
--
-- Sirve para:
-- 1. Auditoría completa de pagos / reembolsos / chargebacks.
-- 2. IDEMPOTENCIA: Conekta reintenta webhooks si no obtiene 2xx.
--    Si llega un evento con `event_id` ya registrado, lo ignoramos.
-- 3. Debugging: el `raw_payload` queda almacenado para reproducir bugs.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS conekta_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ID que provee Conekta. Es la llave de idempotencia.
  event_id TEXT NOT NULL UNIQUE,

  event_type TEXT NOT NULL,

  -- Identificadores extraídos del payload para queries rápidas.
  payment_id TEXT,
  charge_id TEXT,

  raw_payload JSONB NOT NULL,
  signature TEXT,

  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_conekta_webhook_events_payment_id
  ON conekta_webhook_events (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conekta_webhook_events_type
  ON conekta_webhook_events (event_type);

CREATE INDEX IF NOT EXISTS idx_conekta_webhook_events_created_at
  ON conekta_webhook_events (created_at DESC);

ALTER TABLE conekta_webhook_events ENABLE ROW LEVEL SECURITY;

-- Sin políticas: sólo Service Role Key puede leer/escribir.

COMMENT ON TABLE conekta_webhook_events IS
  'Bitácora de webhooks de Conekta con idempotencia por event_id.';
COMMENT ON COLUMN conekta_webhook_events.event_id IS
  'ID único del evento provisto por Conekta. Llave de deduplicación.';
COMMENT ON COLUMN conekta_webhook_events.status IS
  'received (recién insertado) | processed (handler corrió OK) | ignored (no nos interesa) | failed (handler lanzó)';

COMMIT;
