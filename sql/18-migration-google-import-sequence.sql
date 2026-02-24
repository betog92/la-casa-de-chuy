-- =====================================================
-- MIGRATION: Secuencia separada para reservas importadas de Google Calendar
-- =====================================================
-- Las reservas importadas de la web anterior usan IDs desde 10001,
-- separándolas claramente de las reservas reales del sistema (1-9999).
--
-- NOTA: Si se ejecuta 01-schema.sql desde cero, este migration NO es necesario
-- ya que la secuencia y las funciones están incluidas ahí.
-- Este archivo es solo para bases de datos existentes que necesiten la migración.
-- =====================================================

-- 1. Borrar las reservas importadas de Google que ya existen
DELETE FROM reservations WHERE source = 'google_import';

-- 2. Crear secuencia exclusiva para importaciones (o ajustar si ya existe)
CREATE SEQUENCE IF NOT EXISTS reservations_google_import_id_seq
  START WITH 10001
  INCREMENT BY 1
  MINVALUE 10001
  NO MAXVALUE;

-- Si la secuencia ya existía con MINVALUE 100000, corregirla:
ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;

-- 3. Función RPC para obtener el siguiente ID de importación
CREATE OR REPLACE FUNCTION next_google_import_id() RETURNS INTEGER AS $$
  SELECT nextval('reservations_google_import_id_seq')::INTEGER;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 4. Función RPC para resetear la secuencia (usada al reimportar desde cero)
--    SECURITY DEFINER permite que se ejecute con permisos del creador (superusuario)
CREATE OR REPLACE FUNCTION reset_google_import_seq() RETURNS VOID AS $$
BEGIN
  ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Agregar columnas de importación si no existen
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'google_import'));

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS import_type TEXT;

-- 6. Índice único para google_event_id (idempotencia en reimports)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_google_event_id
  ON reservations (google_event_id)
  WHERE google_event_id IS NOT NULL;

-- 7. Índice para filtrar importadas vs reales rápidamente
CREATE INDEX IF NOT EXISTS idx_reservations_source
  ON reservations (source)
  WHERE source = 'google_import';
