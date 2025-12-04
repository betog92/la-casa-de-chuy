-- =====================================================
-- POBLAR SLOTS INICIALES - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Este script genera time_slots para los próximos 6 meses
-- =====================================================

-- Generar slots para los próximos 6 meses
SELECT generate_time_slots(
  CURRENT_DATE,
  (CURRENT_DATE + INTERVAL '6 months')::DATE
) AS slots_created;

-- Verificar cuántos slots se crearon
SELECT 
  COUNT(*) AS total_slots,
  COUNT(DISTINCT date) AS total_dates,
  MIN(date) AS first_date,
  MAX(date) AS last_date
FROM time_slots;