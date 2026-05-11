import { NextRequest } from "next/server";

import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isCronSecretAuthorized } from "@/utils/cron-auth";
import { requireAdmin } from "@/lib/auth/admin";
import {
  processRefundRow,
  recomputeReservationRefundStatus,
  type ReservationRefundRow,
} from "@/lib/payments/refund-processor";
import { recordRetryFailedRefundsCronSuccess } from "@/lib/cron/retry-failed-refunds-heartbeat";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const MAX_BATCH = 50;

/**
 * Reintenta reembolsos Conekta de cancelaciones (`reservation_refunds` en
 * `pending` con `next_retry_at` vencido). Ver `src/lib/payments/refund-processor.ts`.
 */
export async function POST(request: NextRequest) {
  return runCron(request);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  if (!isCronSecretAuthorized(request)) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.isAdmin) {
      return unauthorizedResponse("No autorizado");
    }
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("reservation_refunds")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error("[cron/retry-failed-refunds] Error consultando filas:", error);
    return errorResponse("Error consultando reservation_refunds", 500);
  }

  const list = (rows as ReservationRefundRow[] | null) ?? [];
  const summary = {
    candidates: list.length,
    processed: 0,
    pending: 0,
    failed: 0,
    errors: 0,
  };

  const seenReservations = new Set<number>();

  for (const row of list) {
    try {
      const outcome = await processRefundRow(supabase, row);
      if (outcome === "processed") summary.processed += 1;
      else if (outcome === "failed") summary.failed += 1;
      else summary.pending += 1;
      seenReservations.add(row.reservation_id);
    } catch (err) {
      summary.errors += 1;
      console.error("[cron/retry-failed-refunds] Excepción procesando fila", {
        refundRowId: row.id,
        reservationId: row.reservation_id,
        paymentId: row.payment_id,
        err,
      });
    }
  }

  for (const reservationId of seenReservations) {
    await recomputeReservationRefundStatus(supabase, reservationId);
  }

  await recordRetryFailedRefundsCronSuccess(supabase);

  return successResponse(summary);
}
