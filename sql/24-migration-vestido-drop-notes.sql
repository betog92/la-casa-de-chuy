-- MIGRATION: Quitar columna notes de vestido_calendar_notes (solo se usa título/descripción editable)

ALTER TABLE vestido_calendar_notes
  DROP COLUMN IF EXISTS notes;
