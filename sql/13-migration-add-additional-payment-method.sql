-- =====================================================
-- MIGRATION: Agregar additional_payment_method a reservations
-- =====================================================
-- Descripción: Cómo se cobró el pago adicional por reagendamiento:
--              'conekta' (en línea), 'efectivo', 'transferencia', 'pendiente'
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS additional_payment_method TEXT;

COMMENT ON COLUMN reservations.additional_payment_method IS 'Método del pago adicional por reagendamiento: conekta, efectivo, transferencia, pendiente';
