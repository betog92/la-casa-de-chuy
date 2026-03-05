-- MIGRATION: Notas editables por evento del calendario de renta de vestidos
-- Solo en nuestra BD; no modifica Google Calendar. Modal muestra "Editado por última vez por [nombre] el [fecha]"

CREATE TABLE IF NOT EXISTS vestido_calendar_notes (
  google_event_id TEXT PRIMARY KEY,
  notes TEXT,
  last_edited_at TIMESTAMP WITH TIME ZONE,
  last_edited_by_user_id UUID REFERENCES users(id)
);

COMMENT ON TABLE vestido_calendar_notes IS 'Notas por evento del calendario de vestidos (google_event_id). Solo lectura en Google; edición solo aquí.';
COMMENT ON COLUMN vestido_calendar_notes.notes IS 'Notas o texto libre editable para este evento de renta de vestido.';
COMMENT ON COLUMN vestido_calendar_notes.last_edited_at IS 'Última vez que se guardaron las notas.';
COMMENT ON COLUMN vestido_calendar_notes.last_edited_by_user_id IS 'Usuario admin que editó por última vez las notas.';
