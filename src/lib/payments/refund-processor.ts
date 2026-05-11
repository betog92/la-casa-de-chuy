import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";
import { sendAdminPaymentAlert } from "@/lib/email";
import {
  findChargeEligibleForRefund,
  formatConektaError,
  getConektaOrder,
  isAlreadyRefundedError,
  refundConektaCharge,
  toCents,
} from "@/lib/payments/conekta";

export type ServiceSupabase = SupabaseClient<Database>;

export type ReservationRefundRow =
  Database["public"]["Tables"]["reservation_refunds"]["Row"];

/** Número máximo de intentos fallidos a Conekta antes de marcar `failed`. */
export const MAX_CANCELLATION_REFUND_FAILURES = 6;

const BACKOFF_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
];

function nextRetryDelayMs(failureCount: number): number {
  const i = Math.min(
    Math.max(failureCount - 1, 0),
    BACKOFF_MS.length - 1,
  );
  const fallback = BACKOFF_MS[BACKOFF_MS.length - 1] ?? 72 * 60 * 60 * 1000;
  return BACKOFF_MS[i] ?? fallback;
}

type RpcFailurePayload = {
  updated?: boolean;
  attempts?: number;
  status?: string;
};

function parseRpcFailurePayload(data: Json | null): RpcFailurePayload {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as RpcFailurePayload;
  }
  return {};
}

/**
 * Procesa una fila `reservation_refunds`: consulta la orden, reembolsa el
 * cargo vía Conekta y actualiza la fila. Idempotencia: `cancel_<row.id>`.
 *
 * @returns `processed` si la fila quedó procesada (éxito o sin cargo que
 *   reembolsar), `pending` si quedó para reintento, `failed` si agotó
 *   intentos.
 */
export async function processRefundRow(
  supabase: ServiceSupabase,
  row: ReservationRefundRow,
): Promise<"processed" | "pending" | "failed"> {
  const { data: fresh, error: freshErr } = await supabase
    .from("reservation_refunds")
    .select("*")
    .eq("id", row.id)
    .maybeSingle();

  if (freshErr || !fresh) {
    console.error(
      "[refund-processor] No se pudo releer reservation_refunds:",
      row.id,
      freshErr,
    );
    return "pending";
  }

  const r = fresh as ReservationRefundRow;

  if (r.status === "processed" || r.status === "cancelled") {
    return "processed";
  }
  if (r.status === "failed") {
    return "failed";
  }

  const { data: resv, error: resvErr } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", r.reservation_id)
    .maybeSingle();

  if (resvErr) {
    console.error(
      "[refund-processor] Error leyendo reserva para refund:",
      r.reservation_id,
      resvErr,
    );
    return "pending";
  }

  const resvStatus = (resv as { status?: string } | null)?.status;
  if (resvStatus !== "cancelled") {
    // Timeout duro: si la fila lleva > 24h sin que la reserva esté
    // cancelled, hay una inconsistencia que requiere intervención humana.
    const ageMs = Date.now() - new Date(r.created_at).getTime();
    if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) {
      const failNow = new Date().toISOString();
      await supabase
        .from("reservation_refunds")
        .update({
          status: "failed",
          last_error_message: `Reserva no llegó a cancelled tras 24h (status actual: ${resvStatus ?? "desconocido"}).`,
          last_error_at: failNow,
          updated_at: failNow,
        } as never)
        .eq("id", r.id)
        .eq("status", "pending");
      await sendAdminPaymentAlert({
        type: "cancellation_refund_failed",
        paymentId: r.payment_id,
        chargeId: r.charge_id,
        reservationId: r.reservation_id,
        notes: `Fila reservation_refunds ${r.id} (${r.charge_kind}) lleva > 24h con la reserva en status '${resvStatus ?? "desconocido"}' (no cancelled). Inconsistencia: investigar manualmente.`,
      });
      return "failed";
    }

    const deferUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase
      .from("reservation_refunds")
      .update({
        next_retry_at: deferUntil,
        notes:
          "La reserva no está en status cancelled; se difiere el reembolso (posible inconsistencia transitoria).",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", r.id)
      .eq("status", "pending");
    console.warn(
      "[refund-processor] reservation no cancelled; deferring refund row",
      { refundRowId: r.id, reservationId: r.reservation_id, resvStatus },
    );
    return "pending";
  }

  const now = new Date().toISOString();

  let order;
  try {
    order = await getConektaOrder(r.payment_id);
  } catch (err) {
    return await handleConektaFailure(
      supabase,
      r,
      formatConektaError(err).message || String(err),
      now,
    );
  }

  const charge = findChargeEligibleForRefund(order);
  if (!charge) {
    await supabase
      .from("reservation_refunds")
      .update({
        status: "processed",
        charge_id: r.charge_id,
        processed_at: now,
        notes: "Sin cargo paid/partially_refunded en la orden; nada que reembolsar.",
        updated_at: now,
      } as never)
      .eq("id", r.id)
      .eq("status", "pending");
    return "processed";
  }

  const chargeId = charge.id;
  const chargeAmountMxn = Math.round(Number(charge.amount)) / 100;
  const refundMxn = Math.min(Number(r.amount_mxn), chargeAmountMxn);
  const refundCents = toCents(refundMxn);
  if (!Number.isFinite(refundCents) || refundCents <= 0) {
    await supabase
      .from("reservation_refunds")
      .update({
        status: "processed",
        charge_id: chargeId,
        processed_at: now,
        notes: "Monto de reembolso calculado en 0; omitiendo llamada a Conekta.",
        updated_at: now,
      } as never)
      .eq("id", r.id)
      .eq("status", "pending");
    return "processed";
  }

  try {
    const result = await refundConektaCharge(
      chargeId,
      refundCents,
      `cancel_${r.id}`,
    );
    await supabase
      .from("reservation_refunds")
      .update({
        status: "processed",
        charge_id: chargeId,
        refund_id: result.id,
        processed_at: now,
        last_error_message: null,
        last_error_at: null,
        updated_at: now,
      } as never)
      .eq("id", r.id)
      .eq("status", "pending");
    return "processed";
  } catch (err) {
    if (isAlreadyRefundedError(err)) {
      await supabase
        .from("reservation_refunds")
        .update({
          status: "processed",
          charge_id: chargeId,
          notes: "Conekta indicó que el cargo ya estaba reembolsado (idempotencia).",
          processed_at: now,
          updated_at: now,
        } as never)
        .eq("id", r.id)
        .eq("status", "pending");
      return "processed";
    }
    const msg = formatConektaError(err).message || String(err);
    return await handleConektaFailure(supabase, r, msg, now);
  }
}

async function handleConektaFailure(
  supabase: ServiceSupabase,
  row: ReservationRefundRow,
  message: string,
  nowIso: string,
): Promise<"pending" | "failed" | "processed"> {
  const failuresAfterThis = row.attempts + 1;
  const nextRetryIso = new Date(
    Date.now() + nextRetryDelayMs(failuresAfterThis),
  ).toISOString();

  const { data: rpcRaw, error: rpcErr } = await supabase.rpc(
    "reservation_refund_record_failure",
    {
      p_row_id: row.id,
      p_message: message,
      p_now: nowIso,
      p_next_retry: nextRetryIso,
      p_max_attempts: MAX_CANCELLATION_REFUND_FAILURES,
    } as never,
  );

  if (rpcErr) {
    console.error(
      "[refund-processor] RPC reservation_refund_record_failure (¿migración 49?):",
      rpcErr,
    );
    return await handleConektaFailureLegacy(
      supabase,
      row,
      message,
      nowIso,
      nextRetryIso,
    );
  }

  const payload = parseRpcFailurePayload(rpcRaw as Json | null);
  if (!payload.updated) {
    const { data: st } = await supabase
      .from("reservation_refunds")
      .select("status")
      .eq("id", row.id)
      .maybeSingle();
    const s = (st as { status?: string } | null)?.status;
    if (s === "failed") return "failed";
    return "processed";
  }

  if (payload.status === "failed") {
    await sendAdminPaymentAlert({
      type: "cancellation_refund_failed",
      paymentId: row.payment_id,
      chargeId: row.charge_id,
      reservationId: row.reservation_id,
      notes: `Fila reservation_refunds ${row.id} (${row.charge_kind}): agotó ${MAX_CANCELLATION_REFUND_FAILURES} intentos. Último error: ${message}`,
    });
    return "failed";
  }

  return "pending";
}

/** Fallback si la migración 49 aún no está aplicada (incremento no atómico). */
async function handleConektaFailureLegacy(
  supabase: ServiceSupabase,
  row: ReservationRefundRow,
  message: string,
  nowIso: string,
  nextRetryIso: string,
): Promise<"pending" | "failed" | "processed"> {
  const failures = row.attempts + 1;
  if (failures >= MAX_CANCELLATION_REFUND_FAILURES) {
    await supabase
      .from("reservation_refunds")
      .update({
        status: "failed",
        attempts: failures,
        last_error_message: message,
        last_error_at: nowIso,
        updated_at: nowIso,
      } as never)
      .eq("id", row.id)
      .eq("status", "pending");

    await sendAdminPaymentAlert({
      type: "cancellation_refund_failed",
      paymentId: row.payment_id,
      chargeId: row.charge_id,
      reservationId: row.reservation_id,
      notes: `Fila reservation_refunds ${row.id} (${row.charge_kind}): agotó ${MAX_CANCELLATION_REFUND_FAILURES} intentos. Último error: ${message}`,
    });
    return "failed";
  }

  await supabase
    .from("reservation_refunds")
    .update({
      attempts: failures,
      last_error_message: message,
      last_error_at: nowIso,
      next_retry_at: nextRetryIso,
      updated_at: nowIso,
    } as never)
    .eq("id", row.id)
    .eq("status", "pending");
  return "pending";
}

/**
 * Actualiza `reservations.refund_status` y `refund_id` según el agregado de
 * filas `reservation_refunds` (excluye `cancelled`).
 */
export async function recomputeReservationRefundStatus(
  supabase: ServiceSupabase,
  reservationId: number,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("reservation_refunds")
    .select("status, refund_id, charge_kind")
    .eq("reservation_id", reservationId);

  if (error) {
    console.error(
      "[refund-processor] Error leyendo reservation_refunds:",
      reservationId,
      error,
    );
    return;
  }
  const list = (rows ?? []) as Pick<
    ReservationRefundRow,
    "status" | "refund_id" | "charge_kind"
  >[];
  if (list.length === 0) return;

  const active = list.filter((r) => r.status !== "cancelled");
  if (active.length === 0) return;

  let refund_status: "pending" | "processed" | "failed";
  if (active.some((r) => r.status === "pending")) {
    refund_status = "pending";
  } else if (active.every((r) => r.status === "processed")) {
    refund_status = "processed";
  } else if (active.some((r) => r.status === "failed")) {
    refund_status = "failed";
  } else {
    refund_status = "pending";
  }

  const refund_id =
    active.find((r) => r.status === "processed" && r.refund_id)?.refund_id ??
    null;

  const { error: updateErr } = await supabase
    .from("reservations")
    .update({
      refund_status,
      ...(refund_id ? { refund_id } : {}),
    } as never)
    .eq("id", reservationId);
  if (updateErr) {
    console.error(
      "[refund-processor] recomputeReservationRefundStatus: update reservations falló:",
      reservationId,
      updateErr,
    );
  }
}

/**
 * Reconcilia el webhook `charge.refunded` con `reservation_refunds`:
 * - Devuelve `true` si alguna fila (en *cualquier* estado) coincide por
 *   `charge_id` u orden (`payment_id`). El caller usa este flag para saber
 *   si el refund es uno *nuestro* (no alertar como dashboard externo).
 * - Cuando la fila coincidente está `pending` o `failed`, además la marca
 *   como `processed` (el cron deja de reintentarla). Si ya está
 *   `processed` o `cancelled`, sólo confirma el match sin tocarla.
 * - Si el caller pasa `refundId` (extraído del payload con
 *   `extractRefundIdFromChargeRefundedPayload`), lo persiste en la fila
 *   cuando ésta aún no lo tenía. Cubre la carrera en la que el webhook
 *   llega antes de que el `processRefundRow` inline termine su UPDATE
 *   (en ese caso el inline pierde la oportunidad de escribir `refund_id`
 *   porque la fila ya pasó a `processed`).
 * - Si la fila ya está `processed` pero sin `refund_id` (p. ej. rama
 *   `isAlreadyRefundedError` en `processRefundRow`), un webhook posterior
 *   puede rellenar solo `refund_id` sin tocar el resto.
 */
export async function reconcileReservationRefundFromWebhook(
  supabase: ServiceSupabase,
  args: {
    reservationId: number;
    chargeId: string | null;
    orderId: string | null;
    refundId?: string | null;
  },
): Promise<boolean> {
  if (!args.orderId && !args.chargeId) return false;

  const { data: rows, error } = await supabase
    .from("reservation_refunds")
    .select("id, payment_id, charge_id, status, refund_id")
    .eq("reservation_id", args.reservationId);

  if (error || !rows?.length) return false;

  const list = rows as {
    id: string;
    payment_id: string;
    charge_id: string | null;
    status: string;
    refund_id: string | null;
  }[];

  const now = new Date().toISOString();
  let matched = false;

  for (const r of list) {
    const matchesOrder =
      Boolean(args.orderId) && r.payment_id === args.orderId;
    const matchesCharge =
      Boolean(args.chargeId) && r.charge_id === args.chargeId;
    if (!matchesOrder && !matchesCharge) continue;

    matched = true;

    if (r.status === "pending" || r.status === "failed") {
      const update: Record<string, unknown> = {
        status: "processed",
        charge_id: args.chargeId ?? r.charge_id,
        processed_at: now,
        last_error_message: null,
        last_error_at: null,
        notes: "Confirmado vía webhook charge.refunded.",
        updated_at: now,
      };
      // Solo sobrescribimos `refund_id` si la fila aún no lo tenía
      // (evita pisar un `ref_xxx` ya escrito por el inline).
      if (args.refundId && !r.refund_id) {
        update.refund_id = args.refundId;
      }
      await supabase
        .from("reservation_refunds")
        .update(update as never)
        .eq("id", r.id)
        .in("status", ["pending", "failed"]);
    } else if (
      r.status === "processed" &&
      !r.refund_id &&
      args.refundId
    ) {
      const { error: backfillErr } = await supabase
        .from("reservation_refunds")
        .update({
          refund_id: args.refundId,
          updated_at: now,
        } as never)
        .eq("id", r.id)
        .eq("status", "processed")
        .is("refund_id", null);
      if (backfillErr) {
        console.error(
          "[refund-processor] reconcile: backfill refund_id falló:",
          r.id,
          backfillErr,
        );
      }
    }
  }

  return matched;
}
