-- =====================================================
-- ELIMINAR TODAS LAS TABLAS Y FUNCIONES - LA CASA DE CHUY EL RICO
-- =====================================================
-- ADVERTENCIA: Este script ELIMINA todas las tablas y funciones del proyecto.
-- Solo ejecuta esto si NO tienes datos importantes (o vas a empezar desde cero).
--
-- Los triggers se eliminan automáticamente al borrar las tablas.
--
-- Ejecuta en Supabase: SQL Editor > New Query > Pegar > Run
-- =====================================================

-- =====================================================
-- 1. ELIMINAR FUNCIONES
-- =====================================================

DROP FUNCTION IF EXISTS update_time_slot_reservations_count() CASCADE;
DROP FUNCTION IF EXISTS update_time_slot_occupied() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS generate_time_slots(DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS ensure_time_slots_for_date(DATE) CASCADE;
DROP FUNCTION IF EXISTS maintain_time_slots() CASCADE;
DROP FUNCTION IF EXISTS is_slot_available(DATE, TIME) CASCADE;
DROP FUNCTION IF EXISTS get_available_slots(DATE) CASCADE;
DROP FUNCTION IF EXISTS get_daily_occupancy(DATE) CASCADE;
DROP FUNCTION IF EXISTS get_reservations_stats(DATE) CASCADE;
DROP FUNCTION IF EXISTS get_month_availability(DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS increment_discount_code_uses(UUID) CASCADE;

-- =====================================================
-- 2. ELIMINAR TABLAS (orden por dependencias; CASCADE quita FKs)
-- =====================================================

DROP TABLE IF EXISTS discount_code_uses CASCADE;
DROP TABLE IF EXISTS discount_codes CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS loyalty_points CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS time_slots CASCADE;
DROP TABLE IF EXISTS availability CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 3. ELIMINAR ÍNDICES (por si quedan huérfanos)
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
DROP INDEX IF EXISTS idx_discount_code_uses_email;
DROP INDEX IF EXISTS idx_discount_code_uses_code_id;
DROP INDEX IF EXISTS idx_discount_codes_code;
DROP INDEX IF EXISTS idx_discount_codes_active;
DROP INDEX IF EXISTS idx_loyalty_points_reservation_id;
DROP INDEX IF EXISTS idx_credits_reservation_id;

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

