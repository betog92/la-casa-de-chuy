-- =====================================================
-- 46 - Bootstrap fila de heartbeat (idempotente)
-- =====================================================
-- Si aplicaste la migración 45 antes de existir el INSERT de semilla, la
-- tabla puede estar vacía y el monitor de stale nunca alertaba. Este script
-- es seguro ejecutarlo varias veces.
-- =====================================================

INSERT INTO cron_job_heartbeats (job_name, last_success_at)
VALUES ('refund-orphan-payments', NOW())
ON CONFLICT (job_name) DO UPDATE SET
  last_success_at = COALESCE(cron_job_heartbeats.last_success_at, EXCLUDED.last_success_at);
