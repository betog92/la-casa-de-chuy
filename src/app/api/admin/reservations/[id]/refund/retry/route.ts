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
 * POST: Reabre reintentos de reembolso Conekta para una reserva cancelada
 * (marca `reservation_refunds` en `failed` como `pending` y `attempts=0`)
 * y los procesa inline para dar feedback inmediato al admin. Si alguno
 * falla en este intento inline, el cron lo recoge según `next_retry_at`.
 * Solo admin.
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

  // UPDATE atómico: reabre solo lo que esté en `failed` *en este momento*.
  // No hacemos SELECT previo para evitar carreras con el cron o webhooks.
  const { data: resetRows, error: updateError } = await supabase
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

  if (updateError) {
    console.error("[admin/refund/retry] update:", updateError);
    return errorResponse("Error al actualizar reembolsos", 500);
  }

  const rows = (resetRows ?? []) as ReservationRefundRow[];

  // Snapshot reutilizable para devolver `refund_status` y `refund_id`
  // actualizados a la UI. Lo leemos también cuando `rows.length === 0` para
  // que el front pueda detectar el caso "cron procesó justo antes de que
  // admin clickara" (refund_status ya no es 'failed') y ocultar el botón
  // sin requerir refresh manual.
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
    return successResponse({
      message: "No hay filas de reembolso en estado failed para esta reserva",
      reset: 0,
      processed: 0,
      pending: 0,
      failed: 0,
      refund_status: snapshot?.refund_status ?? null,
      refund_id: snapshot?.refund_id ?? null,
    });
  }

  const outcomes = await Promise.all(
    rows.map(async (row) => {
      try {
        return await processRefundRow(supabase, row);
      } catch (err) {
        console.error("[admin/refund/retry] processRefundRow excepción:", {
          reservationId,
          refundRowId: row.id,
          err,
        });
        return "pending" as const;
      }
    }),
  );

  const summary = { processed: 0, pending: 0, failed: 0 };
  for (const o of outcomes) {
    summary[o] += 1;
  }

  await recomputeReservationRefundStatus(supabase, reservationId);

  const snapshot = await readSnapshot();

  return successResponse({
    message: `Reintento ejecutado: ${summary.processed} procesado(s), ${summary.pending} pendiente(s), ${summary.failed} fallido(s).`,
    reset: rows.length,
    ...summary,
    refund_status: snapshot?.refund_status ?? null,
    refund_id: snapshot?.refund_id ?? null,
  });
}
