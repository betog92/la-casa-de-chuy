-- =====================================================
-- MIGRATION: código de tarjetero en citas manuales La Casa de Chuy
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS stamp_card_code TEXT;

COMMENT ON COLUMN reservations.stamp_card_code IS
  'Código del tarjetero físico (programa 8 visitas). Solo citas manuales La Casa de Chuy (source=admin, import_type null). El conteo de sellos se lleva en el tarjetero.';
