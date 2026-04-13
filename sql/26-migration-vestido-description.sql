-- Descripción/notas de Google Calendar en vestido_calendar_events + override editable en notas.

ALTER TABLE vestido_calendar_events
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE vestido_calendar_notes
  ADD COLUMN IF NOT EXISTS description_override TEXT;

COMMENT ON COLUMN vestido_calendar_events.description IS 'Descripción/notas del evento en Google Calendar; llenada por scripts/sync-vestidos-calendar.mjs o POST admin.';
COMMENT ON COLUMN vestido_calendar_notes.description_override IS 'Sustituto opcional de la descripción en la app; no modifica Google Calendar.';
