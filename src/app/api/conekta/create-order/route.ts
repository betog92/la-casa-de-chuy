import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parse, startOfDay } from "date-fns";
import { randomUUID } from "crypto";
import axios from "axios";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeAuthoritativeReservationPrice } from "@/lib/payments/pricing-server";
import {
  createConektaOrder,
  findPaidCharge,
  formatConektaError,
  toCents,
} from "@/lib/payments/conekta";
import { sendAdminPaymentAlert } from "@/lib/email";
import { calculatePriceWithCustom } from "@/utils/pricing";
import {
  durationMinutesBetween,
  validateConsecutiveSlots,
  validateSlotAvailability,
} from "@/utils/reservation-helpers";
import { DEFAULT_DURATION_MIN } from "@/utils/reservation-variants";
import {
  formatDisplayDate,
  formatDisplayTimeInMonterrey,
} from "@/utils/formatters";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
} from "@/utils/api-response";
import { verifyGuestToken } from "@/lib/auth/guest-tokens";
import { getMonterreyToday } from "@/utils/business-days";
import { validateDateFormat, validateTimeFormat } from "@/utils/validation";
import { isSessionType } from "@/utils/session-type";
import type { Database } from "@/types/database.types";

const PHOTOGRAPHER_STUDIO_MAX = 500;

/**
 * Endpoint server-side autoritativo para crear cargos en Conekta.
 *
 * Diseño:
 * - El cliente NUNCA define el monto. Solo envía `intent` + token + contexto
 *   mínimo identificable (fecha+hora para reserva, reservationId para
 *   reagendamiento). El servidor calcula el precio con la BD y crea la orden
 *   con ese monto.
 * - La orden lleva en `metadata` el `intent`, el `expected_amount_cents`, el
 *   email y el id interno; los endpoints que finalizan la operación
 *   (`/reservations/create` y `/reservations/[id]/reschedule/complete`) los
 *   verifican antes de aceptar el `paymentId`.
 */

type ReservationIntentBody = {
  intent: "reservation";
  token: string; // token de Conekta (1 uso)
  reservation: {
    date: string; // 'yyyy-MM-dd'
    startTime: string; // 'HH:mm' o 'HH:mm:ss'
    contact: { name: string; email: string; phone: string };
    sessionType: string; // requerido (xv_anos | boda | casual)
    photographerStudio?: string | null;
    useLoyaltyDiscount?: boolean;
    useLoyaltyPoints?: number;
    useCredits?: number;
    discountCode?: string | null;
    referralCode?: string | null;
  };
};

type RescheduleIntentBody = {
  intent: "reschedule";
  token: string; // token de Conekta (1 uso)
  reservation: {
    id: number;
    newDate: string;
    newStartTime: string;
  };
  /** Token de invitado, opcional (para reservas sin sesión). */
  guestToken?: string;
};

type RequestBody = ReservationIntentBody | RescheduleIntentBody;

export async function POST(request: NextRequest) {
  if (!process.env.CONEKTA_PRIVATE_KEY) {
    return errorResponse(
      "Error de configuración: Conekta Private Key no encontrada",
      500,
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return validationErrorResponse("Cuerpo inválido");
  }

  if (!body || typeof body !== "object") {
    return validationErrorResponse("Cuerpo inválido");
  }
  if (!body.token || typeof body.token !== "string") {
    return validationErrorResponse("Token de tarjeta requerido");
  }

  if (body.intent === "reservation") {
    return handleReservationIntent(body);
  }
  if (body.intent === "reschedule") {
    return handleRescheduleIntent(body);
  }
  return validationErrorResponse(
    "intent inválido (esperado 'reservation' o 'reschedule')",
  );
}

// =====================================================
// Intent 1: pago inicial de una reserva nueva
// =====================================================

async function handleReservationIntent(body: ReservationIntentBody) {
  const { reservation } = body;
  if (!reservation) {
    return validationErrorResponse("Faltan datos de la reserva");
  }
  const {
    date,
    startTime,
    contact,
    sessionType,
    photographerStudio,
    useLoyaltyDiscount,
    useLoyaltyPoints,
    useCredits,
    discountCode,
    referralCode,
  } = reservation;

  if (!date || !startTime) {
    return validationErrorResponse("Faltan fecha y hora de la reserva");
  }
  if (!validateDateFormat(date)) {
    return validationErrorResponse("Formato de fecha inválido (yyyy-MM-dd)");
  }
  if (!validateTimeFormat(startTime)) {
    return validationErrorResponse("Formato de hora inválido (HH:mm)");
  }
  if (
    !contact ||
    !contact.name ||
    !contact.email ||
    !contact.phone ||
    typeof contact.name !== "string" ||
    typeof contact.email !== "string" ||
    typeof contact.phone !== "string" ||
    contact.name.trim() === "" ||
    contact.email.trim() === "" ||
    contact.phone.trim() === ""
  ) {
    return validationErrorResponse(
      "Faltan datos de contacto (name, email, phone)",
    );
  }
  // sessionType: validar acá también para no cobrar y luego rechazar en /create.
  const sessionTypeNorm = String(sessionType ?? "").trim();
  if (!sessionTypeNorm || !isSessionType(sessionTypeNorm)) {
    return validationErrorResponse(
      "Tipo de sesión inválido (xv_anos, boda, casual)",
    );
  }
  // photographerStudio: opcional, pero si viene, mismo límite que /reservations/create.
  if (
    photographerStudio != null &&
    typeof photographerStudio === "string" &&
    photographerStudio.length > PHOTOGRAPHER_STUDIO_MAX
  ) {
    return validationErrorResponse(
      `Fotógrafo/estudio: máximo ${PHOTOGRAPHER_STUDIO_MAX} caracteres`,
    );
  }

  // Validar fecha futura
  let parsedDate: Date;
  try {
    parsedDate = parse(date, "yyyy-MM-dd", new Date());
  } catch {
    return validationErrorResponse("Formato de fecha inválido");
  }
  if (startOfDay(parsedDate) < getMonterreyToday()) {
    return validationErrorResponse("No se puede reservar una fecha pasada");
  }

  // Resolver usuario autenticado (si hay sesión)
  const authenticatedUserId = await getAuthenticatedUserId();

  const supabase = createServiceRoleClient();
  const normalizedEmail = contact.email.toLowerCase().trim();

  // Validar disponibilidad ANTES de cobrar: si dos clientes intentan tomar el
  // mismo slot, sólo el primero llega a Conekta. El segundo recibe 409 sin
  // cargo (mucho mejor UX que cobrar y reembolsar después).
  const isAvailable = await validateSlotAvailability(supabase, date, startTime);
  if (!isAvailable) {
    return conflictResponse(
      "El horario seleccionado ya no está disponible. Selecciona otro.",
    );
  }

  // Calcular precio autoritativo (única fuente de verdad)
  const priceResult = await computeAuthoritativeReservationPrice(supabase, {
    dateString: date,
    contactEmail: normalizedEmail,
    userId: authenticatedUserId,
    useLoyaltyDiscount: useLoyaltyDiscount === true,
    useLoyaltyPoints: Number(useLoyaltyPoints) || 0,
    useCredits: Number(useCredits) || 0,
    discountCode: discountCode ?? null,
    referralCode: referralCode ?? null,
  });

  if (!priceResult.ok) {
    return validationErrorResponse(priceResult.message);
  }

  if (priceResult.finalPrice <= 0) {
    return validationErrorResponse(
      "Esta reserva no requiere pago con tarjeta. Recarga la página.",
    );
  }

  const description = `Reserva ${formatDisplayDate(date)} ${formatDisplayTimeInMonterrey(
    startTime,
    date,
  )}`;

  const attemptId = randomUUID();

  // 1) Insertar snapshot ANTES de cobrar. Si el cliente cierra la pestaña
  //    tras cobrar, el webhook (`order.paid`) lee este snapshot y crea la
  //    reserva. Si nadie la consume en 10 min, el cron reembolsa.
  const pendingPayload = {
    name: contact.name.trim(),
    phone: contact.phone,
    date,
    startTime,
    sessionType: sessionTypeNorm,
    photographerStudio:
      photographerStudio == null || photographerStudio === ""
        ? null
        : String(photographerStudio).trim().slice(0, PHOTOGRAPHER_STUDIO_MAX),
    useLoyaltyDiscount: useLoyaltyDiscount === true,
    useLoyaltyPoints: Number(useLoyaltyPoints) || 0,
    useCredits: Number(useCredits) || 0,
    discountCode: discountCode ?? null,
    referralCode: referralCode ?? null,
  };
  const { data: pendingRow, error: pendingErr } = await supabase
    .from("pending_reservations")
    .insert({
      attempt_id: attemptId,
      intent: "reservation",
      status: "pending_payment",
      payload: pendingPayload,
      amount_cents: toCents(priceResult.finalPrice),
      email: normalizedEmail,
      user_id: authenticatedUserId,
    } as never)
    .select("id")
    .single();
  if (pendingErr || !pendingRow) {
    console.error("Error guardando pending_reservations:", pendingErr);
    return errorResponse(
      "No se pudo iniciar el pago. Intenta nuevamente.",
      500,
    );
  }
  const pendingId = (pendingRow as { id: string }).id;

  try {
    const order = await createConektaOrder({
      amountMxn: priceResult.finalPrice,
      description,
      customer: {
        name: contact.name.trim(),
        email: normalizedEmail,
        phone: contact.phone,
      },
      conektaToken: body.token,
      idempotencyKey: attemptId,
      metadata: {
        intent: "reservation",
        attempt_id: attemptId,
        pending_id: pendingId,
        expected_amount_cents: toCents(priceResult.finalPrice),
        email: normalizedEmail,
        date,
        start_time: startTime,
      },
    });

    const charge = findPaidCharge(order);
    if (!charge || order.payment_status !== "paid") {
      // Cobro NO ocurrió: marcar pending como failed (no hay nada que reembolsar).
      await supabase
        .from("pending_reservations")
        .update({
          status: "failed",
          notes: "Conekta no devolvió payment_status=paid",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", pendingId);
      return errorResponse(
        charge?.failure_message ||
          charge?.failure_code ||
          "El pago no fue procesado correctamente",
        400,
      );
    }

    // 2) Persistir el order.id en el snapshot (sirve al webhook y al cron).
    await supabase
      .from("pending_reservations")
      .update({
        payment_id: order.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", pendingId);

    return successResponse({
      orderId: order.id,
      chargeId: charge.id,
      paymentStatus: order.payment_status,
      expectedAmount: priceResult.finalPrice,
    });
  } catch (err) {
    console.error("Error creando orden Conekta (reservation):", err);
    // Conekta lanzó: probablemente no cobró, pero un 5xx/timeout puede
    // significar que SÍ cobró y no nos devolvió el order.id. En ese caso
    // alertamos al admin para revisión manual del dashboard.
    await markPendingFailedAndMaybeAlert(supabase, pendingId, err, {
      paymentId: null,
      customerEmail: normalizedEmail,
      attemptId,
      context: "reservation",
    });
    const { message, status } = formatConektaError(err);
    return errorResponse(message, status && status >= 400 && status < 500 ? 400 : 500);
  }
}

// =====================================================
// Intent 2: pago adicional para reagendar una reserva
// =====================================================

async function handleRescheduleIntent(body: RescheduleIntentBody) {
  const { reservation, guestToken: invitedToken } = body;
  if (!reservation) {
    return validationErrorResponse("Faltan datos del reagendamiento");
  }
  const reservationId = Number(reservation.id);
  const newDate = reservation.newDate;
  const newStartTime = reservation.newStartTime;
  if (
    !Number.isFinite(reservationId) ||
    reservationId <= 0 ||
    !newDate ||
    !newStartTime
  ) {
    return validationErrorResponse(
      "Faltan id, newDate o newStartTime para reagendar",
    );
  }
  if (!validateDateFormat(newDate)) {
    return validationErrorResponse("Formato de fecha inválido (yyyy-MM-dd)");
  }
  if (!validateTimeFormat(newStartTime)) {
    return validationErrorResponse("Formato de hora inválido (HH:mm)");
  }

  // Validar fecha futura
  let parsedDate: Date;
  try {
    parsedDate = parse(newDate, "yyyy-MM-dd", new Date());
  } catch {
    return validationErrorResponse("Formato de fecha inválido");
  }
  if (startOfDay(parsedDate) < getMonterreyToday()) {
    return validationErrorResponse(
      "No se puede reagendar a una fecha pasada",
    );
  }

  const supabase = createServiceRoleClient();
  const { data: row, error: fetchErr } = await supabase
    .from("reservations")
    .select(
      "id, user_id, status, reschedule_count, date, start_time, end_time, price, email, name, phone",
    )
    .eq("id", reservationId)
    .single();
  if (fetchErr || !row) {
    return notFoundResponse("Reserva");
  }
  const reservationRow = row as {
    id: number;
    user_id: string | null;
    status: string;
    reschedule_count: number | null;
    date: string;
    start_time: string | null;
    end_time: string | null;
    price: number;
    email: string | null;
    name: string | null;
    phone: string | null;
  };

  if (reservationRow.status !== "confirmed") {
    return errorResponse("Solo se pueden reagendar reservas confirmadas", 400);
  }

  // Validar autorización: usuario autenticado dueño/admin O guestToken válido
  const userId = await getAuthenticatedUserId();
  let isAdmin = false;
  if (userId) {
    if (reservationRow.user_id !== userId) {
      // Verificar admin
      const { data: adminRow } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", userId)
        .maybeSingle();
      isAdmin =
        !!adminRow && (adminRow as { is_admin: boolean | null }).is_admin === true;
      if (!isAdmin) {
        return unauthorizedResponse(
          "No tienes permisos para reagendar esta reserva",
        );
      }
    }
  } else if (invitedToken) {
    const tokenResult = await verifyGuestToken(invitedToken);
    if (!tokenResult.valid || !tokenResult.payload) {
      return unauthorizedResponse(
        tokenResult.error || "Token inválido o expirado",
      );
    }
    const tokenEmail = (tokenResult.payload.email || "").toLowerCase().trim();
    const reservationEmail = (reservationRow.email || "").toLowerCase().trim();
    if (
      tokenEmail !== reservationEmail ||
      tokenResult.payload.reservationId !== String(reservationId)
    ) {
      return unauthorizedResponse(
        "No tienes permisos para reagendar esta reserva",
      );
    }
  } else {
    return unauthorizedResponse(
      "Debes iniciar sesión o proporcionar un token válido para reagendar",
    );
  }

  // Validar límite de reagendamientos ANTES de cobrar (admin no aplica).
  // /complete también lo valida, pero hacerlo aquí evita cobros que después
  // habría que reembolsar.
  if (!isAdmin && (reservationRow.reschedule_count || 0) >= 1) {
    return errorResponse(
      "Solo se permite un reagendamiento por reserva. Ya has utilizado tu intento.",
      400,
    );
  }

  // Validar disponibilidad de los slots consecutivos requeridos por la duración original
  const originalDurationMin = durationMinutesBetween(
    String(reservationRow.start_time ?? ""),
    String(reservationRow.end_time ?? ""),
  );
  const slotsCount = Math.max(
    1,
    Math.round(originalDurationMin / DEFAULT_DURATION_MIN),
  );
  const isAvailable = await validateConsecutiveSlots(
    supabase,
    newDate,
    newStartTime,
    slotsCount,
  );
  if (!isAvailable) {
    return conflictResponse(
      slotsCount > 1
        ? "El nuevo horario no tiene 2 bloques consecutivos disponibles (90 min)."
        : "El horario seleccionado ya no está disponible.",
    );
  }

  // Calcular monto adicional autoritativo (precio nueva fecha − precio actual)
  const newPrice = await calculatePriceWithCustom(supabase, parsedDate);
  const currentPrice = Number(reservationRow.price ?? 0);
  if (!Number.isFinite(currentPrice)) {
    return errorResponse(
      "El precio actual de la reserva está corrupto. Contacta a soporte.",
      500,
    );
  }
  const additionalAmount = Math.round((newPrice - currentPrice) * 100) / 100;
  if (additionalAmount <= 0) {
    return validationErrorResponse(
      "Este reagendamiento no requiere pago adicional. Recarga la página.",
    );
  }

  const description = `Pago adicional reagendamiento #${reservationId} - ${formatDisplayDate(newDate)} ${formatDisplayTimeInMonterrey(newStartTime, newDate)}`;
  const normalizedEmail = (reservationRow.email || "").toLowerCase().trim();
  const customerName = (reservationRow.name || "Cliente").trim() || "Cliente";
  // Conekta rechaza ordenes sin teléfono; usamos el de la reserva o un fallback seguro
  const customerPhone = (reservationRow.phone || "").trim() || "0000000000";
  const attemptId = randomUUID();

  // Snapshot del reagendamiento. Si /complete falla pero el cobro se hizo,
  // el cron de huérfanos reembolsa a los 10 min.
  const reschedulePayload = {
    reservationId,
    newDate,
    newStartTime,
    guestToken: invitedToken ?? null,
  };
  const { data: pendingRow, error: pendingErr } = await supabase
    .from("pending_reservations")
    .insert({
      attempt_id: attemptId,
      intent: "reschedule",
      status: "pending_payment",
      payload: reschedulePayload,
      amount_cents: toCents(additionalAmount),
      email: normalizedEmail,
      user_id: userId,
    } as never)
    .select("id")
    .single();
  if (pendingErr || !pendingRow) {
    console.error("Error guardando pending_reservations (reschedule):", pendingErr);
    return errorResponse(
      "No se pudo iniciar el pago. Intenta nuevamente.",
      500,
    );
  }
  const pendingId = (pendingRow as { id: string }).id;

  try {
    const order = await createConektaOrder({
      amountMxn: additionalAmount,
      description,
      customer: {
        name: customerName,
        email: normalizedEmail,
        phone: customerPhone,
      },
      conektaToken: body.token,
      idempotencyKey: attemptId,
      metadata: {
        intent: "reschedule",
        attempt_id: attemptId,
        pending_id: pendingId,
        reservation_id: reservationId,
        expected_amount_cents: toCents(additionalAmount),
        email: normalizedEmail,
        new_date: newDate,
        new_start_time: newStartTime,
      },
    });

    const charge = findPaidCharge(order);
    if (!charge || order.payment_status !== "paid") {
      await supabase
        .from("pending_reservations")
        .update({
          status: "failed",
          notes: "Conekta no devolvió payment_status=paid",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", pendingId);
      return errorResponse(
        charge?.failure_message ||
          charge?.failure_code ||
          "El pago no fue procesado correctamente",
        400,
      );
    }

    await supabase
      .from("pending_reservations")
      .update({
        payment_id: order.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", pendingId);

    return successResponse({
      orderId: order.id,
      chargeId: charge.id,
      paymentStatus: order.payment_status,
      expectedAmount: additionalAmount,
    });
  } catch (err) {
    console.error("Error creando orden Conekta (reschedule):", err);
    await markPendingFailedAndMaybeAlert(supabase, pendingId, err, {
      paymentId: null,
      customerEmail: normalizedEmail,
      attemptId,
      context: "reschedule",
    });
    const { message, status } = formatConektaError(err);
    return errorResponse(message, status && status >= 400 && status < 500 ? 400 : 500);
  }
}

// =====================================================
// Helpers
// =====================================================

/**
 * Marca el pending como `failed` y, si el error sugiere que Conekta pudo
 * haber cobrado (5xx, timeout, error de red), avisa al admin para que
 * revise el dashboard. Esto cubre el caso peligroso "Conekta cobra pero
 * no devuelve order.id porque la conexión cayó".
 */
async function markPendingFailedAndMaybeAlert(
  supabase: ReturnType<typeof createServiceRoleClient>,
  pendingId: string,
  err: unknown,
  meta: {
    paymentId: string | null;
    customerEmail: string;
    attemptId: string;
    context: "reservation" | "reschedule";
  },
): Promise<void> {
  const errMessage =
    err instanceof Error ? err.message.slice(0, 500) : "exception";
  await supabase
    .from("pending_reservations")
    .update({
      status: "failed",
      notes: errMessage,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", pendingId);

  const possiblyCharged =
    axios.isAxiosError(err) &&
    (((err.response?.status ?? 0) >= 500) ||
      err.code === "ECONNABORTED" ||
      err.code === "ETIMEDOUT");
  if (!possiblyCharged) return;

  try {
    await sendAdminPaymentAlert({
      type: "orphan_payment_refund_failed",
      paymentId: meta.paymentId ?? `(sin order.id; attempt_id=${meta.attemptId})`,
      customerEmail: meta.customerEmail,
      notes: `Conekta lanzó ${
        axios.isAxiosError(err) ? err.response?.status ?? err.code : "error"
      } al crear orden de ${meta.context}. Es POSIBLE que SÍ haya cobrado al cliente y no nos haya devuelto el order.id. Busca en el dashboard de Conekta órdenes con metadata.attempt_id=${meta.attemptId} y reembolsa manualmente si aplica.`,
    });
  } catch (alertErr) {
    console.error(
      "[create-order] No se pudo enviar alerta admin (posible cobro huérfano):",
      alertErr,
    );
  }
}

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // server-only: no setear cookies aquí
          },
        },
      },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
