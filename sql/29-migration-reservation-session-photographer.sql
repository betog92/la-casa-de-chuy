-- Tipo de sesión (web) y fotógrafo/estudio (opcional, editable solo por admin vía API admin)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS session_type TEXT
    CHECK (session_type IS NULL OR session_type IN ('xv_anos', 'boda', 'casual'));

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS photographer_studio TEXT;

COMMENT ON COLUMN reservations.session_type IS 'Tipo de sesión del cliente: xv_anos, boda, casual (NULL en reservas antiguas o manuales sin dato).';
COMMENT ON COLUMN reservations.photographer_studio IS 'Nombre del fotógrafo o estudio (opcional en web; editable por admin).';
