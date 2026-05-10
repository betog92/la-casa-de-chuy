import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { sendAdminPaymentAlert } from "@/lib/email";

type ServiceClient = SupabaseClient<Database>;

/** Nombre de fila en `cron_job_heartbeats` para el cron de huérfanos. */
export const REFUND_ORPHAN_CRON_JOB_NAME = "refund-orphan-payments";

const STALE_AFTER_MS = 30 * 60 * 1000;
const STALE_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Llamar al final de una corrida exitosa del cron (antes de responder 200).
 *
 * Además de actualizar `last_success_at`, resetea `last_stale_alert_sent_at`
 * a NULL: así, si el cron vuelve a caerse después de recuperarse, la próxima
 * detección de stale dispara la alerta inmediatamente (sin esperar a que
 * pase el cooldown de 24 h disparado por la alerta anterior).
 *
 * Si la tabla no existe aún (migración pendiente), falla en silencio.
 */
export async function recordRefundOrphanCronSuccess(
  supabase: ServiceClient,
): Promise<void> {
  // Capturamos cualquier excepción a nivel de red/cliente: el cron acaba de
  // hacer su trabajo principal (procesar pendings) y no queremos que un blip
  // del heartbeat lo haga responder 500.
  try {
    const now = new Date().toISOString();
    const { error } = await supabase.from("cron_job_heartbeats").upsert(
      {
        job_name: REFUND_ORPHAN_CRON_JOB_NAME,
        last_success_at: now,
        last_stale_alert_sent_at: null,
      } as never,
      { onConflict: "job_name" },
    );
    if (error) {
      console.error(
        "[cron-heartbeat] No se pudo registrar last_success_at (¿migración 45 aplicada?):",
        error,
      );
    }
  } catch (err) {
    console.error(
      "[cron-heartbeat] Excepción registrando last_success_at:",
      err,
    );
  }
}

/**
 * Comprueba si el cron de huérfanos lleva demasiado sin una corrida exitosa
 * y, si aplica, envía alerta al admin. El “claim” de la alerta es un UPDATE
 * atómico (evita doble correo si llegan dos webhooks a la vez).
 *
 * En rutas serverless, envolver la llamada en `after(() => …)` desde
 * `next/server` para que siga ejecutándose tras enviar la respuesta HTTP.
 */
export async function runRefundCronStaleCheck(
  supabase: ServiceClient,
): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const alertCooldownCutoff = new Date(
    Date.now() - STALE_ALERT_COOLDOWN_MS,
  ).toISOString();
  const claimedAt = new Date().toISOString();

  // PostgREST trata `.` y `:` como caracteres reservados dentro de `.or()`,
  // así que el timestamp ISO va entre comillas dobles para que no parta el
  // parseo del filtro.
  const { data: claimed, error } = await supabase
    .from("cron_job_heartbeats")
    .update({ last_stale_alert_sent_at: claimedAt } as never)
    .eq("job_name", REFUND_ORPHAN_CRON_JOB_NAME)
    .not("last_success_at", "is", null)
    .lt("last_success_at", staleCutoff)
    .or(
      `last_stale_alert_sent_at.is.null,last_stale_alert_sent_at.lt."${alertCooldownCutoff}"`,
    )
    .select("job_name, last_success_at")
    .maybeSingle();

  if (error) {
    console.error("[cron-heartbeat] Error reclamando alerta stale:", error);
    return;
  }
  if (!claimed) {
    return;
  }

  const lastOkIso = (claimed as { last_success_at: string | null })
    .last_success_at;
  const lastOk = lastOkIso ? new Date(lastOkIso).getTime() : NaN;
  // `Math.max(0, ...)` por defensa: si hubiera clock skew y `lastOk` fuera
  // posterior a `Date.now()`, evitamos mostrar “hace ~-3 min” en el correo.
  const ageMs = Number.isFinite(lastOk) ? Math.max(0, Date.now() - lastOk) : 0;
  const minutes = Math.round(ageMs / 60_000);

  const sent = await sendAdminPaymentAlert({
    type: "orphan_cron_stale_heartbeat",
    paymentId: REFUND_ORPHAN_CRON_JOB_NAME,
    notes: `La última corrida exitosa del cron de reembolsos huérfanos fue hace ~${minutes} min (umbral ${STALE_AFTER_MS / 60_000} min). Revisa cron-job.org, CRON_SECRET y logs de Vercel en /api/cron/refund-orphan-payments.`,
  });
  if (!sent.ok) {
    console.warn("[cron-heartbeat] No se pudo enviar alerta stale:", sent.error);
  }
}
