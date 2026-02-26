-- MIGRATION: Quién y cuándo editó por última vez los detalles de la cita (import_notes)
-- Para mostrar "Editado por última vez por [nombre] el [fecha]" en reservaciones de Alberto

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS import_notes_edited_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS import_notes_edited_by_user_id UUID REFERENCES users(id);

COMMENT ON COLUMN reservations.import_notes_edited_at IS 'Última vez que se guardaron los detalles de la cita (import_notes).';
COMMENT ON COLUMN reservations.import_notes_edited_by_user_id IS 'Usuario admin que editó por última vez los detalles de la cita.';
