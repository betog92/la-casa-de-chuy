-- =====================================================
-- MIGRACIÓN: ROL DE ADMINISTRADOR
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Agrega la columna is_admin a la tabla users para controlar
-- acceso al panel de administración.
-- =====================================================

-- Agregar columna is_admin si no existe
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Índice para consultas rápidas de admins
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- =====================================================
-- ASIGNAR ADMIN: Reemplaza el email con el tuyo
-- =====================================================
-- Ejecuta esto manualmente con tu email de administrador:
--
-- UPDATE users SET is_admin = TRUE WHERE email = 'tu-email@ejemplo.com';
--
-- O si el usuario aún no existe en public.users, créalo primero
-- registrándote en la app y luego ejecuta el UPDATE de arriba.
-- =====================================================

COMMENT ON COLUMN users.is_admin IS 'Indica si el usuario tiene permisos de administrador';
