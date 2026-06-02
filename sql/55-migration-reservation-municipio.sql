-- =====================================================
-- MIGRATION: municipio en citas Alvero (manual_client)
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS municipio TEXT;

COMMENT ON COLUMN reservations.municipio IS
  'Municipio del cliente en citas Alvero (import_type manual_client). Opcional. Solo uso interno admin.';
