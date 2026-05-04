-- =====================================================
-- MIGRACIÓN 34: earmark de Monedas Chuy al crear pending transfer
-- =====================================================
-- A partir de esta migración, cuando un cliente programa una
-- transferencia de Monedas Chuy a su fotógrafo (status='pending'),
-- las filas correspondientes en loyalty_points se marcan como
-- revoked=true ATÓMICAMENTE para que el cliente no pueda gastarlas
-- en otra reserva mientras espera la fecha de la sesión.
--
-- Si el cliente cancela el pending (DELETE en el panel) las filas
-- se restauran (revoked=false). Si la reserva se cancela, las
-- Monedas se quedan revocadas (igual que cualquier cancelación).
--
-- Para poder restaurar exactamente las filas reservadas (y NO
-- otras que pudieran haberse revocado por otros motivos),
-- guardamos sus IDs en benefit_transfers.revoked_loyalty_point_ids.
-- =====================================================

BEGIN;

ALTER TABLE benefit_transfers
  ADD COLUMN IF NOT EXISTS revoked_loyalty_point_ids UUID[]
    NOT NULL DEFAULT '{}';

COMMENT ON COLUMN benefit_transfers.revoked_loyalty_point_ids IS
  'IDs de loyalty_points revocadas al crear el pending. Se restauran al cancelar la transferencia (DELETE).';

COMMIT;
