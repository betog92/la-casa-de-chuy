import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import {
  processRefundRow,
  recomputeReservationRefundStatus,
  type ReservationRefundRow,
} from "@/lib/payments/refund-processor";

/**
 * POST: Acción de admin para forzar el procesamiento del reembolso Conekta
 * de una reserva cancelada. Cubre dos casos en la misma llamada:
 *
 * 1) Filas en `failed`: se reabren (status→pending, attempts=0, next_retry_at=now)
 *    para que `processRefundRow` pueda volver a intentar contra Conekta.
 *    Útil tras corregir credenciales, fondos o el cargo desde el dashboard.
 *
 * 2) Filas ya en `pending`: se "empujan" poniendo `next_retry_at=now` y se
 *    procesan inline, sin esperar al backoff/cron. Útil cuando una fila
 *    quedó atascada esperando un próximo intento (p. ej. tras un error
 *    transitorio) y el admin quiere feedback inmediato.
 *
 * En ambos casos el resultado real lo decide `processRefundRow`; si vuelve a
 * fallar, el cron retoma el reintento según `next_retry_at`. Solo admin.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("Solo administradores");
  }

  const { id } = await params;
  const reservationId = parseInt(id, 10);
  if (Number.isNaN(reservationId) || reservationId < 1) {
    return validationErrorResponse("ID de reserva inválido");
  }

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  // (A) Reabrir las que estén en `failed` *en este momento*. No hacemos
  // SELECT previo para evitar carreras con el cron o webhooks.
  const { data: resetRows, error: resetError } = await supabase
    .from("reservation_refunds")
    .update({
      status: "pending",
      attempts: 0,
      next_retry_at: now,
      last_error_message: null,
      last_error_at: null,
      updated_at: now,
    } as never)
    .eq("reservation_id", reservationId)
    .eq("status", "failed")
    .select("*");

  if (resetError) {
    console.error("[admin/refund/retry] update failed→pending:", resetError);
    return errorResponse("Error al actualizar reembolsos", 500);
  }

  // (B) Empujar todas las `pending`: además de `next_retry_at=now` para que
  // el cron no las omita por backoff, reseteamos `attempts=0` y limpiamos
  // los campos de error. Razón: `handleConektaFailure` incrementa `attempts`
  // en cada error de Conekta; si el admin clickea varias veces sobre una
  // fila pending que Conekta sigue rechazando, sin reset terminaría
  // agotando el budget (`MAX_CANCELLATION_REFUND_FAILURES`) y marcándola
  // como `failed` por sus propios clicks. Esta es una acción manual
  // deliberada, así que el budget no debe consumirse por ella.
  // Incluye también las recién reabiertas en (A); el listado definitivo a
  // procesar se obtiene con el SELECT siguiente.
  const { error: forcedError } = await supabase
    .from("reservation_refunds")
    .update({
      attempts: 0,
      next_retry_at: now,
      last_error_message: null,
      last_error_at: null,
      updated_at: now,
    } as never)
    .eq("reservation_id", reservationId)
    .eq("status", "pending");

  if (forcedError) {
    // (A) puede haber tenido éxito; el SELECT siguiente recogerá igualmente
    // las filas pending (reabiertas o pre-existentes) y el cron procesará
    // las que aquí quedaron con `next_retry_at` antiguo. No abortamos.
    console.warn(
      "[admin/refund/retry] update pending→now falló (continuando):",
      forcedError,
    );
  }

  const resetList = (resetRows ?? []) as ReservationRefundRow[];
  const resetIds = new Set(resetList.map((r) => r.id));
  const reset = resetList.length;

  // Releer pending tras (A)+(B): evita procesar filas que el cron/webhook
  // ya pasó a `processed` entre el UPDATE y `processRefundRow` (el releído
  // en processRefundRow igual evitaría el cargo doble, pero así no
  // inflamos contadores ni hacemos round-trips innecesarios).
  const { data: pendingNow, error: pendingReadErr } = await supabase
    .from("reservation_refunds")
    .select("*")
    .eq("reservation_id", reservationId)
    .eq("status", "pending");

  if (pendingReadErr) {
    console.error("[admin/refund/retry] select pending:", pendingReadErr);
    return errorResponse("Error al leer reembolsos pendientes", 500);
  }

  const rows = (pendingNow ?? []) as ReservationRefundRow[];
  const forced = rows.filter((r) => !resetIds.has(r.id)).length;

  // Snapshot reutilizable para devolver `refund_status` y `refund_id`
  // actualizados a la UI. Lo leemos también cuando no hay nada que procesar
  // para que el front pueda detectar el caso "cron procesó justo antes de
  // que admin clickara" (refund_status ya no es 'failed'/'pending') y
  // ocultar el botón sin requerir refresh manual.
  const readSnapshot = async () => {
    const { data: snap } = await supabase
      .from("reservations")
      .select("refund_status, refund_id")
      .eq("id", reservationId)
      .maybeSingle();
    return snap as {
      refund_status: string | null;
      refund_id: string | null;
    } | null;
  };

  if (rows.length === 0) {
    const snapshot = await readSnapshot();
    if (reset > 0) {
      await recomputeReservationRefundStatus(supabase, reservationId);
      const snapAfter = await readSnapshot();
      return successResponse({
        message:
          "Se reabrieron filas desde failed, pero ya no había filas pending al procesar (p. ej. el cron o un webhook las completó entre tanto).",
        reset,
        forced: 0,
        processed: 0,
        pending: 0,
        failed: 0,
        refund_status: snapAfter?.refund_status ?? snapshot?.refund_status ?? null,
        refund_id: snapAfter?.refund_id ?? snapshot?.refund_id ?? null,
      });
    }
    return successResponse({
      message:
        "No hay filas de reembolso en estado failed ni pending para esta reserva",
      reset: 0,
      forced: 0,
      processed: 0,
      pending: 0,
      failed: 0,
      refund_status: snapshot?.refund_status ?? null,
      refund_id: snapshot?.refund_id ?? null,
    });
  }

  // Procesamiento secuencial (igual que el cron). Evita golpear Conekta en
  // paralelo cuando una reserva tiene varias filas (multi-charge). En la
  // gran mayoría de casos es una sola fila y la diferencia es nula.
  const summary = { processed: 0, pending: 0, failed: 0 };
  for (const row of rows) {
    try {
      const outcome = await processRefundRow(supabase, row);
      summary[outcome] += 1;
    } catch (err) {
      console.error("[admin/refund/retry] processRefundRow excepción:", {
        reservationId,
        refundRowId: row.id,
        err,
      });
      summary.pending += 1;
    }
  }

  await recomputeReservationRefundStatus(supabase, reservationId);

  const snapshot = await readSnapshot();

  return successResponse({
    message: `Reintento ejecutado: ${summary.processed} procesado(s), ${summary.pending} pendiente(s), ${summary.failed} fallido(s).`,
    reset,
    forced,
    ...summary,
    refund_status: snapshot?.refund_status ?? null,
    refund_id: snapshot?.refund_id ?? null,
  });
}
