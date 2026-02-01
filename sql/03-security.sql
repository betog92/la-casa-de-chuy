-- =====================================================
-- SEGURIDAD Y PERMISOS - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Este archivo contiene:
-- 1. Row Level Security (RLS) en todas las tablas
-- 2. Políticas de acceso para cada tabla
-- =====================================================

-- =====================================================
-- 1. HABILITAR RLS EN TODAS LAS TABLAS
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_code_uses ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. ELIMINAR POLÍTICAS EXISTENTES (si las hay)
-- =====================================================
-- Esto evita conflictos si ejecutas el script múltiples veces

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Anyone can create reservations" ON reservations;
DROP POLICY IF EXISTS "Users can view own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can update own reservations" ON reservations;
DROP POLICY IF EXISTS "Anyone can view availability" ON availability;
DROP POLICY IF EXISTS "Anyone can modify availability" ON availability;
DROP POLICY IF EXISTS "Anyone can insert availability" ON availability;
DROP POLICY IF EXISTS "Anyone can update availability" ON availability;
DROP POLICY IF EXISTS "Anyone can delete availability" ON availability;
DROP POLICY IF EXISTS "Anyone can view time slots" ON time_slots;
DROP POLICY IF EXISTS "Anyone can modify time slots" ON time_slots;
DROP POLICY IF EXISTS "Anyone can insert time slots" ON time_slots;
DROP POLICY IF EXISTS "Anyone can update time slots" ON time_slots;
DROP POLICY IF EXISTS "Anyone can delete time slots" ON time_slots;
DROP POLICY IF EXISTS "Users can view own credits" ON credits;
DROP POLICY IF EXISTS "Users can view own loyalty points" ON loyalty_points;
DROP POLICY IF EXISTS "Users can view own referrals" ON referrals;

-- =====================================================
-- 3. POLÍTICAS RLS PARA USERS
-- =====================================================

-- Los usuarios pueden ver y editar solo su propio perfil
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING ((select auth.uid()) = id);

-- =====================================================
-- 4. POLÍTICAS RLS PARA RESERVATIONS
-- =====================================================

-- IMPORTANTE: Las reservas SOLO se crean a través de API routes del servidor
-- (que usan Service Role Key y bypassan RLS completamente)
-- Por seguridad, NO permitimos INSERT directo desde el cliente
-- Para crear reservas, usa: POST /api/reservations/create
--
-- NOTA: No hay política de INSERT porque queremos forzar que todas las reservas
-- pasen por nuestras API routes donde se validan datos, disponibilidad, y pago.

-- Los usuarios pueden ver sus propias reservas
-- IMPORTANTE: Esta política solo aplica para usuarios autenticados (user_id IS NOT NULL).
-- Las reservas de invitados (user_id IS NULL) no pueden accederse a través de RLS porque
-- los invitados no tienen autenticación de Supabase. En su lugar, los invitados acceden
-- a sus reservas usando tokens JWT a través del endpoint /api/guest-reservations/[token],
-- que usa Service Role Key y bypassa RLS completamente.
-- Cuando un invitado se registra y verifica su email, todas sus reservas se vinculan
-- automáticamente con user_id a través de syncUserToDatabase(), permitiéndoles entonces
-- acceder a través de esta política RLS.
CREATE POLICY "Users can view own reservations"
  ON reservations FOR SELECT
  USING (user_id IS NOT NULL AND (select auth.uid()) = user_id);

-- Los usuarios pueden actualizar sus propias reservas
-- (Útil para futuras funcionalidades como cancelar/reagendar desde el cliente)
CREATE POLICY "Users can update own reservations"
  ON reservations FOR UPDATE
  USING (user_id IS NOT NULL AND (select auth.uid()) = user_id);

-- =====================================================
-- 5. POLÍTICAS RLS PARA AVAILABILITY
-- =====================================================

-- Cualquiera puede ver la disponibilidad (necesario para el calendario)
CREATE POLICY "Anyone can view availability"
  ON availability FOR SELECT
  USING (true);

-- Solo admins pueden modificar disponibilidad (por ahora, permitir todo)
-- TODO: Restringir esto cuando tengas autenticación de admin
-- Políticas separadas para evitar duplicación con SELECT
CREATE POLICY "Anyone can insert availability"
  ON availability FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update availability"
  ON availability FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete availability"
  ON availability FOR DELETE
  USING (true);

-- =====================================================
-- 6. POLÍTICAS RLS PARA TIME_SLOTS
-- =====================================================

-- Cualquiera puede ver los slots (necesario para el calendario)
CREATE POLICY "Anyone can view time slots"
  ON time_slots FOR SELECT
  USING (true);

-- Solo admins pueden modificar slots (por ahora, permitir todo)
-- TODO: Restringir esto cuando tengas autenticación de admin
-- Políticas separadas para evitar duplicación con SELECT
CREATE POLICY "Anyone can insert time slots"
  ON time_slots FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update time slots"
  ON time_slots FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete time slots"
  ON time_slots FOR DELETE
  USING (true);

-- =====================================================
-- 7. POLÍTICAS RLS PARA CREDITS
-- =====================================================

-- Los usuarios pueden ver sus propios créditos
CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  USING (user_id IS NOT NULL AND (select auth.uid()) = user_id);

-- =====================================================
-- 8. POLÍTICAS RLS PARA LOYALTY_POINTS
-- =====================================================

-- Los usuarios pueden ver sus propios puntos
CREATE POLICY "Users can view own loyalty points"
  ON loyalty_points FOR SELECT
  USING (user_id IS NOT NULL AND (select auth.uid()) = user_id);

-- =====================================================
-- 9. POLÍTICAS RLS PARA REFERRALS
-- =====================================================

-- Los usuarios pueden ver sus propios referidos
CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (referrer_id IS NOT NULL AND (select auth.uid()) = referrer_id);

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 
-- Las políticas RLS actuales son básicas y permiten:
-- - Las reservas SOLO se crean a través de API routes del servidor (que usan Service Role Key)
-- - Cualquiera puede ver disponibilidad y slots (necesario para calendario)
-- - Los usuarios autenticados pueden ver/editar sus propias reservas
--
-- IMPORTANTE: Cuando implementes el panel de admin, deberás:
-- 1. Crear un rol de admin
-- 2. Agregar políticas que permitan a los admins ver/editar todo
-- 3. Restringir las políticas de availability y time_slots para que solo admins puedan modificarlas
--
-- Por ahora, estas políticas permiten que el sistema funcione mientras desarrollas.

