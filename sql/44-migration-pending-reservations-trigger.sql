-- =====================================================
-- 44 - Trigger automático de updated_at en pending_reservations
-- =====================================================
-- El código de la app actualiza `updated_at` manualmente en cada UPDATE,
-- pero un trigger lo garantiza incluso si una query directa (admin SQL,
-- migración, etc.) lo omite. Defensa en profundidad.
-- =====================================================

DROP TRIGGER IF EXISTS update_pending_reservations_updated_at
  ON pending_reservations;

CREATE TRIGGER update_pending_reservations_updated_at
  BEFORE UPDATE ON pending_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
