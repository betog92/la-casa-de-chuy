-- =====================================================
-- MIGRATION: Agregar campo import_type a reservations
-- =====================================================
-- Permite distinguir el subtipo de cita importada:
--   'appointly'        → cliente real de Appointly (web anterior)
--   'manual_client'    → sesión de Alberto con cliente confirmado (Google Calendar)
--   'manual_available' → espacio disponible para Alberto (slots de Nancy)
--
-- Solo aplica cuando source = 'google_import'.
-- Las reservas reales de la nueva web tienen import_type = NULL.
--
-- NOTA: Si se ejecuta 01-schema.sql desde cero, este migration NO es necesario.
-- =====================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS import_type TEXT;

COMMENT ON COLUMN reservations.import_type IS
  'Subtipo de importación: appointly | manual_client | manual_available. NULL para reservas reales.';
