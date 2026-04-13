-- FK de notas → eventos + ON DELETE CASCADE (un DELETE del evento borra la fila de notas).
-- Permite consulta embebida en GET /api/admin/google-calendar/vestidos y simplifica la API DELETE.

DELETE FROM vestido_calendar_notes v
WHERE NOT EXISTS (
  SELECT 1 FROM vestido_calendar_events e WHERE e.google_event_id = v.google_event_id
);

ALTER TABLE vestido_calendar_notes
  ADD CONSTRAINT vestido_calendar_notes_google_event_id_fkey
  FOREIGN KEY (google_event_id)
  REFERENCES vestido_calendar_events (google_event_id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT vestido_calendar_notes_google_event_id_fkey ON vestido_calendar_notes IS 'Al eliminar un evento de vestidos, se eliminan sus notas en la app.';
