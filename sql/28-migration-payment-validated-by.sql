-- =====================================================
-- MIGRATION: Quién y cuándo validó el pago (para mostrar en detalle)
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS payment_validated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payment_validated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN reservations.payment_validated_at IS 'Fecha y hora en que la super admin validó el pago (marcó como pagado).';
COMMENT ON COLUMN reservations.payment_validated_by_user_id IS 'Usuario (super admin) que validó el pago.';
