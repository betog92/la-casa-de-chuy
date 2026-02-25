-- =====================================================
-- MIGRATION: order_number e import_notes para citas importadas
-- =====================================================
-- order_number: número de orden/folio (ej. 3972) en eventos Alberto.
-- import_notes: texto extraído después del teléfono en la descripción (vestido, sesión, ampliaciones, etc.).
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS order_number TEXT;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS import_notes TEXT;

COMMENT ON COLUMN reservations.order_number IS 'Número de orden/folio (ej. 3972) en citas Alberto importadas. Se muestra como Orden (web anterior).';
COMMENT ON COLUMN reservations.import_notes IS 'Notas adicionales de la importación (vestido, sesión, ampliaciones, etc.).';
