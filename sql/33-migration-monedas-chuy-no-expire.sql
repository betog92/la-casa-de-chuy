-- =====================================================
-- MIGRACIÓN 33: Monedas Chuy nunca caducan
-- =====================================================
-- Decisión de producto: las Monedas Chuy (loyalty_points)
-- ya no caducan. Acumulables para siempre. Esto simplifica
-- la conversación con clientes mayores y refuerza la
-- confianza en el programa de lealtad.
--
-- IMPORTANTE: los créditos (cancelaciones, referidos)
-- TAMPOCO se tocan en esta migración — su política de
-- caducidad sigue como estaba.
--
-- Cambios:
--   1. loyalty_points.expires_at deja de ser NOT NULL.
--      NULL = "no caduca nunca".
--   2. Todos los registros existentes pasan a NULL para
--      respetar la nueva política con clientes actuales
--      (no queremos quitarles Monedas que ya tenían).
-- =====================================================

BEGIN;

-- 1. Quitar el NOT NULL para permitir NULL = "no caduca"
ALTER TABLE loyalty_points
  ALTER COLUMN expires_at DROP NOT NULL;

-- 2. Limpiar las fechas de caducidad existentes
--    (todos los puntos vivos pasan a "perpetuos")
UPDATE loyalty_points
SET expires_at = NULL
WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN loyalty_points.expires_at IS
  'Fecha de caducidad de las Monedas Chuy. NULL = nunca caducan (política vigente desde abril 2026). Histórico: antes caducaban a 1 año.';

COMMIT;
