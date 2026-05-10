import { NextRequest } from "next/server";
import axios from "axios";

import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isCronSecretAuthorized } from "@/utils/cron-auth";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getConektaOrder,
  findPaidCharge,
  refundConektaCharge,
  isAlreadyRefundedError,
} from "@/lib/payments/conekta";
import { sendAdminPaymentAlert } from "@/lib/email";
import {
  recordRefundOrphanCronSuccess,
} from "@/lib/cron/refund-orphan-heartbeat";

// Marcar el módulo como dinámico (no cachear) para que el cron siempre
// corra fresh y Next.js no intente prerender la respuesta.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Procesar hasta 50 pendings con queries a Conekta + Supabase puede tomar
// más que el default conservador. 300s es el max permitido en Hobby con
// Fluid Compute (y en Pro). Lo declaramos explícito para no depender de
// defaults que cambian entre versiones de Vercel.
export const maxDuration = 300;

// =====================================================
// /api/cron/refund-orphan-payments
// =====================================================
// Schedule: cron-job.org (u otro) cada ~5 min — ver DEPLOY.md sección 7.bis.
// Llamadas autorizadas con `Authorization: Bearer <CRON_SECRET>`.
//
// Detecta `pending_reservations.status='pending_payment'` con `created_at`
// más antiguo que `ORPHAN_TIMEOUT_MIN` minutos. Para cada uno:
//
//  - Verifica con Conekta si la orden quedó pagada.
//  - Si pagó y NO hay reserva con ese paymentId: reembolsa, marca el
//    pending como `refunded` y notifica al admin. Esto cubre el caso
//    "cliente cerró la pestaña tras cobrar y el webhook tampoco recuperó
//    la reserva (firma mal configurada, fallo intermitente, etc.)".
//  - Si pagó y SÍ hay reserva: simplemente corrige el status a `consumed`.
//  - Si NO pagó: marca como `failed`.
//
// Idempotente: si una corrida cae a la mitad, la siguiente reintenta sólo
// las filas que sigan en `pending_payment`. La Idempotency-Key del refund
// (`refund_<chargeId>`) garantiza que reintentos no dupliquen reembolsos.
// =====================================================

const ORPHAN_TIMEOUT_MIN = 10;
const MAX_BATCH = 50;
/**
 * Conservamos snapshots terminales (consumed/refunded/failed) este tiempo
 * para investigaciones, luego se borran para evitar que la tabla crezca.
 */
const CLEANUP_AFTER_DAYS = 90;

interface PendingRow {
  id: string;
  payment_id: string | null;
  email: string;
  amount_cents: number;
  intent: "reservation" | "reschedule";
  created_at: string;
  notes: string | null;
}

export async function POST(request: NextRequest) {
  return runCron(request);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  // Auth: secreto cron, o admin con sesión.
  if (!isCronSecretAuthorized(request)) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.isAdmin) {
      return unauthorizedResponse("No autorizado");
    }
  }

  const supabase = createServiceRoleClient();
  const cutoffIso = new Date(Date.now() - ORPHAN_TIMEOUT_MIN * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("pending_reservations")
    .select("id, payment_id, email, amount_cents, intent, created_at, notes")
    .eq("status", "pending_payment")
    .not("payment_id", "is", null)
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error("[cron/refund-orphan] Error consultando pending_reservations:", error);
    return errorResponse("Error consultando huérfanos", 500);
  }

  const pending = (rows as PendingRow[] | null) ?? [];
  const summary = {
    candidates: pending.length,
    refunded: 0,
    recovered_consumed: 0,
    marked_failed: 0,
    errors: 0,
    cleaned: 0,
  };

  for (const row of pending) {
    if (!row.payment_id) continue;
    try {
      const result = await processOne(supabase, row);
      if (result === "refunded") summary.refunded += 1;
      else if (result === "consumed") summary.recovered_consumed += 1;
      else if (result === "failed") summary.marked_failed += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(
        "[cron/refund-orphan] Excepción procesando",
        row.payment_id,
        err,
      );
    }
  }

  // Limpieza: borra snapshots terminales y eventos webhook con `created_at`
  // muy viejo. Ejecutamos en cada corrida; los deletes son baratos porque
  // hay índices.
  try {
    const cleanupCutoffIso = new Date(
      Date.now() - CLEANUP_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { count: pendingCount } = await supabase
      .from("pending_reservations")
      .delete({ count: "exact" })
      .in("status", ["consumed", "refunded", "failed"])
      .lt("created_at", cleanupCutoffIso);
    summary.cleaned = pendingCount ?? 0;

    // Incluimos `failed` en la limpieza: si pasaron 90 días, ya no es
    // accionable (los `received` los dejamos por si revelan bugs de
    // procesamiento estancado, aunque el handler de duplicados ya
    // re-despacha huérfanos jóvenes).
    await supabase
      .from("conekta_webhook_events")
      .delete()
      .in("status", ["processed", "ignored", "failed"])
      .lt("created_at", cleanupCutoffIso);
  } catch (err) {
    console.error(
      "[cron/refund-orphan] Error limpiando snapshots/webhooks viejos:",
      err,
    );
  }

  await recordRefundOrphanCronSuccess(supabase);

  return successResponse(summary);
}

async function processOne(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: PendingRow,
): Promise<"refunded" | "consumed" | "failed" | "noop"> {
  const paymentId = row.payment_id!;

  // 1) Verificar contra Conekta.
  let order;
  try {
    order = await getConektaOrder(paymentId);
  } catch (err) {
    // 404: la orden no existe en Conekta (attempt_id quedó pero la orden
    // nunca llegó a crearse, o fue eliminada). Marca failed y limpia.
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      await supabase
        .from("pending_reservations")
        .update({
          status: "failed",
          notes: "Conekta devolvió 404 al consultar la orden.",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id)
        .eq("status", "pending_payment");
      return "failed";
    }

    console.error(
      "[cron/refund-orphan] No se pudo consultar Conekta para",
      paymentId,
      err,
    );
    // 5xx/red: blip transitorio. Reintentamos en la siguiente corrida.
    // Sólo alertamos UNA vez (cuando lleva > 60 min) para no hacer spam.
    const ageMin =
      (Date.now() - new Date(row.created_at).getTime()) / (60 * 1000);
    const alreadyAlerted =
      typeof row.notes === "string" &&
      row.notes.includes("Conekta inalcanzable");
    if (ageMin > 60 && !alreadyAlerted) {
      await sendAdminPaymentAlert({
        type: "orphan_payment_refund_failed",
        paymentId,
        customerEmail: row.email,
        notes: `Conekta inalcanzable hace ${Math.round(ageMin)} min. Revisa manualmente.`,
      });
      await supabase
        .from("pending_reservations")
        .update({
          notes: `Conekta inalcanzable; alerta admin enviada a las ${new Date().toISOString()}`,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id)
        .eq("status", "pending_payment");
    }
    return "noop";
  }

  if (order.payment_status !== "paid") {
    // Orden no pagada (declinada o expirada): marcar como failed y limpiar.
    await supabase
      .from("pending_reservations")
      .update({
        status: "failed",
        notes: `Conekta payment_status=${order.payment_status}`,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id)
      .eq("status", "pending_payment");
    return "failed";
  }

  // 2) Orden pagada: ¿hay reserva con ese paymentId?
  const [byPayment, byAdditional] = await Promise.all([
    supabase
      .from("reservations")
      .select("id")
      .eq("payment_id", paymentId)
      .maybeSingle(),
    supabase
      .from("reservations")
      .select("id")
      .eq("additional_payment_id", paymentId)
      .maybeSingle(),
  ]);
  const reservation = byPayment.data ?? byAdditional.data;

  if (reservation) {
    // Hay reserva: corregir status a `consumed` y seguir.
    const reservationId = (reservation as { id: number }).id;
    await supabase
      .from("pending_reservations")
      .update({
        status: "consumed",
        consumed_reservation_id: reservationId,
        updated_at: new Date().toISOString(),
        notes: "Reconciliado por cron: la reserva ya existía.",
      } as never)
      .eq("id", row.id)
      .eq("status", "pending_payment");
    return "consumed";
  }

  // 3) Pagado y sin reserva: HUÉRFANO. Reembolsar.
  const charge = findPaidCharge(order);
  if (!charge) {
    // Estado raro: payment_status=paid pero no hay charge pagado.
    await sendAdminPaymentAlert({
      type: "orphan_payment_refund_failed",
      paymentId,
      customerEmail: row.email,
      notes: "Order paid sin charge pagado: revisa Conekta manualmente.",
    });
    return "noop";
  }

  // 3.1) CLAIM atómico: marcamos el row como `refund_in_progress` y solo
  // procedemos si el UPDATE devolvió la fila. Si otro proceso ya tomó el
  // row (otro cron paralelo, o el webhook está consumiendo el snapshot),
  // este UPDATE no afectará nada y nos salimos.
  const { data: claimed, error: claimErr } = await supabase
    .from("pending_reservations")
    .update({
      status: "refund_in_progress",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();
  if (claimErr || !claimed) {
    // Otro proceso ya está manejando este pending; no interferimos.
    return "noop";
  }

  // 3.2) Pequeña espera para dar tiempo a que cualquier finalize en vuelo
  // (webhook recuperando reserva, o `/api/reservations/create` que entró
  // muy tarde) termine antes de tocar el cargo. Bajo latencia de Conekta o
  // Supabase, el INSERT puede tardar 2-3 s; 3 s da margen sin impacto real
  // en el cron (sólo entramos aquí con huérfanos > 10 min). Si tras la
  // espera la reserva ya existe, abortamos y reconciliamos.
  //
  // Trade-off residual: si finalize crea la reserva justo DESPUÉS del
  // recheck, reembolsaríamos a un cliente con reserva. Esto requiere que
  // finalize haya pasado todas las validaciones y empezado el INSERT
  // exactamente en la ventana entre el recheck y el `refundConektaCharge`,
  // con el pending en `refund_in_progress` (lo cual `finalize-reservation`
  // detecta en su check inicial y aborta con 409). Por eso, en la práctica,
  // la ventana es despreciable.
  await new Promise((r) => setTimeout(r, 3000));

  // Re-chequeo con dos queries en paralelo (en vez de `.or(...)` con
  // interpolación, que sería frágil si paymentId tuviera coma o paréntesis).
  const [byPayment2, byAdditional2] = await Promise.all([
    supabase
      .from("reservations")
      .select("id")
      .eq("payment_id", paymentId)
      .maybeSingle(),
    supabase
      .from("reservations")
      .select("id")
      .eq("additional_payment_id", paymentId)
      .maybeSingle(),
  ]);
  const recheckRow = byPayment2.data ?? byAdditional2.data;
  if (recheckRow) {
    const reservationId = (recheckRow as { id: number }).id;
    await supabase
      .from("pending_reservations")
      .update({
        status: "consumed",
        consumed_reservation_id: reservationId,
        updated_at: new Date().toISOString(),
        notes:
          "Reconciliado por cron: la reserva apareció justo antes del reembolso.",
      } as never)
      .eq("id", row.id)
      .eq("status", "refund_in_progress");
    return "consumed";
  }

  // 3.3) Procede con el reembolso.
  let refundOk = false;
  let alreadyRefunded = false;
  try {
    await refundConektaCharge(charge.id, charge.amount, `refund_${charge.id}`);
    refundOk = true;
  } catch (err) {
    // Si el cargo ya está reembolsado en Conekta (lo iniciamos antes y la
    // BD perdió la marca, o el admin reembolsó manualmente), tratamos como
    // éxito y dejamos que la lógica de `refunded` continúe sin alertar.
    if (isAlreadyRefundedError(err)) {
      alreadyRefunded = true;
      refundOk = true;
    } else {
      console.error(
        "[cron/refund-orphan] Reembolso falló para",
        paymentId,
        err,
      );
    }
  }

  if (refundOk) {
    await supabase
      .from("pending_reservations")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        notes: alreadyRefunded
          ? "Reconciliado: el cargo ya estaba reembolsado en Conekta."
          : `Reembolso automático: huérfano > ${ORPHAN_TIMEOUT_MIN} min sin reserva.`,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id)
      .eq("status", "refund_in_progress");
    // Si ya estaba reembolsado en Conekta (reconciliación silenciosa) no
    // mandamos alerta para evitar ruido — sólo si NOSOTROS reembolsamos ahora.
    if (!alreadyRefunded) {
      await sendAdminPaymentAlert({
        type: "orphan_payment_refunded",
        paymentId,
        chargeId: charge.id,
        customerEmail: row.email,
        amountMxn: Math.round(charge.amount) / 100,
        notes: `Pago huérfano (sin reserva creada en ${ORPHAN_TIMEOUT_MIN} min). Reembolsado por el cron.`,
      });
    }
    return "refunded";
  }

  // El reembolso falló: revertir claim para que se reintente en la siguiente
  // corrida y alertar al admin.
  await supabase
    .from("pending_reservations")
    .update({
      status: "pending_payment",
      notes: "Reembolso falló; reintentar en próxima corrida.",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "refund_in_progress");
  await sendAdminPaymentAlert({
    type: "orphan_payment_refund_failed",
    paymentId,
    chargeId: charge.id,
    customerEmail: row.email,
    amountMxn: Math.round(charge.amount) / 100,
    notes:
      "El cron intentó reembolsar y Conekta lanzó error. El cron reintentará en 5 min. Revisa el dashboard.",
  });
  return "noop";
}
