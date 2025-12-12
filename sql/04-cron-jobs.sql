-- =====================================================
-- CRON JOBS PARA MANTENIMIENTO AUTOMÁTICO
-- =====================================================
-- Este archivo contiene:
-- 1. Extensión pg_cron (debe estar habilitada en Supabase)
-- 2. Función wrapper para ejecutar maintain_time_slots() solo a medianoche en Monterrey
-- 3. Cron job programado para ejecutarse solo en el rango de horas UTC que corresponde a medianoche en Monterrey
-- =====================================================

-- Habilitar extensión pg_cron (si no está habilitada)
-- Nota: En Supabase, esto debe habilitarse desde el dashboard
-- Ve a: Database > Extensions > Enable "pg_cron"

-- =====================================================
-- FUNCIÓN WRAPPER PARA EJECUTAR SOLO A MEDIANOCHE EN MONTERREY
-- =====================================================
-- Esta función verifica si es medianoche (00:00) en Monterrey
-- antes de ejecutar maintain_time_slots()
-- =====================================================

CREATE OR REPLACE FUNCTION maintain_time_slots_at_midnight_monterrey()
RETURNS VOID AS $$
DECLARE
  current_time_monterrey TIME;
BEGIN
  -- Obtener hora actual en zona horaria de Monterrey
  current_time_monterrey := get_current_time_monterrey();
  
  -- Solo ejecutar si es entre las 00:00 y 00:59 en Monterrey
  -- Esto asegura que se ejecute una sola vez al día, sin importar
  -- cuántas veces se llame el cron en el rango de horas UTC
  IF current_time_monterrey >= '00:00:00'::TIME 
     AND current_time_monterrey < '01:00:00'::TIME THEN
    PERFORM maintain_time_slots();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Configurar search_path para seguridad
ALTER FUNCTION maintain_time_slots_at_midnight_monterrey() SET search_path = public;

-- =====================================================
-- CRON JOB OPTIMIZADO: Ejecutar solo en el rango UTC relevante
-- =====================================================
-- Monterrey está en UTC-6 (invierno) o UTC-5 (verano)
-- Medianoche en Monterrey = 06:00 UTC (invierno) o 05:00 UTC (verano)
-- Ejecutamos el cron cada hora entre 05:00-07:00 UTC para cubrir ambos casos
-- Esto resulta en solo 3 ejecuciones al día en lugar de 24
-- =====================================================

-- Eliminar el cron job si ya existe (para evitar duplicados)
SELECT cron.unschedule('maintain-time-slots-daily') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'maintain-time-slots-daily'
);

-- Programar el cron job para ejecutarse a las 05:00, 06:00 y 07:00 UTC
-- (cubre tanto horario de verano como invierno en Monterrey)
-- La función wrapper se encarga de ejecutar solo cuando es medianoche en Monterrey
SELECT cron.schedule(
  'maintain-time-slots-daily',              -- Nombre del job
  '0 5-7 * * *',                            -- Cada hora entre las 05:00-07:00 UTC (3 ejecuciones/día)
  $$SELECT maintain_time_slots_at_midnight_monterrey();$$  -- SQL a ejecutar
);

-- =====================================================
-- VERIFICACIÓN: Ver los cron jobs programados
-- =====================================================
-- Para verificar que el cron job se creó correctamente, ejecuta:
-- 
-- SELECT * FROM cron.job WHERE jobname = 'maintain-time-slots-daily';
-- 
-- Para ver el historial de ejecuciones:
-- 
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'maintain-time-slots-daily')
-- ORDER BY start_time DESC 
-- LIMIT 10;
-- =====================================================

