import { NextRequest } from "next/server";

import { requireSuperAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import type { Database } from "@/types/database.types";

type RefundRow = Database["public"]["Tables"]["reservation_refunds"]["Row"];
type RefundStatus = RefundRow["status"];

const ALL_STATUSES: RefundStatus[] = [
  "pending",
  "failed",
  "processed",
  "cancelled",
];

const DEFAULT_STATUSES: RefundStatus[] = ["pending", "failed"];
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const MAX_LIMIT = 200;

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/refunds — lista filas de `reservation_refunds` con su
 * reserva asociada (cliente, fecha de cita) para la vista admin
 * `/admin/reembolsos`.
 *
 * Query params (todos opcionales):
 * - `status`   (csv): `pending,failed,processed,cancelled`.
 *               Default: `pending,failed`.
 * - `days`     (int 1..365): rango por `updated_at` reciente (actividad).
 *               Default: 30. Usa `all=1` para no aplicar el filtro.
 * - `all`      (1/true): ignora `days` y trae histórico completo.
 * - `limit`    (int 1..200): tope de filas. Default: 100.
 *
 * Solo admin.
 */
export async function GET(request: NextRequest) {
  const { user, isSuperAdmin } = await requireSuperAdmin();
  if (!user) {
    return unauthorizedResponse("Debes iniciar sesión");
  }
  if (!isSuperAdmin) {
    return forbiddenResponse("Solo super administradores (familia) pueden ver reembolsos");
  }

  const { searchParams } = new URL(request.url);

  // status
  const statusParam = (searchParams.get("status") ?? "").trim();
  let statuses: RefundStatus[];
  if (!statusParam) {
    statuses = DEFAULT_STATUSES;
  } else {
    const parsed = statusParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is RefundStatus =>
        (ALL_STATUSES as string[]).includes(s),
      );
    if (parsed.length === 0) {
      return validationErrorResponse(
        "Parámetro status inválido. Valores válidos: pending, failed, processed, cancelled",
      );
    }
    statuses = Array.from(new Set(parsed));
  }

  // days / all
  const allFlag = ["1", "true", "yes"].includes(
    (searchParams.get("all") ?? "").toLowerCase(),
  );
  let days: number | null = DEFAULT_DAYS;
  if (allFlag) {
    days = null;
  } else if (searchParams.get("days")) {
    const parsed = parseInt(searchParams.get("days") ?? "", 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_DAYS) {
      return validationErrorResponse(
        `Parámetro days inválido (1..${MAX_DAYS})`,
      );
    }
    days = parsed;
  }

  // limit
  let limit = 100;
  if (searchParams.get("limit")) {
    const parsed = parseInt(searchParams.get("limit") ?? "", 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return validationErrorResponse(
        `Parámetro limit inválido (1..${MAX_LIMIT})`,
      );
    }
    limit = parsed;
  }

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("reservation_refunds")
    .select(
      "id, reservation_id, payment_id, charge_id, charge_kind, amount_mxn, status, refund_id, attempts, last_error_message, last_error_at, next_retry_at, processed_at, notes, created_at, updated_at",
    )
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (days !== null) {
    const sinceIso = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();
    // Filtrar por `updated_at` (no `created_at`) para que el rango refleje
    // actividad reciente y sea consistente con el ORDER BY.
    query = query.gte("updated_at", sinceIso);
  }

  const { data: refundRows, error: refundsErr } = await query;
  if (refundsErr) {
    console.error("[admin/refunds] Error consultando refunds:", refundsErr);
    return errorResponse("Error consultando reembolsos", 500);
  }

  const rows = (refundRows ?? []) as RefundRow[];
  if (rows.length === 0) {
    return successResponse({
      refunds: [],
      filters: { statuses, days, limit },
    });
  }

  // Una segunda query para hidratar datos de reserva (cliente, cita).
  // Evitamos el join PostgREST por simplicidad y porque solo necesitamos
  // un puñado de columnas.
  const reservationIds = Array.from(
    new Set(rows.map((r) => r.reservation_id)),
  );
  const { data: resvRows, error: resvErr } = await supabase
    .from("reservations")
    .select(
      "id, name, email, date, start_time, status, refund_status, refund_amount, refund_id",
    )
    .in("id", reservationIds);

  if (resvErr) {
    console.error("[admin/refunds] Error consultando reservations:", resvErr);
    return errorResponse("Error consultando reservas", 500);
  }

  type ResvLite = {
    id: number;
    name: string | null;
    email: string | null;
    date: string | null;
    start_time: string | null;
    status: string | null;
    refund_status: string | null;
    refund_amount: number | null;
    refund_id: string | null;
  };

  const byId = new Map<number, ResvLite>();
  for (const r of (resvRows ?? []) as ResvLite[]) {
    byId.set(r.id, r);
  }

  const refunds = rows.map((row) => {
    const resv = byId.get(row.reservation_id) ?? null;
    return {
      id: row.id,
      reservation_id: row.reservation_id,
      payment_id: row.payment_id,
      charge_id: row.charge_id,
      charge_kind: row.charge_kind,
      amount_mxn: row.amount_mxn,
      status: row.status,
      refund_id: row.refund_id,
      attempts: row.attempts,
      last_error_message: row.last_error_message,
      last_error_at: row.last_error_at,
      next_retry_at: row.next_retry_at,
      processed_at: row.processed_at,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reservation: resv
        ? {
            id: resv.id,
            name: resv.name,
            email: resv.email,
            date: resv.date,
            start_time: resv.start_time,
            status: resv.status,
            refund_status: resv.refund_status,
            refund_amount: resv.refund_amount,
            refund_id: resv.refund_id,
          }
        : null,
    };
  });

  return successResponse({
    refunds,
    filters: { statuses, days, limit },
  });
}
