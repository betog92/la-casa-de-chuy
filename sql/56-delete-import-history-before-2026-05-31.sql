-- Limpieza historial importado (antes del 31 mayo 2026)
-- Conserva solo manual_client (Alvero con cliente).
-- Ejecutado en prod 2026-06-03 via scripts/cleanup-import-history-before-2026-05-31.mjs

DELETE FROM reservations
WHERE source = 'google_import'
  AND date < '2026-05-31'
  AND (import_type IS DISTINCT FROM 'manual_client');
