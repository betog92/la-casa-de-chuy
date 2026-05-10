-- =====================================================
-- MIGRATION 41: tabla `pending_reservations`
-- =====================================================
-- Snapshot de los datos completos de la reserva ANTES de cobrar a Conekta.
--
-- Si el cliente completa el flujo de pago en el navegador, la reserva
-- se crea en `/api/reservations/create` y aquí se marca status='consumed'.
-- Si el cliente cierra la pestaña tras pagar, el webhook de Conekta puede
-- recuperar el snapshot y crear la reserva automáticamente. Si tras 10
-- minutos no hay reserva ni webhook procesó nada, un cron reembolsa.
--
-- Esto cierra la ventana de "pago huérfano": cliente cobrado sin reserva.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pending_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- `attempt_id` es el UUID que generamos en `/api/conekta/create-order`
  -- y mandamos a Conekta como `idempotencyKey` y en metadata.
  -- Sirve de llave para correlacionar webhook con snapshot.
  attempt_id UUID NOT NULL UNIQUE,

  -- `payment_id` es el `order.id` de Conekta. NULL hasta que la orden se
  -- crea exitosamente en Conekta. UNIQUE cuando no es NULL.
  payment_id TEXT,

  intent TEXT NOT NULL CHECK (intent IN ('reservation', 'reschedule')),

  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN (
      'pending_payment',
      'refund_in_progress',
      'consumed',
      'refunded',
      'failed'
    )),

  -- Snapshot completo del request del cliente (todo lo que `/reservations/create`
  -- y `/reschedule/complete` necesitan para finalizar la operación).
  -- Para `intent='reservation'`: { name, phone, date, startTime, sessionType,
  --   photographerStudio, useLoyaltyDiscount, useLoyaltyPoints, useCredits,
  --   discountCode }.
  -- Para `intent='reschedule'`: { reservationId, newDate, newStartTime,
  --   guestToken? }.
  payload JSONB NOT NULL,

  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  consumed_reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
  refunded_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- payment_id sólo se usa para correlacionar con Conekta y, sobre todo,
-- para que el cron y el webhook lo encuentren rápidamente. UNIQUE para
-- garantizar que un mismo paymentId no aparezca en dos snapshots.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_reservations_payment_id
  ON pending_reservations (payment_id)
  WHERE payment_id IS NOT NULL;

-- Índice parcial: el cron sólo escanea filas en `pending_payment`
-- antiguas, así que indexamos sólo eso.
CREATE INDEX IF NOT EXISTS idx_pending_reservations_pending_old
  ON pending_reservations (created_at)
  WHERE status = 'pending_payment';

CREATE INDEX IF NOT EXISTS idx_pending_reservations_email
  ON pending_reservations (email);

ALTER TABLE pending_reservations ENABLE ROW LEVEL SECURITY;

-- Sin políticas: solo Service Role Key (server-side) puede tocar la tabla.
-- Los clientes nunca leen ni escriben directamente.

COMMENT ON TABLE pending_reservations IS
  'Snapshot de datos de reserva antes de cobrar a Conekta. Permite recuperar pagos huérfanos vía webhook o reembolsarlos vía cron.';
COMMENT ON COLUMN pending_reservations.attempt_id IS
  'UUID generado en /api/conekta/create-order; viaja como idempotencyKey y metadata a Conekta.';
COMMENT ON COLUMN pending_reservations.payment_id IS
  'order.id de Conekta. Se setea tras crear la orden; NULL si Conekta falló.';
COMMENT ON COLUMN pending_reservations.payload IS
  'JSON con todos los campos necesarios para crear la reserva (nombre, teléfono, sessionType, beneficios, etc.)';
COMMENT ON COLUMN pending_reservations.status IS
  'pending_payment (recién creado) | refund_in_progress (cron tomó claim para reembolsar) | consumed (reserva creada) | refunded (huérfano reembolsado) | failed (Conekta nunca cobró)';

COMMIT;
