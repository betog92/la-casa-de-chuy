-- =====================================================
-- 49 - RPC atómico: registrar fallo de reembolso (attempts++)
-- =====================================================
-- Evita condiciones de carrera entre cron y cancelación inline al
-- incrementar `attempts` y decidir `failed` vs `pending`.
-- Llamado desde `src/lib/payments/refund-processor.ts`.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reservation_refund_record_failure(
  p_row_id uuid,
  p_message text,
  p_now timestamptz,
  p_next_retry timestamptz,
  p_max_attempts integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_attempts integer;
  v_status text;
BEGIN
  UPDATE public.reservation_refunds
  SET
    attempts = reservation_refunds.attempts + 1,
    last_error_message = p_message,
    last_error_at = p_now,
    updated_at = p_now,
    status = CASE
      WHEN reservation_refunds.attempts + 1 >= p_max_attempts THEN 'failed'
      ELSE 'pending'
    END,
    next_retry_at = CASE
      WHEN reservation_refunds.attempts + 1 >= p_max_attempts
        THEN reservation_refunds.next_retry_at
      ELSE p_next_retry
    END
  WHERE id = p_row_id
    AND status = 'pending'
  RETURNING attempts, status INTO v_attempts, v_status;

  IF NOT FOUND THEN
    RETURN json_build_object('updated', false);
  END IF;

  RETURN json_build_object(
    'updated', true,
    'attempts', v_attempts,
    'status', v_status
  );
END;
$fn$;

COMMENT ON FUNCTION public.reservation_refund_record_failure IS
  'Incrementa attempts en una fila pending; marca failed si alcanza p_max_attempts.';

GRANT EXECUTE ON FUNCTION public.reservation_refund_record_failure(
  uuid, text, timestamptz, timestamptz, integer
) TO service_role;

COMMIT;
