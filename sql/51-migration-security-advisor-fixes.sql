-- =====================================================
-- MIGRACIÓN 51: correcciones Security Advisor (Supabase)
-- =====================================================
-- Para BD ya en producción. Instalaciones nuevas: ver 03-security.sql y migraciones base.
-- Ejecutar en el SQL Editor de Supabase (staging primero).
--
-- Cubre:
-- 1. RLS en tablas solo accedidas por service role (API routes / scripts)
-- 2. Políticas SELECT duplicadas en benefit_transfers
-- 3. REVOKE EXECUTE en funciones SECURITY DEFINER internas (desde PUBLIC)
--    Nota: en Supabase también hay que revocar anon/authenticated → ver 52.
-- 4. search_path fijo en funciones de importación Google
--
-- NO cubre (Dashboard):
-- - Auth > Leaked password protection
-- - Storage > bucket gallery > desactivar listado público
--
-- Checklist post-ejecución:
-- - Crear cuenta nueva → debe asignarse referral_code (trigger)
-- - GET /api/referrals/me con sesión → devuelve código
-- - Admin galería: subir y reordenar imágenes
-- - Cron maintain-time-slots-daily (o SELECT maintain_time_slots_at_midnight_monterrey() en hora Monterrey 00:xx)
-- - Security Advisor: 0 CRITICAL en las 3 tablas
-- =====================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. RLS en tablas solo accedidas por service role
-- ------------------------------------------------------------
-- Sin políticas = anon/authenticated bloqueados; service_role bypassa RLS.
-- Acceso verificado en código: todas las rutas usan createServiceRoleClient()
-- o SUPABASE_SERVICE_ROLE_KEY (scripts/sync-vestidos-calendar.mjs).

ALTER TABLE public.reservation_reschedule_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vestido_calendar_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vestido_calendar_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. benefit_transfers: una sola política SELECT
-- ------------------------------------------------------------
-- Equivalente lógico a las dos políticas anteriores (OR).
-- La app no lee esta tabla desde el cliente; solo APIs con service role.

DROP POLICY IF EXISTS "Users can view own outgoing transfers" ON public.benefit_transfers;
DROP POLICY IF EXISTS "Photographers can view incoming transfers" ON public.benefit_transfers;
DROP POLICY IF EXISTS "Users can view own benefit transfers" ON public.benefit_transfers;

CREATE POLICY "Users can view own benefit transfers"
  ON public.benefit_transfers
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = from_user_id
    OR (SELECT auth.uid()) = to_user_id
  );

-- ------------------------------------------------------------
-- 3. Funciones SECURITY DEFINER: revocar PUBLIC, conceder roles mínimos
-- ------------------------------------------------------------

-- Referidos (antes: cualquier authenticated podía llamar ensure_user_referral_code(otro_uuid))
REVOKE ALL ON FUNCTION public.assign_referral_code_to_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_referral_code(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_unique_referral_code() FROM PUBLIC;
-- assign_referral_code_to_new_user es solo trigger; no necesita GRANT (el owner de la tabla ejecuta triggers)
GRANT EXECUTE ON FUNCTION public.ensure_user_referral_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_referral_code() TO service_role;

-- Descuentos (antes: público podía inflar current_uses de cualquier código)
REVOKE ALL ON FUNCTION public.increment_discount_code_uses(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_discount_code_uses(UUID) TO service_role;

-- Cron pg_cron: ejecuta como postgres; también concedemos service_role por si se invoca vía API
REVOKE ALL ON FUNCTION public.maintain_time_slots_at_midnight_monterrey() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_time_slots_at_midnight_monterrey() TO postgres;
GRANT EXECUTE ON FUNCTION public.maintain_time_slots_at_midnight_monterrey() TO service_role;

-- Importación Google Calendar (scripts + google-calendar-sync.ts)
REVOKE ALL ON FUNCTION public.next_google_import_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_google_import_seq() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_google_import_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_google_import_seq() TO service_role;

-- Reembolsos (migración 49: tenía GRANT service_role pero no REVOKE PUBLIC)
REVOKE ALL ON FUNCTION public.reservation_refund_record_failure(
  uuid, text, timestamptz, timestamptz, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservation_refund_record_failure(
  uuid, text, timestamptz, timestamptz, integer
) TO service_role;

-- Galería: solo API admin con service role (revoca authenticated de migración 37/36)
REVOKE ALL ON FUNCTION public.register_gallery_image(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_gallery_image(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_gallery_image(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reorder_gallery_images(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_gallery_images(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_gallery_images(UUID[]) TO service_role;

-- ------------------------------------------------------------
-- 4. search_path inmutable
-- ------------------------------------------------------------

ALTER FUNCTION public.next_google_import_id() SET search_path = public;
ALTER FUNCTION public.reset_google_import_seq() SET search_path = public;

COMMIT;
