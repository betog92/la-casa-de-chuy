-- =====================================================
-- CORRECCIÓN DE SEGURIDAD - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Este script corrige:
-- 1. Habilita RLS (Row Level Security) en todas las tablas
-- 2. Configura search_path en todas las funciones
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

-- =====================================================
-- 2. POLÍTICAS RLS BÁSICAS
-- =====================================================

-- POLÍTICAS PARA USERS
-- Los usuarios pueden ver y editar solo su propio perfil
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- POLÍTICAS PARA RESERVATIONS
-- Cualquiera puede crear reservas (reservas como invitado)
CREATE POLICY "Anyone can create reservations"
  ON reservations FOR INSERT
  WITH CHECK (true);

-- Los usuarios pueden ver sus propias reservas (por email o user_id)
CREATE POLICY "Users can view own reservations"
  ON reservations FOR SELECT
  USING (
    (user_id IS NOT NULL AND auth.uid() = user_id)
    OR (email IS NOT NULL AND email = (SELECT email FROM users WHERE id = auth.uid() LIMIT 1))
  );

-- Los usuarios pueden actualizar sus propias reservas
CREATE POLICY "Users can update own reservations"
  ON reservations FOR UPDATE
  USING (
    (user_id IS NOT NULL AND auth.uid() = user_id)
    OR (email IS NOT NULL AND email = (SELECT email FROM users WHERE id = auth.uid() LIMIT 1))
  );

-- POLÍTICAS PARA AVAILABILITY
-- Cualquiera puede ver la disponibilidad (necesario para el calendario)
CREATE POLICY "Anyone can view availability"
  ON availability FOR SELECT
  USING (true);

-- Solo admins pueden modificar disponibilidad (por ahora, permitir todo)
-- TODO: Restringir esto cuando tengas autenticación de admin
CREATE POLICY "Anyone can modify availability"
  ON availability FOR ALL
  USING (true);

-- POLÍTICAS PARA TIME_SLOTS
-- Cualquiera puede ver los slots (necesario para el calendario)
CREATE POLICY "Anyone can view time slots"
  ON time_slots FOR SELECT
  USING (true);

-- Solo admins pueden modificar slots (por ahora, permitir todo)
-- TODO: Restringir esto cuando tengas autenticación de admin
CREATE POLICY "Anyone can modify time slots"
  ON time_slots FOR ALL
  USING (true);

-- POLÍTICAS PARA CREDITS
-- Los usuarios pueden ver sus propios créditos
CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- POLÍTICAS PARA LOYALTY_POINTS
-- Los usuarios pueden ver sus propios puntos
CREATE POLICY "Users can view own loyalty points"
  ON loyalty_points FOR SELECT
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- POLÍTICAS PARA REFERRALS
-- Los usuarios pueden ver sus propios referidos
CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (referrer_id IS NOT NULL AND auth.uid() = referrer_id);

-- =====================================================
-- 3. CONFIGURAR SEARCH_PATH EN FUNCIONES
-- =====================================================

-- Función update_updated_at_column
ALTER FUNCTION update_updated_at_column()
SET search_path = public;

-- Función update_time_slot_reservations_count
ALTER FUNCTION update_time_slot_reservations_count()
SET search_path = public;

-- Función is_slot_available
ALTER FUNCTION is_slot_available(DATE, TIME)
SET search_path = public;

-- Función get_available_slots
ALTER FUNCTION get_available_slots(DATE)
SET search_path = public;

-- Función get_daily_occupancy
ALTER FUNCTION get_daily_occupancy(DATE)
SET search_path = public;

-- Función get_reservations_stats
ALTER FUNCTION get_reservations_stats(DATE)
SET search_path = public;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 
-- Las políticas RLS actuales son básicas y permiten:
-- - Cualquiera puede crear reservas (reservas como invitado)
-- - Cualquiera puede ver disponibilidad y slots (necesario para calendario)
-- - Los usuarios autenticados pueden ver/editar sus propias reservas
--
-- IMPORTANTE: Cuando implementes el panel de admin, deberás:
-- 1. Crear un rol de admin
-- 2. Agregar políticas que permitan a los admins ver/editar todo
-- 3. Restringir las políticas de availability y time_slots para que solo admins puedan modificarlas
--
-- Por ahora, estas políticas permiten que el sistema funcione mientras desarrollas.

