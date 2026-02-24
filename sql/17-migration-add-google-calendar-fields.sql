-- =====================================================
-- MIGRATION: Agregar campos de importación de Google Calendar
-- =====================================================
-- Descripción: Permite identificar reservas importadas desde Google Calendar
--              y evitar duplicados en sincronizaciones posteriores.
--
-- source:          'web' para reservas normales, 'google_import' para importadas.
-- google_event_id: ID único del evento en Google Calendar (para idempotencia).
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'google_import'));

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- Índice único parcial: solo aplica cuando google_event_id no es NULL
-- Garantiza que no se importe dos veces el mismo evento de Google
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_google_event_id
  ON reservations (google_event_id)
  WHERE google_event_id IS NOT NULL;

COMMENT ON COLUMN reservations.source IS 'Origen de la reserva: web (normal) o google_import (importada desde Google Calendar)';
COMMENT ON COLUMN reservations.google_event_id IS 'ID del evento en Google Calendar; usado para evitar duplicados en sincronizaciones';
