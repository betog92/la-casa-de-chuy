-- =====================================================
-- 45 - Heartbeat del cron de reembolso de huérfanos
-- =====================================================
-- Cada ejecución exitosa de `/api/cron/refund-orphan-payments` actualiza
-- `last_success_at`. El webhook de Conekta consulta este valor: si la
-- última corrida fue hace más de 30 min, envía alerta al admin (máx. 1 vez
-- cada 24 h) para detectar cron-job.org caído o mal configurado sin depender
-- de pushes a GitHub.
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_job_heartbeats (
  job_name TEXT PRIMARY KEY,
  last_success_at TIMESTAMPTZ,
  last_stale_alert_sent_at TIMESTAMPTZ
);

COMMENT ON TABLE cron_job_heartbeats IS
  'Última ejecución exitosa de jobs externos (cron-job.org, etc.). RLS sin políticas: sólo service role.';

ALTER TABLE cron_job_heartbeats ENABLE ROW LEVEL SECURITY;

INSERT INTO cron_job_heartbeats (job_name, last_success_at)
VALUES ('refund-orphan-payments', NOW())
ON CONFLICT (job_name) DO UPDATE SET
  last_success_at = COALESCE(cron_job_heartbeats.last_success_at, EXCLUDED.last_success_at);
