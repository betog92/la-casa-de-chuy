-- MIGRATION: Tabla para guardar eventos del calendario de renta de vestidos (copia desde Google).
-- Se llena con el script sync-vestidos-calendar.mjs; la app consulta esta tabla en lugar de llamar a Google.

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
