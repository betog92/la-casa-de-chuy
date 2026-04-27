-- =====================================================
-- MIGRACIÓN 30: campos de fotógrafo/estudio en users
-- =====================================================
-- Marca a usuarios que actúan como fotógrafos/estudios y
-- guarda el nombre del estudio. Habilita reportes de
-- "Top fotógrafos" y consolida puntos/créditos transferidos.
-- =====================================================

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_photographer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS studio_name TEXT;

COMMENT ON COLUMN users.is_photographer IS
  'TRUE si el usuario es fotógrafo o estudio. Habilita dashboard de fotógrafo y vista admin de "Fotógrafos".';
COMMENT ON COLUMN users.studio_name IS
  'Nombre del estudio o fotógrafo (texto libre). Usado en listados y al transferir beneficios.';

-- Índice parcial para listados rápidos en admin
CREATE INDEX IF NOT EXISTS idx_users_is_photographer
  ON users(is_photographer)
  WHERE is_photographer = TRUE;

COMMIT;
