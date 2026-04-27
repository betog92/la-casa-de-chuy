-- =====================================================
-- MIGRACIÓN 32: solo Monedas Chuy son transferibles
-- =====================================================
-- Decisión de producto: los créditos (cancelaciones,
-- referidos, etc.) se quedan SIEMPRE con el cliente que
-- los ganó. Solo las Monedas Chuy (loyalty_points) se
-- pueden regalar al fotógrafo.
--
-- Esta migración elimina la columna `transferred_credits`
-- de `benefit_transfers` si quedó creada por la versión
-- anterior de la migración 31. Es idempotente: corre sin
-- problema aunque la columna nunca haya existido.
-- =====================================================

BEGIN;

ALTER TABLE benefit_transfers
  DROP COLUMN IF EXISTS transferred_credits;

COMMENT ON COLUMN benefit_transfers.transferred_points IS
  'Monedas Chuy (loyalty_points) transferidas al fotógrafo al materializarse la transferencia. 1 Moneda = $1 MXN.';

COMMIT;
