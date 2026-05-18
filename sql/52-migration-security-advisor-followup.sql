-- =====================================================
-- MIGRACIÓN 52: seguimiento Security Advisor (post-51)
-- =====================================================
-- Para BD ya en producción (después de 51). Instalaciones nuevas: ya en archivos base.
-- La migración 51 revocó PUBLIC, pero Supabase concede EXECUTE
-- por defecto a los roles anon y authenticated por separado.
-- Esta migración revoca explícitamente esos roles.
--
-- También:
-- - Elimina políticas RLS USING(true) en INSERT/UPDATE/DELETE
--   de availability y time_slots (mutaciones solo vía service role).
-- - Quita la política amplia de storage que permitía listar el bucket gallery.
--
-- Dashboard (manual): Auth > Password Security > Leaked password protection
-- =====================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. RPC internas: revocar anon + authenticated explícitamente
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.assign_referral_code_to_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_user_referral_code(UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_unique_referral_code() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_discount_code_uses(UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.maintain_time_slots_at_midnight_monterrey() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.next_google_import_id() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_google_import_seq() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reservation_refund_record_failure(
  uuid, text, timestamptz, timestamptz, integer
) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.register_gallery_image(TEXT, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reorder_gallery_images(UUID[]) FROM anon, authenticated;

-- Reafirmar grants mínimos (idempotente)
GRANT EXECUTE ON FUNCTION public.ensure_user_referral_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_referral_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_discount_code_uses(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintain_time_slots_at_midnight_monterrey() TO postgres;
GRANT EXECUTE ON FUNCTION public.maintain_time_slots_at_midnight_monterrey() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_google_import_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_google_import_seq() TO service_role;
GRANT EXECUTE ON FUNCTION public.reservation_refund_record_failure(
  uuid, text, timestamptz, timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_gallery_image(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reorder_gallery_images(UUID[]) TO service_role;

-- ------------------------------------------------------------
-- 2. availability / time_slots: quitar mutaciones abiertas
-- ------------------------------------------------------------
-- SELECT público se mantiene (calendario de reservas lee fechas cerradas).
-- INSERT/UPDATE/DELETE solo vía APIs admin con service role.

DROP POLICY IF EXISTS "Anyone can insert availability" ON public.availability;
DROP POLICY IF EXISTS "Anyone can update availability" ON public.availability;
DROP POLICY IF EXISTS "Anyone can delete availability" ON public.availability;

DROP POLICY IF EXISTS "Anyone can insert time slots" ON public.time_slots;
DROP POLICY IF EXISTS "Anyone can update time slots" ON public.time_slots;
DROP POLICY IF EXISTS "Anyone can delete time slots" ON public.time_slots;

-- ------------------------------------------------------------
-- 3. Storage gallery: quitar política que permite listar el bucket
-- ------------------------------------------------------------
-- Bucket public=true sigue sirviendo URLs directas por path conocido.
-- La tabla gallery_images + public_url en la app no dependen de list().

DROP POLICY IF EXISTS "gallery_public_read_objects" ON storage.objects;

COMMIT;
