-- MIGRATION: Título/descripción editable por evento de vestido (ej. "3839 renta de vestido con cauda evento 24 abril")
-- Se guarda solo en nuestra BD; no modifica Google Calendar.

ALTER TABLE vestido_calendar_notes
  ADD COLUMN IF NOT EXISTS title_override TEXT;

COMMENT ON COLUMN vestido_calendar_notes.title_override IS 'Título o descripción editable del evento (por defecto el de Google). Solo en esta app.';
