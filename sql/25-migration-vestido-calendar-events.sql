-- MIGRATION: Calendario de renta de vestidos (tablas en estado final).
-- vestido_calendar_notes: títulos editados en la app (modal). vestido_calendar_events: copia desde Google (script sync).
-- Para nueva BD desde cero usa 01-schema.sql; este archivo sirve para añadir a una BD existente.

CREATE TABLE IF NOT EXISTS vestido_calendar_notes (
  google_event_id TEXT PRIMARY KEY,
  title_override TEXT,
  last_edited_at TIMESTAMP WITH TIME ZONE,
  last_edited_by_user_id UUID REFERENCES users(id)
);
COMMENT ON TABLE vestido_calendar_notes IS 'Títulos editados por evento del calendario de vestidos. Solo en esta app.';

CREATE TABLE IF NOT EXISTS vestido_calendar_events (
  google_event_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  original_start TEXT NOT NULL,
  original_end TEXT NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE vestido_calendar_events IS 'Copia de eventos del calendario de renta de vestidos (Google). Sincronizada por scripts/sync-vestidos-calendar.mjs.';
COMMENT ON COLUMN vestido_calendar_events.synced_at IS 'Última vez que se actualizó este evento desde Google.';

CREATE INDEX IF NOT EXISTS idx_vestido_calendar_events_date ON vestido_calendar_events(date);
