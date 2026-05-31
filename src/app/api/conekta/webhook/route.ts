import { NextRequest, NextResponse, after } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  verifyConektaWebhookSignature,
  extractWebhookIds,
  extractRefundIdFromChargeRefundedPayload,
  isConfirmedPaymentWebhookEvent,
  type ConektaWebhookEvent,
} from "@/lib/payments/conekta";
import { finalizeReservationFromPayload } from "@/lib/payments/finalize-reservation";
import {
  reconcileReservationRefundFromWebhook,
  recomputeReservationRefundStatus,
} from "@/lib/payments/refund-processor";
import { sendAdminPaymentAlert } from "@/lib/email";
import { runRefundCronStaleCheck } from "@/lib/cron/refund-orphan-heartbeat";
import { runRetryFailedRefundsCronStaleCheck } from "@/lib/cron/retry-failed-refunds-heartbeat";

type ServiceSupabase = ReturnType<typeof createServiceRoleClient>;

// Webhooks NUNCA deben cachearse: cada POST tiene un payload distinto y
// debe procesarse en vivo. Declaramos explícito por defensa.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Verificar firma + insertar evento + recuperar reserva con queries a
// Conekta (timeout interno 30s) y Supabase puede llegar a ~35s en peor
// caso. 120s da margen de sobra; si el endpoint excede, Conekta reintenta
// el webhook (se deduplica por event_id en la siguiente entrega).
export const maxDuration = 120;

/**
 * Webhook de Conekta.
 *
 * Responsabilidades:
 *
 * 1. Verificar la firma RSA-SHA256 del request (`CONEKTA_WEBHOOK_PUBLIC_KEY`).
 * 2. Persistir el evento en `conekta_webhook_events` (idempotencia por
 *    `event_id`: si ya terminó, 200 deduplicated; si sigue en `received`
 *    hace poco, 200 in_progress; si quedó `received` demasiado tiempo,
 *    re-despachamos porque la primera invocación probablemente murió).
 * 3. Despachar por `type`:
 *    - `order.paid` / `charge.paid` (y `charge.created` sólo si el cargo ya
 *      está `paid`): si la reserva no existe aún (cliente cerró pestaña),
 *      recuperar el snapshot de `pending_reservations` y crear la reserva vía
 *      helper compartido. Eventos con cargo `pending_payment` o declinado se
 *      ignoran (Conekta los manda antes del fallo final).
 *    - `charge.refunded`: reconciliar `reservation_refunds` (cancelaciones) y
 *      `recomputeReservationRefundStatus`; si no hay filas en esa tabla,
 *      actualizar `reservations` como antes (legacy). Notificar al admin si el
 *      refund fue iniciado fuera del flujo.
 *    - `charge.chargeback.*`: notificar al admin urgente.
 *    - `order.expired` / `order.canceled`: marcar pending como `failed`.
 *
 * 4. Marcar el evento como `processed` / `ignored` / `failed`.
 *
 * 5. Tras completar el dispatch (cualquier status), programar comprobación de
 *    heartbeats de crons externos (`runRefundCronStaleCheck` y
 *    `runRetryFailedRefundsCronStaleCheck` vía `after()` de Next.js): el
 *    objetivo es vigilar que los schedulers sigan vivos, no el éxito del
 *    evento puntual.
 *
 * IMPORTANTE: el body se lee como string raw para que la firma se calcule
 * sobre los mismos bytes que envió Conekta. No volver a serializar el JSON.
 */

// Conekta envía la firma en uno de estos headers según versión/configuración.
const SIGNATURE_HEADERS = [
  "digest",
  "x-conekta-signature",
  "conekta-signature",
];

/**
 * Cota máxima del body de un webhook. Conekta nunca manda payloads grandes
 * (típicamente <10KB), así que rechazamos cualquier cosa que parezca un
 * intento de DoS: un atacante podría intentar agotar la lambda mandando
 * MBs aunque no tenga firma válida (la verificamos *después* del read).
 */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  // 0) Cota de tamaño defensiva (Conekta envía payloads pequeños).
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_WEBHOOK_BODY_BYTES
  ) {
    console.warn(
      "[conekta-webhook] Body demasiado grande (declarado):",
      declaredLength,
    );
    return new NextResponse("Payload too large", { status: 413 });
  }

  // 1) Leer body raw.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error("[conekta-webhook] No se pudo leer el body:", err);
    return new NextResponse("Bad request", { status: 400 });
  }
  // Defensa adicional por si content-length venía mal o ausente.
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    console.warn(
      "[conekta-webhook] Body demasiado grande (real):",
      rawBody.length,
    );
    return new NextResponse("Payload too large", { status: 413 });
  }

  // 2) Verificar firma. fail-closed si el secreto no está configurado.
  const headerSig = pickFirstHeader(request, SIGNATURE_HEADERS);
  if (!verifyConektaWebhookSignature(rawBody, headerSig)) {
    console.error("[conekta-webhook] Firma inválida o ausente; rechazando.");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // 3) Parsear JSON.
  let event: ConektaWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ConektaWebhookEvent;
  } catch (err) {
    console.error("[conekta-webhook] Body no es JSON válido:", err);
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  if (
    !event ||
    typeof event !== "object" ||
    typeof event.id !== "string" ||
    event.id.length === 0 ||
    event.id.length > 256 ||
    typeof event.type !== "string" ||
    event.type.length === 0 ||
    event.type.length > 128
  ) {
    return new NextResponse("Invalid event", { status: 400 });
  }

  // 4) Persistir con idempotencia por event_id.
  const supabase = createServiceRoleClient();
  const { paymentId, chargeId } = extractWebhookIds(event);
  const { error: insertErr } = await supabase
    .from("conekta_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      payment_id: paymentId,
      charge_id: chargeId,
      raw_payload: event as never,
      signature: headerSig?.slice(0, 500) ?? null,
      status: "received",
    } as never);
  if (insertErr) {
    // 23505 = unique_violation: ya tenemos el evento en BD. Hay 3 casos:
    //   a) El evento ya fue procesado (status != 'received'): devolver
    //      deduplicated, no hay nada que hacer.
    //   b) El evento está en 'received' y lleva < 3 min: otra invocación
    //      lo está procesando ahora. Devolvemos 200 para que Conekta no
    //      reintente; la otra invocación lo completa.
    //   c) El evento está en 'received' y lleva ≥ 3 min: la primera
    //      invocación murió antes de completar el dispatch (timeout, crash).
    //      Re-despachamos en esta invocación. Sin esto el evento quedaría
    //      atascado y el cron tardaría 90 días en limpiarlo.
    if (insertErr.code === "23505") {
      const { data: existing } = await supabase
        .from("conekta_webhook_events")
        .select("status, created_at")
        .eq("event_id", event.id)
        .maybeSingle();
      const row = existing as
        | { status: string; created_at: string }
        | null;
      if (!row || row.status !== "received") {
        return NextResponse.json({
          ok: true,
          deduplicated: true,
          status: row?.status ?? "unknown",
        });
      }
      const ageMs = Date.now() - new Date(row.created_at).getTime();
      // Debe ser > `maxDuration` (120s): si la primera invocación sigue
      // viva, no re-despachamos en paralelo (evita doble finalize / emails).
      // 3 min da margen a latencia Conekta + BD sin solaparse con un run normal.
      const ORPHAN_REDISPATCH_AFTER_MS = 3 * 60 * 1000;
      if (!Number.isFinite(ageMs) || ageMs < 0) {
        console.warn(
          `[conekta-webhook] created_at inválido para ${event.id}; respondiendo in_progress (conservador)`,
        );
        return NextResponse.json({ ok: true, in_progress: true });
      }
      if (ageMs < ORPHAN_REDISPATCH_AFTER_MS) {
        return NextResponse.json({ ok: true, in_progress: true });
      }
      console.warn(
        `[conekta-webhook] Re-despachando evento huérfano ${event.id} (status='received' desde hace ${Math.round(
          ageMs / 1000,
        )}s, primera invocación murió)`,
      );
      // Caer al dispatch normal (no return).
    } else {
      console.error(
        "[conekta-webhook] No se pudo persistir el evento:",
        insertErr,
      );
      // CRÍTICO: si falla la persistencia por una razón distinta a
      // duplicado, NO procesamos. Sin la fila no hay idempotencia y los
      // reintentos de Conekta dispararían acciones (refunds, emails,
      // recoveries) duplicadas. Devolvemos 500 para que Conekta reintente.
      return new NextResponse("Persistence error", { status: 500 });
    }
  }

  // 5) Despachar (un solo cliente service-role para todo el request).
  try {
    const dispatchResult = await dispatchEvent(event, supabase);
    await markEventStatus(
      supabase,
      event.id,
      dispatchResult.status,
      dispatchResult.errorMessage,
    );
    // Heartbeat: vigila que el cron externo siga corriendo; no depende del
    // resultado del dispatch (processed / ignored / failed).
    after(() => {
      void runRefundCronStaleCheck(supabase).catch((err) => {
        console.error("[cron-heartbeat] runRefundCronStaleCheck falló:", err);
      });
      void runRetryFailedRefundsCronStaleCheck(supabase).catch((err) => {
        console.error(
          "[cron-heartbeat] runRetryFailedRefundsCronStaleCheck falló:",
          err,
        );
      });
    });
    // 200 aunque `status==='failed'`: el evento ya quedó en BD como failed;
    // un 5xx haría que Conekta reintente, pero el reintento cae en dedup y
    // no vuelve a ejecutar el dispatch (sólo re-despachamos `received` huérfanos).
    return NextResponse.json({ ok: true, ...dispatchResult });
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 1000) : "unknown error";
    console.error("[conekta-webhook] Excepción procesando evento:", err);
    await markEventStatus(supabase, event.id, "failed", message);
    // Devolvemos 500 para que Conekta reintente.
    return new NextResponse("Internal error", { status: 500 });
  }
}

// =====================================================
// Dispatcher
// =====================================================

interface DispatchResult {
  status: "processed" | "ignored" | "failed";
  reason?: string;
  errorMessage?: string;
}

async function dispatchEvent(
  event: ConektaWebhookEvent,
  supabase: ServiceSupabase,
): Promise<DispatchResult> {
  const type = event.type;

  switch (type) {
    case "order.paid":
    case "charge.created":
    case "charge.paid":
      return handleOrderPaid(event, supabase);

    case "charge.refunded":
      return handleChargeRefunded(event, supabase);

    case "charge.chargeback.created":
    case "charge.chargeback.updated":
    case "charge.chargeback.lost":
      return handleChargeback(event, type, supabase);

    case "order.expired":
    case "order.canceled":
      return handleOrderTerminal(event, type, supabase);

    default:
      return { status: "ignored", reason: `tipo no manejado: ${type}` };
  }
}

// =====================================================
// Handlers por tipo de evento
// =====================================================

async function handleOrderPaid(
  event: ConektaWebhookEvent,
  supabase: ServiceSupabase,
): Promise<DispatchResult> {
  const { paymentId } = extractWebhookIds(event);
  if (!paymentId) {
    return { status: "ignored", reason: "evento sin paymentId/orderId" };
  }

  const paymentCheck = isConfirmedPaymentWebhookEvent(event);
  if (!paymentCheck.confirmed) {
    const statusLabel =
      paymentCheck.chargeStatus ?? paymentCheck.paymentStatus ?? "desconocido";
    return {
      status: "ignored",
      reason: `${event.type} sin cobro confirmado (status=${statusLabel})`,
    };
  }

  // Si ya hay reserva con ese paymentId (como cargo principal o como cargo
  // adicional de reagendamiento), sólo nos aseguramos de marcar el pending
  // como consumed. Buscar ambas columnas evita falsos positivos de
  // "huérfano sin snapshot" cuando Conekta nos confirma un additional_payment
  // que `/reschedule/complete` ya consumió.
  const existingReservation = await findReservationByPaymentId(supabase, paymentId);

  if (existingReservation) {
    const reservationId = existingReservation.row.id;
    // Sólo marcamos consumed si el pending sigue en `pending_payment`. No
    // pisamos `refund_in_progress` (cron está reembolsando), `refunded`,
    // `failed` ni `consumed` (idempotente). `consumed_reservation_id` queda
    // alineado con el cron cuando reconcilia por `payment_id`.
    await supabase
      .from("pending_reservations")
      .update({
        status: "consumed",
        consumed_reservation_id: reservationId,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("payment_id", paymentId)
      .eq("status", "pending_payment");
    return { status: "processed", reason: "reserva ya existía" };
  }

  // No hay reserva: ¿hay snapshot pending para recuperarla?
  const { data: pendingRow } = await supabase
    .from("pending_reservations")
    .select("id, intent, status, payload, email, user_id")
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (!pendingRow) {
    // Pago sin snapshot ni reserva: orden creada por un flujo desconocido
    // o snapshot perdido. Notificamos al admin para revisión manual.
    await sendAdminPaymentAlert({
      type: "orphan_payment_no_snapshot",
      paymentId,
      webhookEventType: event.type,
      notes: `${event.type}: cobro confirmado sin reserva ni pending_reservations. Revisar en Conekta si la orden es legítima.`,
    });
    return {
      status: "processed",
      reason: "no había snapshot pending; alerta enviada",
    };
  }

  const pending = pendingRow as {
    id: string;
    intent: "reservation" | "reschedule";
    status: string;
    payload: Record<string, unknown>;
    email: string;
    user_id: string | null;
  };

  // Si el pending ya está en estado terminal o el cron lo está
  // reembolsando, no hacemos nada (no creamos reserva).
  if (
    pending.status === "consumed" ||
    pending.status === "refunded" ||
    pending.status === "failed" ||
    pending.status === "refund_in_progress"
  ) {
    return {
      status: "processed",
      reason: `pending ya estaba en estado ${pending.status}`,
    };
  }

  // Por ahora sólo recuperamos `intent='reservation'` desde el webhook.
  // Para reagendamientos, el pago adicional requiere lógica más delicada
  // (UPDATE optimista de la reserva existente con histórico) que vive en
  // `/reservations/[id]/reschedule/complete`. Si llega aquí un reschedule
  // huérfano, lo dejamos para que el cron lo reembolse.
  if (pending.intent !== "reservation") {
    return {
      status: "ignored",
      reason: `intent ${pending.intent} no se recupera vía webhook`,
    };
  }

  const payload = pending.payload as Record<string, unknown>;
  const result = await finalizeReservationFromPayload({
    email: pending.email,
    name: String(payload.name ?? ""),
    phone: String(payload.phone ?? ""),
    date: String(payload.date ?? ""),
    startTime: String(payload.startTime ?? ""),
    paymentId,
    sessionType: String(payload.sessionType ?? ""),
    photographerStudio:
      typeof payload.photographerStudio === "string"
        ? payload.photographerStudio
        : null,
    useLoyaltyDiscount: payload.useLoyaltyDiscount === true,
    useLoyaltyPoints: Number(payload.useLoyaltyPoints) || 0,
    useCredits: Number(payload.useCredits) || 0,
    discountCode:
      typeof payload.discountCode === "string" ? payload.discountCode : null,
    referralCode:
      typeof payload.referralCode === "string" ? payload.referralCode : null,
    authenticatedUserId: pending.user_id,
    pendingReservationId: pending.id,
    supabase,
  });

  if (result.ok) {
    // Sólo notificamos al admin si el webhook efectivamente creó la reserva.
    // Si el helper se topó con que ya existía (race con el flujo normal del
    // cliente), no es una "recuperación" sino una reconciliación silenciosa.
    if (!result.reconciledExisting) {
      await sendAdminPaymentAlert({
        type: "orphan_payment_recovered",
        paymentId,
        customerEmail: pending.email,
        reservationId: result.reservationId,
        amountMxn: result.finalPrice,
        notes:
          "El cliente cerró la pestaña tras pagar; el webhook creó la reserva automáticamente desde el snapshot.",
      });
      return { status: "processed", reason: "reserva recuperada vía webhook" };
    }
    return {
      status: "processed",
      reason: "reserva ya existía; pending reconciliado",
    };
  }

  // Si el helper falló y se reembolsó automáticamente, notificamos.
  if (result.refunded) {
    await sendAdminPaymentAlert({
      type: "orphan_payment_refunded",
      paymentId,
      customerEmail: pending.email,
      notes: result.message,
    });
    await supabase
      .from("pending_reservations")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        notes: result.message,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", pending.id)
      .eq("status", "pending_payment");
    return {
      status: "processed",
      reason: `reserva no recuperable; reembolsada (${result.message})`,
    };
  }

  // Falló sin reembolso (validación previa). Notificamos para revisión.
  await sendAdminPaymentAlert({
    type: "orphan_payment_refund_failed",
    paymentId,
    customerEmail: pending.email,
    notes: `Falla recuperando huérfano sin reembolso automático: ${result.message}`,
  });
  return {
    status: "failed",
    errorMessage: `recuperación falló: ${result.message}`,
  };
}

async function handleChargeRefunded(
  event: ConektaWebhookEvent,
  supabase: ServiceSupabase,
): Promise<DispatchResult> {
  const obj = event.data?.object ?? {};
  const chargeId = typeof obj.id === "string" ? obj.id : null;
  const orderId = typeof obj.order_id === "string" ? obj.order_id : null;
  if (!orderId && !chargeId) {
    return { status: "ignored", reason: "evento sin orderId/chargeId" };
  }

  // ¿Este refund vino de NUESTRO sistema (cron de huérfanos, finalize que
  // falló post-pago, /reschedule/complete con rollback)? En ese caso ya
  // marcamos el `pending_reservations` con `status='refunded'` desde la
  // ruta originadora; el webhook llega después como confirmación de
  // Conekta y no debemos spammear al admin.
  let initiatedInternally = false;
  if (orderId) {
    const { data: pendingRefunded } = await supabase
      .from("pending_reservations")
      .select("status")
      .eq("payment_id", orderId)
      .eq("status", "refunded")
      .maybeSingle();
    if (pendingRefunded) initiatedInternally = true;
  }

  // Localizar la reserva por payment_id o additional_payment_id.
  const reservation = orderId
    ? await findReservationByPaymentId(supabase, orderId)
    : null;

  const refundAmountMxn =
    typeof obj.amount === "number" ? Math.round(obj.amount) / 100 : null;

  // El payload de `charge.refunded` suele incluir `refunds.data[]` con el
  // recurso de reembolso (`ref_...`). Lo extraemos una vez para reusar
  // tanto en la rama nueva (reconcile) como en la legacy (sin filas en
  // reservation_refunds). Si Conekta no lo manda, cae a `chg_...` (= obj.id).
  const refundIdFromPayload = extractRefundIdFromChargeRefundedPayload(
    obj as Record<string, unknown>,
  );

  if (reservation) {
    const reservationRow = reservation.row;
    const isAdditional = reservation.column === "additional_payment_id";
    const previouslyPending = reservationRow.refund_status === "pending";

    const { count: rrCount, error: rrCountError } = await supabase
      .from("reservation_refunds")
      .select("id", { count: "exact", head: true })
      .eq("reservation_id", reservationRow.id);

    if (rrCountError) {
      console.error(
        "[conekta-webhook] charge.refunded: error contando reservation_refunds:",
        rrCountError,
      );
    }

    const hasReservationRefunds = (rrCount ?? 0) > 0;

    if (hasReservationRefunds) {
      const matchedOurRefund = await reconcileReservationRefundFromWebhook(
        supabase,
        {
          reservationId: reservationRow.id,
          chargeId,
          orderId,
          refundId: refundIdFromPayload,
        },
      );
      await recomputeReservationRefundStatus(supabase, reservationRow.id);

      // Si el webhook coincide con una fila nuestra de reservation_refunds,
      // este refund fue iniciado por nosotros (cron o cancelación inline).
      // Aunque `refund_status` ya esté `processed` (cancel inline rápido),
      // NO debemos alertar como si fuera externo.
      if (matchedOurRefund || initiatedInternally || previouslyPending) {
        return {
          status: "processed",
          reason: "refund confirmado (cancelación / interno; sin alerta)",
        };
      }
      // Reserva tiene filas de cancelación pero el cargo refundado no
      // coincide con ninguna: alguien hizo un refund manual sobre otro
      // cargo de esta reserva (raro). Alertar.
      await sendAdminPaymentAlert({
        type: "dashboard_refund_received",
        paymentId: orderId ?? chargeId ?? "(desconocido)",
        chargeId,
        customerEmail: reservationRow.email ?? null,
        reservationId: reservationRow.id,
        amountMxn: refundAmountMxn,
        notes: isAdditional
          ? "Reembolso del pago adicional de reagendamiento (no coincide con reservation_refunds; revisar)."
          : "Reembolso del pago inicial de reserva (no coincide con reservation_refunds; revisar).",
      });
      return { status: "processed", reason: "refund mapeado a reserva" };
    }

    const updateFields: Record<string, unknown> = {
      refund_status: "processed",
      refund_id: refundIdFromPayload,
    };
    if (refundAmountMxn !== null) {
      updateFields.refund_amount = refundAmountMxn;
    }
    await supabase
      .from("reservations")
      .update(updateFields as never)
      .eq("id", reservationRow.id);

    if (initiatedInternally || previouslyPending) {
      return {
        status: "processed",
        reason: "refund confirmado (iniciado internamente; sin alerta)",
      };
    }
    // Refund iniciado fuera del flujo (admin vía dashboard Conekta):
    // notificar al admin para que lo registre.
    await sendAdminPaymentAlert({
      type: "dashboard_refund_received",
      paymentId: orderId ?? chargeId ?? "(desconocido)",
      chargeId,
      customerEmail: reservationRow.email ?? null,
      reservationId: reservationRow.id,
      amountMxn: refundAmountMxn,
      notes: isAdditional
        ? "Reembolso del pago adicional de reagendamiento."
        : "Reembolso del pago inicial de reserva.",
    });
    return { status: "processed", reason: "refund mapeado a reserva" };
  }

  if (initiatedInternally) {
    return {
      status: "processed",
      reason: "refund de pending huérfano (iniciado internamente; sin alerta)",
    };
  }

  // Sin reserva asociada y sin trazas internas: probablemente reembolso
  // hecho desde el dashboard de Conekta sobre un pending desconocido o que
  // aún estaba en `pending_payment`. Marcamos cualquier pending con ese
  // payment_id como refunded para que el cron no intente reembolsar otra
  // vez (Conekta lo rechazaría por idempotencia, pero evitamos el ruido).
  if (orderId) {
    await supabase
      .from("pending_reservations")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        notes: "Refund desde dashboard de Conekta antes de consumir el pending.",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("payment_id", orderId)
      .in("status", ["pending_payment", "refund_in_progress"]);
  }
  await sendAdminPaymentAlert({
    type: "dashboard_refund_received",
    paymentId: orderId ?? chargeId ?? "(desconocido)",
    chargeId,
    amountMxn: refundAmountMxn,
    notes: "Reembolso recibido sin reserva asociada.",
  });
  return { status: "processed", reason: "refund sin reserva asociada" };
}

async function handleChargeback(
  event: ConektaWebhookEvent,
  type: string,
  supabase: ServiceSupabase,
): Promise<DispatchResult> {
  const obj = event.data?.object ?? {};
  const chargeId = typeof obj.id === "string" ? obj.id : null;
  const orderId = typeof obj.order_id === "string" ? obj.order_id : null;

  const reservation = orderId
    ? await findReservationByPaymentId(supabase, orderId)
    : null;

  const amountMxn =
    typeof obj.amount === "number" ? Math.round(obj.amount) / 100 : null;

  await sendAdminPaymentAlert({
    type: "chargeback_received",
    paymentId: orderId ?? chargeId ?? "(desconocido)",
    chargeId,
    customerEmail: reservation?.row.email ?? null,
    reservationId: reservation?.row.id ?? null,
    amountMxn,
    notes: `Tipo: ${type}. Revisa el dashboard de Conekta y la documentación del cliente.`,
  });

  return { status: "processed", reason: "alerta de chargeback enviada" };
}

async function handleOrderTerminal(
  event: ConektaWebhookEvent,
  type: string,
  supabase: ServiceSupabase,
): Promise<DispatchResult> {
  const { paymentId } = extractWebhookIds(event);
  if (!paymentId) {
    return { status: "ignored", reason: "evento sin paymentId" };
  }
  await supabase
    .from("pending_reservations")
    .update({
      status: "failed",
      notes: `Conekta reportó ${type}`,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("payment_id", paymentId)
    .eq("status", "pending_payment");
  return { status: "processed", reason: `pending marcado failed por ${type}` };
}

// =====================================================
// Helpers
// =====================================================

interface ReservationLookup {
  row: {
    id: number;
    email: string | null;
    refund_status: string | null;
  };
  column: "payment_id" | "additional_payment_id";
}

async function findReservationByPaymentId(
  supabase: ServiceSupabase,
  paymentId: string,
): Promise<ReservationLookup | null> {
  const [primary, additional] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, email, refund_status")
      .eq("payment_id", paymentId)
      .maybeSingle(),
    supabase
      .from("reservations")
      .select("id, email, refund_status")
      .eq("additional_payment_id", paymentId)
      .maybeSingle(),
  ]);
  if (primary.data) {
    return {
      row: primary.data as ReservationLookup["row"],
      column: "payment_id",
    };
  }
  if (additional.data) {
    return {
      row: additional.data as ReservationLookup["row"],
      column: "additional_payment_id",
    };
  }
  return null;
}

async function markEventStatus(
  supabase: ServiceSupabase,
  eventId: string,
  status: "processed" | "ignored" | "failed",
  errorMessage?: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("conekta_webhook_events")
      .update({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      } as never)
      .eq("event_id", eventId);
    if (error) {
      console.error("[conekta-webhook] markEventStatus error de Supabase:", error);
    }
  } catch (err) {
    console.error("[conekta-webhook] markEventStatus falló:", err);
  }
}

function pickFirstHeader(
  request: NextRequest,
  names: string[],
): string | null {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value) return value;
  }
  return null;
}

// Conekta espera 200/2xx para considerar el webhook como entregado.
// GET sirve para diagnósticos rápidos: comprueba que la ruta existe.
export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "Conekta webhook endpoint activo. Configura la clave pública RSA en CONEKTA_WEBHOOK_PUBLIC_KEY.",
  });
}
