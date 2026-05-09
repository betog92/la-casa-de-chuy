import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateConsecutiveSlots,
  formatTimeToSeconds,
  durationMinutesBetween,
} from "@/utils/reservation-helpers";
import { calculatePriceWithCustom } from "@/utils/pricing";
import { parse } from "date-fns";
import { DEFAULT_DURATION_MIN } from "@/utils/reservation-variants";
import { validateDateFormat, validateTimeFormat } from "@/utils/validation";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
  conflictResponse,
} from "@/utils/api-response";
import {
  sendRescheduleConfirmation,
} from "@/lib/email";
import { verifyGuestToken, generateGuestToken, generateGuestReservationUrl } from "@/lib/auth/guest-tokens";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getConektaOrder,
  findPaidCharge,
  refundConektaCharge,
  toCents,
} from "@/lib/payments/conekta";
import type { Database } from "@/types/database.types";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationUpdate = Database["public"]["Tables"]["reservations"]["Update"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Lo extraemos antes del try para poder reembolsar en el catch outer.
  let paymentIdForRefund: string | null = null;
  try {
    const { id: rawId } = await params;
    const reservationId =
      typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
    if (isNaN(reservationId) || reservationId <= 0) {
      return validationErrorResponse("ID de reserva inválido");
    }

    // Obtener el cuerpo de la solicitud
    let body: {
      date?: string;
      startTime?: string;
      paymentId?: string;
      additionalAmount?: number;
      token?: string;
    } = {};
    try {
      body = await request.json();
    } catch {
      // Si no hay body o es inválido, body queda como objeto vacío
    }
    const { date, startTime, paymentId, additionalAmount, token: guestToken } = body;
    paymentIdForRefund =
      typeof paymentId === "string" && paymentId.trim() !== ""
        ? paymentId
        : null;

    // Obtener el usuario autenticado
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
            // No necesitamos establecer cookies aquí
          },
        },
      }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    let isAdmin = false;
    if (user) {
      const adminCheck = await requireAdmin();
      isAdmin = adminCheck.isAdmin;
    }

    // Validar campos requeridos (paymentId se exige sólo si hay monto adicional)
    if (!date || !startTime) {
      return validationErrorResponse("Fecha y hora son requeridas");
    }
    if (!validateDateFormat(date)) {
      return validationErrorResponse("Formato de fecha inválido (yyyy-MM-dd)");
    }
    if (!validateTimeFormat(startTime)) {
      return validationErrorResponse("Formato de hora inválido (HH:mm)");
    }

    // Obtener la reserva
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, status, reschedule_count, date, start_time, end_time, payment_id, email, price"
      )
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Type assertion para ayudar a TypeScript
    const reservationRow = reservation as Pick<
      ReservationRow,
      "id" | "user_id" | "status" | "reschedule_count" | "date" | "start_time" | "end_time" | "payment_id" | "email" | "price"
    >;

    // Validar autorización: usuario autenticado O token de invitado (admin puede completar cualquier reserva)
    if (user) {
      if (reservationRow.user_id !== user.id && !isAdmin) {
        return unauthorizedResponse(
          "No tienes permisos para completar el reagendamiento de esta reserva"
        );
      }
    } else if (guestToken) {
      // Invitado: verificar token
      const tokenResult = await verifyGuestToken(guestToken);
      if (!tokenResult.valid || !tokenResult.payload) {
        return unauthorizedResponse(
          tokenResult.error || "Token inválido o expirado"
        );
      }

      // Verificar que el email del token coincide con el email de la reserva
      const tokenEmail = (tokenResult.payload.email || "").toLowerCase().trim();
      const reservationEmail = ((reservationRow.email as string) || "").toLowerCase().trim();
      if (tokenEmail !== reservationEmail || tokenResult.payload.reservationId !== String(reservationId)) {
        return unauthorizedResponse(
          "No tienes permisos para completar el reagendamiento de esta reserva"
        );
      }
    } else {
      // Sin autenticación ni token
      return unauthorizedResponse(
        "Debes iniciar sesión o proporcionar un token válido para completar el reagendamiento"
      );
    }

    // Verificar que el status es 'confirmed'
    if (reservationRow.status !== "confirmed") {
      return errorResponse(
        "Solo se pueden reagendar reservas confirmadas",
        400
      );
    }

    // Verificar límite de reagendamientos (admin no aplica)
    if (!isAdmin && (reservationRow.reschedule_count || 0) >= 1) {
      return errorResponse(
        "Solo se permite un reagendamiento por reserva. Ya has utilizado tu intento.",
        400
      );
    }

    // Preservar duración original (45 min normal, 90 min para citas Alvero)
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
      date,
      startTime,
      slotsCount,
    );
    if (!isAvailable) {
      // Si el cliente ya pagó por adelantado y el slot acaba de ocuparse,
      // reembolsamos automáticamente para no dejar dinero flotando.
      if (paymentId) {
        await safeRefundOrder(paymentId);
      }
      return conflictResponse(
        slotsCount > 1
          ? "Para reagendar esta cita Alvero se necesitan 2 bloques consecutivos disponibles (90 min). " +
              (paymentId ? "El cargo adicional será reembolsado." : "Elige otro horario.")
          : "El horario seleccionado ya no está disponible. " +
              (paymentId ? "El cargo adicional será reembolsado." : "Por favor selecciona otro horario."),
      );
    }

    // Recalcular el monto adicional autoritativo (precio nueva fecha − precio actual).
    // `reservationRow.price` viene del driver como `number`, pero algunos
    // entornos (p.ej. drivers de Postgres con NUMERIC sin cast) podrían
    // devolverlo como string. `Number(...)` evita concatenaciones accidentales.
    const parsedNewDate = parse(date, "yyyy-MM-dd", new Date());
    const newPrice = await calculatePriceWithCustom(supabase, parsedNewDate);
    const currentPrice = Number(reservationRow.price ?? 0);
    if (!Number.isFinite(currentPrice)) {
      return errorResponse(
        "El precio actual de la reserva está corrupto. Contacta a soporte.",
        500,
      );
    }
    const serverAdditionalAmount =
      Math.round((newPrice - currentPrice) * 100) / 100;

    // Si hay monto adicional, exigir y verificar paymentId contra Conekta
    if (serverAdditionalAmount > 0) {
      if (!paymentId) {
        return validationErrorResponse(
          "Este reagendamiento requiere un pago adicional con tarjeta.",
        );
      }
      const verifyError = await verifyConektaOrderForReschedule({
        paymentId,
        expectedAmount: serverAdditionalAmount,
        expectedReservationId: reservationId,
        expectedEmail: ((reservationRow.email as string) || "").toLowerCase().trim(),
        supabase,
      });
      if (verifyError) {
        // Inconsistencia "real" (monto distinto, Conekta inalcanzable):
        // sí reembolsamos. Para sospecha (intent/email/reservation_id no
        // coinciden) no reembolsamos: o no nos pertenece, o devolverlo
        // perjudicaría a otra reserva que sí usa ese paymentId.
        if (
          verifyError.startsWith("El monto cobrado") ||
          verifyError.startsWith("No se pudo verificar")
        ) {
          await safeRefundOrder(paymentId);
          return errorResponse(
            `${verifyError} Tu pago será reembolsado automáticamente.`,
            400,
          );
        }
        return errorResponse(verifyError, 400);
      }
    } else {
      // No requiere pago adicional. Si el cliente envió paymentId, lo
      // reembolsamos best-effort (probable race con cambio de tarifa) y
      // pedimos recargar.
      if (paymentId) {
        await safeRefundOrder(paymentId);
        return validationErrorResponse(
          "Este reagendamiento no requiere pago adicional. Tu pago será reembolsado automáticamente. Recarga la página.",
        );
      }
    }

    // Si el cliente envió un additionalAmount manualmente, ignoramos el suyo
    // y usamos el calculado por el servidor (no se cobra ni se guarda otra cosa).
    void additionalAmount;

    const endTime = calculateEndTime(startTime, originalDurationMin);

    // Guardar valores originales antes de actualizar (solo si es la primera vez que se reagenda)
    const updateData: ReservationUpdate = {
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      reschedule_count: (reservationRow.reschedule_count || 0) + 1,
    };

    if (serverAdditionalAmount > 0 && paymentId) {
      updateData.additional_payment_id = paymentId;
      updateData.additional_payment_amount = serverAdditionalAmount;
      updateData.additional_payment_method = "conekta";
      updateData.price = currentPrice + serverAdditionalAmount;
    }

    // Si es la primera vez que se reagenda, guardar valores originales
    if ((reservationRow.reschedule_count || 0) === 0) {
      updateData.original_date = reservationRow.date;
      updateData.original_start_time = reservationRow.start_time;
      if (reservationRow.payment_id) {
        updateData.original_payment_id = reservationRow.payment_id;
      }
    }

    // Actualizar la reserva (optimistic lock: solo si reschedule_count no cambió)
    const currentRescheduleCount = reservationRow.reschedule_count ?? 0;
    const { data: updatedReservation, error: updateError } = await supabase
      .from("reservations")
      // @ts-expect-error - TypeScript tiene problemas con tipos de Supabase cuando se usan selects parciales
      .update(updateData)
      .eq("id", reservationId)
      .eq("reschedule_count", currentRescheduleCount)
      .select("email, name, date, start_time, additional_payment_amount")
      .single();

    if (updateError) {
      const noRows =
        updateError.code === "PGRST116" ||
        String(updateError.message || "").includes("0 row");
      // Si ya cobramos al cliente y la actualización falló, reembolsar para no
      // dejar dinero flotando.
      if (serverAdditionalAmount > 0 && paymentId) {
        await safeRefundOrder(paymentId);
      }
      if (noRows) {
        return conflictResponse(
          "La reserva pudo haber cambiado. " +
            (serverAdditionalAmount > 0
              ? "El cargo adicional será reembolsado en breve."
              : "Intenta de nuevo."),
        );
      }
      console.error("Error completing reschedule:", updateError);
      return errorResponse(
        "Error al completar el reagendamiento" +
          (serverAdditionalAmount > 0
            ? ". El cargo adicional será reembolsado."
            : ""),
        500,
      );
    }

    // Registrar en historial de reagendamientos (cliente, pago en línea).
    // `rescheduled_by_user_id`: si hay usuario autenticado lo guardamos; si
    // es invitado (guestToken), queda null porque no hay row en `users`.
    const hasAdditional = serverAdditionalAmount > 0 && !!paymentId;
    const prevTime = String(reservationRow.start_time ?? "00:00").trim() || "00:00";
    await supabase.from("reservation_reschedule_history").insert({
      reservation_id: reservationId,
      rescheduled_by_user_id: user?.id ?? null,
      previous_date: reservationRow.date,
      previous_start_time: formatTimeToSeconds(prevTime),
      new_date: date,
      new_start_time: formatTimeToSeconds(startTime),
      additional_payment_amount: hasAdditional ? serverAdditionalAmount : null,
      additional_payment_method: hasAdditional ? "conekta" : null,
    } as never);

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const row = updatedReservation as {
      email?: string | null;
      name?: string | null;
      date?: string;
      start_time?: string | null;
      additional_payment_amount?: number | null;
    };
    let manageUrl: string;
    if (reservationRow.user_id) {
      manageUrl = `${baseUrl}/reservaciones/${reservationId}`;
    } else {
      const token = guestToken
        ?? await generateGuestToken((row.email ?? "").trim().toLowerCase(), reservationId);
      manageUrl = generateGuestReservationUrl(token);
    }
    const to = (row.email || "").trim();
    const name = (row.name || "Cliente").trim();

    if (to) {
      sendRescheduleConfirmation({
        to,
        name,
        date: row.date || "",
        startTime: row.start_time || "00:00",
        reservationId,
        manageUrl,
        additionalAmount: row.additional_payment_amount ?? null,
      })
        .then((r) => {
          if (!r.ok) console.error("Error email reagendamiento:", r.error);
        })
        .catch((e) =>
          console.error("Error inesperado enviando email reagendamiento:", e)
        );
    }

    return successResponse({
      message: "Reagendamiento completado exitosamente",
      reservation: updatedReservation,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error al completar el reagendamiento";
    console.error("Error inesperado:", error);
    // Excepción no controlada DESPUÉS de un cobro adicional: reembolso
    // best-effort para no dejar al cliente cobrado sin reagendamiento.
    if (paymentIdForRefund) {
      console.error(
        "[reschedule/complete] Excepción inesperada con paymentId presente; intentando reembolso:",
        paymentIdForRefund,
      );
      await safeRefundOrder(paymentIdForRefund);
      return errorResponse(
        `${errorMessage}. Tu pago adicional será reembolsado automáticamente.`,
        500,
      );
    }
    return errorResponse(errorMessage, 500);
  }
}

// =====================================================
// Helpers de verificación contra Conekta
// =====================================================

async function verifyConektaOrderForReschedule(args: {
  paymentId: string;
  expectedAmount: number;
  expectedReservationId: number;
  expectedEmail: string;
  supabase: ReturnType<typeof createServiceRoleClient>;
}): Promise<string | null> {
  const {
    paymentId,
    expectedAmount,
    expectedReservationId,
    expectedEmail,
    supabase,
  } = args;

  // 1. ¿Ya está usado en otra reserva como pago inicial o adicional?
  const [{ data: usedAsPayment }, { data: usedAsAdditional }] = await Promise.all([
    supabase
      .from("reservations")
      .select("id")
      .eq("payment_id", paymentId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("reservations")
      .select("id")
      .eq("additional_payment_id", paymentId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (usedAsPayment || usedAsAdditional) {
    return "Este pago ya fue utilizado en otra reserva.";
  }

  // 2. Consultar Conekta
  let order;
  try {
    order = await getConektaOrder(paymentId);
  } catch (err) {
    console.error("Error consultando orden Conekta (reschedule):", err);
    return "No se pudo verificar el pago con Conekta. Si fuiste cobrado, contacta a soporte.";
  }

  if (order.payment_status !== "paid") {
    return `El pago no está confirmado por Conekta (status=${order.payment_status}).`;
  }
  const charge = findPaidCharge(order);
  if (!charge) {
    return "El pago no tiene un cargo confirmado.";
  }

  const meta = order.metadata ?? {};
  const intent = String((meta as Record<string, unknown>).intent ?? "");
  if (intent !== "reschedule") {
    return "El pago corresponde a otro tipo de operación.";
  }

  const metaReservationId = Number(
    (meta as Record<string, unknown>).reservation_id,
  );
  if (
    !Number.isFinite(metaReservationId) ||
    metaReservationId !== expectedReservationId
  ) {
    return "El pago no corresponde a esta reserva.";
  }

  // Defensa: nuestras órdenes SIEMPRE incluyen `email` en metadata. Si llega
  // sin email pero con `intent` correcto, podría ser una orden creada por un
  // path que ignoró nuestros validadores. Rechazamos por seguridad.
  const metaEmail = String((meta as Record<string, unknown>).email ?? "")
    .toLowerCase()
    .trim();
  if (!metaEmail) {
    return "El pago no incluye email asociado. No se acepta.";
  }
  if (metaEmail !== expectedEmail) {
    return "El email del pago no coincide con el de la reserva.";
  }

  const expectedCents = toCents(expectedAmount);
  if (Math.abs(order.amount - expectedCents) > 1) {
    return "El monto cobrado no coincide con el esperado. No se acepta el pago.";
  }
  return null;
}

/**
 * Idempotency-Key estable: reintentos/llamadas concurrentes a Conekta
 * para el mismo charge resuelven al mismo resultado.
 */
async function safeRefundOrder(paymentId: string): Promise<void> {
  try {
    const order = await getConektaOrder(paymentId);
    const charge = findPaidCharge(order);
    if (!charge) return;
    await refundConektaCharge(
      charge.id,
      charge.amount,
      `refund_${charge.id}`,
    );
  } catch (err) {
    console.error("Reembolso automático falló para", paymentId, err);
  }
}
