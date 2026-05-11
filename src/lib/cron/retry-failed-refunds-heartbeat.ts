import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { sendAdminPaymentAlert } from "@/lib/email";

type ServiceClient = SupabaseClient<Database>;

export const RETRY_FAILED_REFUNDS_CRON_JOB_NAME = "retry-failed-refunds";

const STALE_AFTER_MS = 30 * 60 * 1000;
const STALE_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function recordRetryFailedRefundsCronSuccess(
  supabase: ServiceClient,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase.from("cron_job_heartbeats").upsert(
      {
        job_name: RETRY_FAILED_REFUNDS_CRON_JOB_NAME,
        last_success_at: now,
        last_stale_alert_sent_at: null,
      } as never,
      { onConflict: "job_name" },
    );
    if (error) {
      console.error(
        "[cron-heartbeat] retry-failed-refunds: no se pudo registrar last_success_at:",
        error,
      );
    }
  } catch (err) {
    console.error(
      "[cron-heartbeat] retry-failed-refunds: excepción registrando last_success_at:",
      err,
    );
  }
}

export async function runRetryFailedRefundsCronStaleCheck(
  supabase: ServiceClient,
): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const alertCooldownCutoff = new Date(
    Date.now() - STALE_ALERT_COOLDOWN_MS,
  ).toISOString();
  const claimedAt = new Date().toISOString();

  const { data: claimed, error } = await supabase
    .from("cron_job_heartbeats")
    .update({ last_stale_alert_sent_at: claimedAt } as never)
    .eq("job_name", RETRY_FAILED_REFUNDS_CRON_JOB_NAME)
    .not("last_success_at", "is", null)
    .lt("last_success_at", staleCutoff)
    .or(
      `last_stale_alert_sent_at.is.null,last_stale_alert_sent_at.lt."${alertCooldownCutoff}"`,
    )
    .select("job_name, last_success_at")
    .maybeSingle();

  if (error) {
    console.error(
      "[cron-heartbeat] retry-failed-refunds: error reclamando alerta stale:",
      error,
    );
    return;
  }
  if (!claimed) return;

  const lastOkIso = (claimed as { last_success_at: string | null })
    .last_success_at;
  const lastOk = lastOkIso ? new Date(lastOkIso).getTime() : NaN;
  const ageMs = Number.isFinite(lastOk) ? Math.max(0, Date.now() - lastOk) : 0;
  const minutes = Math.round(ageMs / 60_000);

  const sent = await sendAdminPaymentAlert({
    type: "retry_refunds_cron_stale_heartbeat",
    paymentId: RETRY_FAILED_REFUNDS_CRON_JOB_NAME,
    notes: `La última corrida exitosa del cron retry-failed-refunds fue hace ~${minutes} min (umbral ${STALE_AFTER_MS / 60_000} min). Revisa cron-job.org, CRON_SECRET y logs en /api/cron/retry-failed-refunds.`,
  });
  if (!sent.ok) {
    console.warn(
      "[cron-heartbeat] retry-failed-refunds: no se pudo enviar alerta stale:",
      sent.error,
    );
  }
}
