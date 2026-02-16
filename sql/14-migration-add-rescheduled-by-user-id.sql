-- =====================================================
-- MIGRATION: Agregar rescheduled_by_user_id a reservations
-- =====================================================
-- Descripción: Usuario admin que realizó el reagendamiento (si aplica).
--              NULL cuando el cliente reagendó por su cuenta.
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS rescheduled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN reservations.rescheduled_by_user_id IS 'Admin que realizó el reagendamiento; NULL si fue el cliente';
