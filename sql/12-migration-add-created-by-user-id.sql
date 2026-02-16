-- =====================================================
-- MIGRATION: Agregar created_by_user_id a reservations
-- =====================================================
-- Descripción: Guarda qué admin creó la reserva (reservas manuales).
--              NULL para reservas hechas en línea por el cliente.
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN reservations.created_by_user_id IS 'Usuario admin que creó la reserva (solo reservas manuales); NULL si fue en línea';
