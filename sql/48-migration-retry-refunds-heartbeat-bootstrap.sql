-- =====================================================
-- 48 - Bootstrap heartbeat para cron retry-failed-refunds
-- =====================================================
-- Idempotente. Ejecutar después de la migración 45 (cron_job_heartbeats).
-- =====================================================

INSERT INTO cron_job_heartbeats (job_name, last_success_at)
VALUES ('retry-failed-refunds', NOW())
ON CONFLICT (job_name) DO UPDATE SET
  last_success_at = COALESCE(cron_job_heartbeats.last_success_at, EXCLUDED.last_success_at);
