-- =====================================================
-- ELIMINAR TODAS LAS TABLAS Y FUNCIONES - LA CASA DE CHUY EL RICO
-- =====================================================
-- ⚠️ ADVERTENCIA: Este script ELIMINA TODAS las tablas y funciones
-- Solo ejecuta esto si NO tienes datos importantes en producción
-- 
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
-- =====================================================

-- =====================================================
-- 1. ELIMINAR TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS update_time_slot_count_on_reservation ON reservations;
DROP TRIGGER IF EXISTS update_time_slot_occupied_on_reservation ON reservations;
DROP TRIGGER IF EXISTS update_reservations_updated_at ON reservations;
DROP TRIGGER IF EXISTS update_availability_updated_at ON availability;
DROP TRIGGER IF EXISTS update_time_slots_updated_at ON time_slots;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- =====================================================
-- 2. ELIMINAR FUNCIONES
-- =====================================================

DROP FUNCTION IF EXISTS update_time_slot_reservations_count();
DROP FUNCTION IF EXISTS update_time_slot_occupied();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS generate_time_slots(DATE, DATE);
DROP FUNCTION IF EXISTS ensure_time_slots_for_date(DATE);
DROP FUNCTION IF EXISTS maintain_time_slots();
DROP FUNCTION IF EXISTS is_slot_available(DATE, TIME);
DROP FUNCTION IF EXISTS get_available_slots(DATE);
DROP FUNCTION IF EXISTS get_daily_occupancy(DATE);
DROP FUNCTION IF EXISTS get_reservations_stats(DATE);
DROP FUNCTION IF EXISTS get_month_availability(DATE, DATE);

-- =====================================================
-- 3. ELIMINAR TABLAS (en orden correcto por dependencias)
-- =====================================================

-- Eliminar tablas que tienen foreign keys primero
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS loyalty_points CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS time_slots CASCADE;
DROP TABLE IF EXISTS availability CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 4. ELIMINAR ÍNDICES (por si acaso quedan)
-- =====================================================

-- Los índices se eliminan automáticamente con las tablas,
-- pero los incluimos por si hay índices huérfanos

DROP INDEX IF EXISTS idx_reservations_date_status;
DROP INDEX IF EXISTS idx_time_slots_date_available;
DROP INDEX IF EXISTS idx_reservations_date_time_status;
DROP INDEX IF EXISTS idx_reservations_date;
DROP INDEX IF EXISTS idx_reservations_user_id;
DROP INDEX IF EXISTS idx_reservations_email;
DROP INDEX IF EXISTS idx_reservations_status;
DROP INDEX IF EXISTS idx_time_slots_date;
DROP INDEX IF EXISTS idx_availability_date;
DROP INDEX IF EXISTS idx_credits_user_id;
DROP INDEX IF EXISTS idx_loyalty_points_user_id;
DROP INDEX IF EXISTS idx_referrals_referrer_id;
DROP INDEX IF EXISTS idx_referrals_code;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- Después de ejecutar, verifica que todas las tablas fueron eliminadas:
--
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
--   AND table_type = 'BASE TABLE';
--
-- No debería mostrar ninguna tabla relacionada con el proyecto

