-- =====================================================
-- MIGRATION: Agregar cancelled_by_user_id a reservations
-- =====================================================
-- Descripción: Usuario admin que realizó la cancelación (si aplica).
--              NULL cuando el cliente canceló por su cuenta.
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN reservations.cancelled_by_user_id IS 'Admin que realizó la cancelación; NULL si fue el cliente';
