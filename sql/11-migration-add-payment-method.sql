-- =====================================================
-- MIGRATION: Agregar payment_method a reservations
-- =====================================================
-- Fecha: 2025-02-XX
-- Descripción: Permite distinguir entre pagos en línea (conekta),
--              efectivo y transferencia para reservas manuales
-- =====================================================

-- Valores: 'conekta' (pago en línea), 'efectivo', 'transferencia'
-- NULL para reservas existentes (se infiere 'conekta' si payment_id está definido)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN reservations.payment_method IS 'Método de pago: conekta (en línea), efectivo, transferencia (reservas manuales)';
