-- =====================================================
-- MIGRATION: Permitir source = 'admin' en reservations
-- =====================================================
-- Las reservas creadas desde "Nueva reserva" en el panel admin
-- usan source = 'admin'. source = 'web' queda para el flujo público (Conekta).
-- google_import queda solo para datos históricos importados.
-- =====================================================

-- Eliminar el CHECK actual (nombre por defecto en PostgreSQL para columnas)
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_source_check;

-- Añadir CHECK que incluye 'admin'
ALTER TABLE reservations
  ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('web', 'google_import', 'admin'));

COMMENT ON COLUMN reservations.source IS 'Origen: web (cliente en página), admin (creada en panel), google_import (importación histórica)';
