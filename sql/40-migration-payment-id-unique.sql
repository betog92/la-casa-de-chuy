-- =====================================================
-- MIGRATION: índices únicos sobre payment_id y additional_payment_id
-- =====================================================
-- Endurece el flujo de pagos: una orden de Conekta sólo puede vincularse
-- a UNA reserva (ya sea como pago inicial o como pago adicional de
-- reagendamiento). Esto cierra una condición TOCTOU al verificar el
-- paymentId en `/api/reservations/create` y `.../reschedule/complete`:
-- si dos requests concurrentes intentan usar el mismo paymentId, sólo
-- el primero gana y el segundo cae con error de unicidad (23505).
--
-- Se usan índices PARCIALES (WHERE ... IS NOT NULL) porque la mayoría
-- de las reservas administrativas no tienen payment_id.
-- =====================================================

-- 1. payment_id único cuando no es NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reservations_payment_id
  ON reservations (payment_id)
  WHERE payment_id IS NOT NULL;

-- 2. additional_payment_id único cuando no es NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reservations_additional_payment_id
  ON reservations (additional_payment_id)
  WHERE additional_payment_id IS NOT NULL;
