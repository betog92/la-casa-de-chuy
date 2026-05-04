-- =====================================================
-- MIGRACIÓN 31: tabla benefit_transfers
-- =====================================================
-- Registra el "intento" de un cliente de transferir las
-- Monedas Chuy (loyalty_points) generadas por una reserva
-- al fotógrafo/estudio que lo trajo. La transferencia se
-- materializa después de que pasa la fecha de la sesión
-- (cron job) para evitar conflictos con cancelaciones y
-- reagendamientos.
--
-- IMPORTANTE: solo se transfieren Monedas Chuy (puntos de
-- lealtad). Los créditos se quedan SIEMPRE con el cliente.
--
-- Estados:
--   pending        – creada por el cliente, fecha de sesión aún no pasa
--   cancelled      – el cliente la canceló antes de materializar
--   auto_credited  – materializada y acreditada (el fotógrafo ya tenía cuenta)
--   pending_claim  – materializada con magic link enviado (sin cuenta)
--   claimed        – el fotógrafo reclamó el magic link
--   reverted       – la reserva se canceló o las Monedas caducaron sin reclamo
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS benefit_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reserva origen (1 transferencia por reserva)
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,

  -- Cliente que origina la transferencia
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_email TEXT NOT NULL,

  -- Destinatario (fotógrafo o estudio)
  to_email TEXT NOT NULL,                                 -- normalizado a lowercase por la app
  to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- se llena al materializar
  to_studio_name TEXT,                                    -- opcional, lo escribe el cliente

  -- Magic link para reclamo (solo si el fotógrafo no tenía cuenta al materializar)
  claim_token UUID UNIQUE,
  claim_token_sent_at TIMESTAMP WITH TIME ZONE,

  -- Estado de la transferencia
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'cancelled',
      'auto_credited',
      'pending_claim',
      'claimed',
      'reverted'
    )),

  -- Snapshot de lo transferido (calculado al materializar)
  transferred_points INTEGER DEFAULT 0,

  -- IDs de loyalty_points revocados al crear el pending (para
  -- restaurarlos exactamente si el cliente cancela la transferencia).
  -- Vacío hasta que el flujo de pre-revoke los guarda.
  revoked_loyalty_point_ids UUID[] NOT NULL DEFAULT '{}',

  -- Timestamps de cada transición
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  materialized_at TIMESTAMP WITH TIME ZONE,
  claimed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  reverted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE benefit_transfers IS
  'Transferencias de Monedas Chuy (loyalty_points) del cliente al fotógrafo. Solo puntos: los créditos se quedan con el cliente. Se materializa al pasar la fecha de la sesión.';
COMMENT ON COLUMN benefit_transfers.status IS
  'pending | cancelled | auto_credited | pending_claim | claimed | reverted';
COMMENT ON COLUMN benefit_transfers.claim_token IS
  'UUID público usado en el magic link /fotografos/reclamar/[token]. NULL si se acreditó automáticamente.';
COMMENT ON COLUMN benefit_transfers.revoked_loyalty_point_ids IS
  'IDs de loyalty_points revocadas al crear el pending. Se restauran al cancelar la transferencia (DELETE).';

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_benefit_transfers_reservation_id
  ON benefit_transfers(reservation_id);

CREATE INDEX IF NOT EXISTS idx_benefit_transfers_from_user_id
  ON benefit_transfers(from_user_id);

CREATE INDEX IF NOT EXISTS idx_benefit_transfers_to_user_id
  ON benefit_transfers(to_user_id)
  WHERE to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_benefit_transfers_to_email
  ON benefit_transfers(to_email);

CREATE INDEX IF NOT EXISTS idx_benefit_transfers_status
  ON benefit_transfers(status);

-- Garantiza que solo exista una transferencia 'pending' por reserva
-- (para evitar duplicados accidentales si el cliente envía dos veces).
CREATE UNIQUE INDEX IF NOT EXISTS idx_benefit_transfers_unique_pending
  ON benefit_transfers(reservation_id)
  WHERE status = 'pending';

-- Índice del magic link para reclamo rápido
CREATE INDEX IF NOT EXISTS idx_benefit_transfers_claim_token
  ON benefit_transfers(claim_token)
  WHERE claim_token IS NOT NULL;

-- =====================================================
-- TRIGGER updated_at NO APLICA: usamos timestamps específicos por estado
-- =====================================================

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE benefit_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own outgoing transfers" ON benefit_transfers;
DROP POLICY IF EXISTS "Photographers can view incoming transfers" ON benefit_transfers;

-- El cliente que originó la transferencia puede verla
CREATE POLICY "Users can view own outgoing transfers"
  ON benefit_transfers FOR SELECT
  USING (
    from_user_id IS NOT NULL AND (select auth.uid()) = from_user_id
  );

-- El fotógrafo destinatario puede verla una vez vinculada
CREATE POLICY "Photographers can view incoming transfers"
  ON benefit_transfers FOR SELECT
  USING (
    to_user_id IS NOT NULL AND (select auth.uid()) = to_user_id
  );

-- Las APIs de admin y server-side usan Service Role Key (bypassan RLS),
-- así que NO se definen políticas de INSERT/UPDATE/DELETE: solo el
-- backend puede crear/modificar transferencias.

COMMIT;
