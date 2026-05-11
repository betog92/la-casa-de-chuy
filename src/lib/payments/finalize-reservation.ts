import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateSlotAvailability,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import { isSessionType } from "@/utils/session-type";
import { validateDateFormat, validateTimeFormat } from "@/utils/validation";
import {
  generateGuestToken,
  generateGuestReservationUrl,
} from "@/lib/auth/guest-tokens";
import { sendReservationConfirmation } from "@/lib/email";
import { calculateLoyaltyLevel, type LoyaltyLevel } from "@/utils/loyalty";
import { computeAuthoritativeReservationPrice } from "@/lib/payments/pricing-server";
import {
  getConektaOrder,
  findPaidCharge,
  refundConektaOrderCharge,
  isAlreadyRefundedError,
  toCents,
} from "@/lib/payments/conekta";

/** Cliente service-role de Supabase (mismo tipo que `createServiceRoleClient`). */
export type FinalizeReservationSupabase = ReturnType<
  typeof createServiceRoleClient
>;

/**
 * Helper compartido entre `/api/reservations/create` (flujo normal del cliente)
 * y `/api/conekta/webhook` (flujo de recuperación cuando el cliente cierra la
 * pestaña tras pagar). Centraliza:
 *
 * - Verificación contra Conekta (status pagado, monto, email, intent).
 * - Validación de disponibilidad del slot.
 * - Recalculo autoritativo de precio.
 * - Inserción en `reservations`.
 * - Consumo atómico de Monedas Chuy.
 * - Tareas post-insert (email, registro de uso de código, guest token).
 * - Marcar `pending_reservations.consumed_reservation_id`.
 * - Reembolso automático si algo falla DESPUÉS de cobrar.
 *
 * No depende de `Request` ni `NextResponse`: cada caller mapea el resultado.
 */

const PHOTOGRAPHER_STUDIO_MAX = 500;

export interface FinalizeReservationInput {
  email: string;
  name: string;
  phone: string;
  date: string;
  startTime: string;
  paymentId: string | null;
  sessionType: string;
  photographerStudio: string | null;
  useLoyaltyDiscount: boolean;
  useLoyaltyPoints: number;
  useCredits: number;
  discountCode: string | null;
  /**
   * userId del cliente autenticado. El endpoint normal lo obtiene de las
   * cookies. El webhook no tiene cookies, pero el `payload` snapshot puede
   * traer el userId que ya estaba autenticado al crear la orden.
   */
  authenticatedUserId: string | null;
  /**
   * Si se conoce, el id de la fila en `pending_reservations` que esta
   * finalización va a consumir. Sirve para marcarla `consumed`.
   */
  pendingReservationId?: string | null;
  /**
   * Cliente Supabase opcional. Si el caller (webhook, `/reservations/create`)
   * ya abrió un service-role client, pásalo aquí para evitar conexiones
   * duplicadas en la misma request.
   */
  supabase?: FinalizeReservationSupabase;
}

export type FinalizeReservationResult =
  | {
      ok: true;
      reservationId: number;
      guestToken: string | null;
      guestReservationUrl: string | null;
      loyaltyLevelChanged: boolean;
      newLoyaltyLevel: LoyaltyLevel | null;
      finalPrice: number;
      /**
       * `true` si el helper detectó que la reserva ya existía con ese
       * paymentId (race con otra request) y simplemente la reconcilió.
       * `false` si el helper insertó la reserva.
       */
      reconciledExisting: boolean;
    }
  | {
      ok: false;
      status: number;
      message: string;
      /** Si true, el caller ya intentó reembolsar; el cliente no debe reintentar. */
      refunded: boolean;
    };

/**
 * Punto único de creación de reserva pagada.
 * Reembolsa automáticamente si algo falla DESPUÉS de la verificación contra
 * Conekta (slot tomado, error de BD, etc.) cuando hay paymentId presente.
 */
export async function finalizeReservationFromPayload(
  input: FinalizeReservationInput,
): Promise<FinalizeReservationResult> {
  const supabase = input.supabase ?? createServiceRoleClient();
  const paymentId = input.paymentId;

  // Helper local: rechazo + reembolso si hay paymentId.
  // Si Conekta no confirmó el refund (red/5xx), `refunded=false` y el
  // cron de huérfanos eventualmente lo reembolsará.
  const rejectAndRefund = async (
    message: string,
    status: number,
  ): Promise<FinalizeReservationResult> => {
    if (paymentId) {
      const refundOk = await safeRefundOrder(paymentId, supabase);
      return { ok: false, status, message, refunded: refundOk };
    }
    return { ok: false, status, message, refunded: false };
  };

  // 0. Si conocemos el pending, verifica que no esté en proceso de refund/refunded/failed.
  // Esto evita race con el cron de huérfanos: si el cron ya tomó claim del row,
  // no debemos crear la reserva (Conekta ya está siendo reembolsada).
  if (input.pendingReservationId) {
    const { data: pendingState } = await supabase
      .from("pending_reservations")
      .select("status")
      .eq("id", input.pendingReservationId)
      .maybeSingle();
    const status = (pendingState as { status?: string } | null)?.status;
    if (
      status === "refund_in_progress" ||
      status === "refunded" ||
      status === "failed"
    ) {
      return {
        ok: false,
        status: 409,
        message:
          status === "refund_in_progress"
            ? "Tu pago está siendo reembolsado automáticamente porque tomó demasiado tiempo confirmar la reserva. Si fuiste cobrado, recibirás el reembolso en breve."
            : status === "refunded"
              ? "Tu pago ya fue reembolsado automáticamente. Si quieres reservar, intenta de nuevo."
              : "Este pago fue marcado como fallido y no puede crear una reserva.",
        refunded: status === "refunded",
      };
    }
  }

  // 1. Validaciones de formato/rango (idénticas a las del endpoint).
  if (!input.email || !input.name || !input.phone || !input.date || !input.startTime) {
    return {
      ok: false,
      status: 400,
      message: "Faltan campos requeridos (email, name, phone, date, startTime)",
      refunded: false,
    };
  }
  if (!validateDateFormat(input.date)) {
    return {
      ok: false,
      status: 400,
      message: "Formato de fecha inválido (yyyy-MM-dd)",
      refunded: false,
    };
  }
  if (!validateTimeFormat(input.startTime)) {
    return {
      ok: false,
      status: 400,
      message: "Formato de hora inválido (HH:mm)",
      refunded: false,
    };
  }
  const sessionTypeNorm = String(input.sessionType ?? "").trim();
  if (!sessionTypeNorm || !isSessionType(sessionTypeNorm)) {
    return {
      ok: false,
      status: 400,
      message: "Tipo de sesión inválido (xv_anos, boda, casual)",
      refunded: false,
    };
  }
  const photographerStudioNorm =
    input.photographerStudio == null || input.photographerStudio === ""
      ? null
      : String(input.photographerStudio)
          .trim()
          .slice(0, PHOTOGRAPHER_STUDIO_MAX) || null;

  const normalizedEmail = input.email.toLowerCase().trim();

  // 2. Recalcular precio autoritativo.
  const priceResult = await computeAuthoritativeReservationPrice(supabase, {
    dateString: input.date,
    contactEmail: normalizedEmail,
    userId: input.authenticatedUserId,
    useLoyaltyDiscount: input.useLoyaltyDiscount === true,
    useLoyaltyPoints: Number(input.useLoyaltyPoints) || 0,
    useCredits: Number(input.useCredits) || 0,
    discountCode: input.discountCode ?? null,
  });
  if (!priceResult.ok) {
    return rejectAndRefund(priceResult.message, 400);
  }
  const userId = priceResult.resolvedUserId;
  const finalPrice = priceResult.finalPrice;

  // 3. Verificar paymentId contra Conekta cuando hay precio > 0.
  if (finalPrice > 0) {
    if (!paymentId) {
      return { ok: false, status: 400, message: "Falta paymentId", refunded: false };
    }
    const verifyError = await verifyConektaOrderForReservation({
      paymentId,
      expectedAmount: finalPrice,
      expectedEmail: normalizedEmail,
      supabase,
    });
    if (verifyError) {
      if (
        verifyError.startsWith("El monto cobrado") ||
        verifyError.startsWith("No se pudo verificar")
      ) {
        return rejectAndRefund(verifyError, 400);
      }
      return { ok: false, status: 400, message: verifyError, refunded: false };
    }
  }

  // 4. Validar disponibilidad de slot (post-cobro).
  const isAvailable = await validateSlotAvailability(
    supabase,
    input.date,
    input.startTime,
  );
  if (!isAvailable) {
    return rejectAndRefund(
      "El horario seleccionado ya no está disponible. Por favor selecciona otro horario.",
      409,
    );
  }

  // 5. Contar reservas previas para nivel de fidelización.
  let previousCount = 0;
  if (userId) {
    const { count } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "confirmed");
    previousCount = count ?? 0;
  }

  // 6. Releer monedas para consumir.
  type LoyaltyRow = { id: string; points: number; expires_at: string | null };
  let loyaltyRowsForConsumption: LoyaltyRow[] = [];
  const pointsToConsume = priceResult.loyaltyPointsUsed;
  if (userId && pointsToConsume > 0) {
    const { data: pointsRows, error: pointsError } = await supabase
      .from("loyalty_points")
      .select("id, points, expires_at")
      .eq("user_id", userId)
      .eq("used", false)
      .eq("revoked", false)
      .order("created_at", { ascending: true });
    if (pointsError) {
      console.error("Error consultando puntos de lealtad:", pointsError);
      return rejectAndRefund(
        "No se pudo verificar el saldo de Monedas Chuy. Intenta de nuevo.",
        500,
      );
    }
    loyaltyRowsForConsumption = (pointsRows as LoyaltyRow[] | null) ?? [];
  }

  // 7. INSERT reserva con valores autoritativos.
  const endTime = calculateEndTime(input.startTime);
  const reservationData = {
    email: normalizedEmail,
    name: input.name,
    phone: input.phone,
    date: input.date,
    start_time: formatTimeToSeconds(input.startTime),
    end_time: endTime,
    price: finalPrice,
    original_price: priceResult.basePrice,
    payment_id: paymentId,
    payment_method: paymentId ? "conekta" : null,
    status: "confirmed" as const,
    user_id: userId || null,
    session_type: sessionTypeNorm,
    photographer_studio: photographerStudioNorm,
    discount_amount: priceResult.totalDiscount,
    last_minute_discount: priceResult.lastMinuteDiscount,
    loyalty_discount: priceResult.loyaltyDiscount,
    loyalty_points_used: priceResult.loyaltyPointsUsed,
    credits_used: priceResult.creditsUsed,
    referral_discount: priceResult.referralDiscount,
    discount_code: priceResult.discountCode,
    discount_code_discount: priceResult.discountCodeDiscount,
  };

  const { data, error } = await supabase
    .from("reservations")
    .insert(reservationData as never)
    .select("id")
    .single();

  if (error) {
    console.error("Error al crear reserva:", error);
    const isUnique = error.code === "23505" || error.message?.includes("UNIQUE");
    if (isUnique) {
      // Race con webhook o con otra request: si la reserva YA existe con ese
      // paymentId, devolvemos OK (idempotencia). Si la colisión fue por slot
      // (otro cliente), reembolsamos.
      if (paymentId) {
        const { data: existing } = await supabase
          .from("reservations")
          .select("id")
          .eq("payment_id", paymentId)
          .maybeSingle();
        if (existing) {
          const existingId = (existing as { id: number }).id;
          const markResult = await markPendingConsumed(
            supabase,
            input.pendingReservationId,
            existingId,
          );
          if (markResult === "error") {
            // No fallamos la respuesta del cliente: la reserva ya está creada
            // (es race con webhook/otra request). El cron reconciliará el
            // pending en su próxima corrida (≤10 min) gracias al doble recheck.
            console.error(
              "[finalize-reservation] markPendingConsumed=error tras race con UNIQUE; cron reconciliará.",
              { pendingId: input.pendingReservationId, reservationId: existingId, paymentId },
            );
          }
          return {
            ok: true,
            reservationId: existingId,
            guestToken: null,
            guestReservationUrl: null,
            loyaltyLevelChanged: false,
            newLoyaltyLevel: null,
            finalPrice,
            reconciledExisting: true,
          };
        }
      }
      return rejectAndRefund("El horario fue reservado por otro usuario.", 409);
    }
    return rejectAndRefund(error.message || "Error al crear la reserva.", 500);
  }

  const reservationId = (data as { id: number } | null)?.id;
  if (reservationId == null || typeof reservationId !== "number") {
    return rejectAndRefund("No se pudo obtener el ID de la reserva creada", 500);
  }

  // Marcamos pending consumed lo antes posible para que el cron no haga
  // trabajo innecesario. Si falla con error real (no con `already_terminal`,
  // que sería una race normal), lo loggeamos para tener observabilidad. NO
  // fallamos la request: la reserva ya está en BD; el cron reconciliará el
  // pending en ≤10 min gracias al doble recheck antes de reembolsar.
  const markResult = await markPendingConsumed(
    supabase,
    input.pendingReservationId,
    reservationId,
  );
  if (markResult === "error") {
    console.error(
      "[finalize-reservation] markPendingConsumed=error tras INSERT exitoso; reserva creada, cron reconciliará pending.",
      {
        pendingId: input.pendingReservationId,
        reservationId,
        paymentId,
      },
    );
  }

  // 8. Consumo atómico de Monedas Chuy.
  if (userId && pointsToConsume > 0 && loyaltyRowsForConsumption.length > 0) {
    let remaining = pointsToConsume;

    const correctReservationLoyaltyPointsUsed = async (actual: number) => {
      await supabase
        .from("reservations")
        .update({ loyalty_points_used: Math.max(0, actual) } as never)
        .eq("id", reservationId);
    };

    for (const row of loyaltyRowsForConsumption) {
      if (remaining <= 0) break;
      const rowPoints = row.points || 0;
      if (rowPoints <= 0) continue;
      if (rowPoints <= remaining) {
        const { data: updated, error: updateError } = await supabase
          .from("loyalty_points")
          .update({ used: true, reservation_id: reservationId } as never)
          .eq("id", row.id)
          .eq("used", false)
          .select("id")
          .maybeSingle();
        if (updateError || !updated) {
          console.error(
            "Error o fila ya usada al marcar puntos (id:",
            row.id,
            "):",
            updateError || "0 rows",
          );
          await correctReservationLoyaltyPointsUsed(pointsToConsume - remaining);
          return {
            ok: false,
            status: 500,
            message:
              "Las Monedas Chuy ya no están disponibles. La reserva fue creada; contacta a soporte si tu saldo no se actualizó.",
            refunded: false,
          };
        }
        remaining -= rowPoints;
      } else {
        const { data: updated, error: updateError } = await supabase
          .from("loyalty_points")
          .update({ points: rowPoints - remaining } as never)
          .eq("id", row.id)
          .eq("used", false)
          .select("id")
          .maybeSingle();
        if (updateError || !updated) {
          console.error(
            "Error o fila ya usada al partir puntos (id:",
            row.id,
            "):",
            updateError || "0 rows",
          );
          await correctReservationLoyaltyPointsUsed(pointsToConsume - remaining);
          return {
            ok: false,
            status: 500,
            message:
              "Las Monedas Chuy ya no están disponibles. La reserva fue creada; contacta a soporte si tu saldo no se actualizó.",
            refunded: false,
          };
        }
        const { error: insertError } = await supabase
          .from("loyalty_points")
          .insert({
            user_id: userId,
            points: remaining,
            expires_at: row.expires_at,
            used: true,
            reservation_id: reservationId,
            revoked: false,
          } as never);
        if (insertError) {
          console.error("Error al insertar fila de puntos consumidos:", insertError);
          await correctReservationLoyaltyPointsUsed(pointsToConsume - remaining);
          return {
            ok: false,
            status: 500,
            message:
              "Error al aplicar las Monedas Chuy. La reserva fue creada; contacta a soporte si tu saldo no se actualizó.",
            refunded: false,
          };
        }
        remaining = 0;
      }
    }

    if (remaining > 0) {
      const actualConsumed = Math.max(0, pointsToConsume - remaining);
      await correctReservationLoyaltyPointsUsed(actualConsumed);
      console.error(
        "Consumo de puntos incompleto: se intentaron consumir",
        pointsToConsume,
        "pero quedaron",
        remaining,
        "sin consumir (userId:",
        userId,
        "reservationId:",
        reservationId,
        ").",
      );
    }
  }

  // 9. Tareas post-insert independientes en paralelo.
  let guestToken: string | null = null;
  let guestReservationUrl: string | null = null;

  const pointsToGrant =
    userId && finalPrice > 0 ? Math.floor(Number(finalPrice) / 10) : 0;
  const newLoyaltyLevel = userId ? calculateLoyaltyLevel(previousCount + 1) : null;
  const previousLoyaltyLevel = userId ? calculateLoyaltyLevel(previousCount) : null;
  const loyaltyLevelChanged =
    newLoyaltyLevel !== null && newLoyaltyLevel !== previousLoyaltyLevel;

  const postInsertTasks: Promise<void>[] = [];

  if (userId && pointsToGrant > 0) {
    postInsertTasks.push(
      (async () => {
        try {
          const { error: e } = await supabase.from("loyalty_points").insert({
            user_id: userId,
            points: pointsToGrant,
            expires_at: null,
            reservation_id: reservationId,
            used: false,
            revoked: false,
          } as never);
          if (e) console.error("Error otorgando Monedas Chuy:", e);
        } catch (err) {
          console.error("Error inesperado otorgando Monedas Chuy:", err);
        }
      })(),
    );
  }

  if (userId) {
    postInsertTasks.push(
      (async () => {
        try {
          const { data: existingProfile } = await supabase
            .from("users")
            .select("name, phone")
            .eq("id", userId)
            .maybeSingle();
          if (!existingProfile) return;
          const p = existingProfile as { name: string | null; phone: string | null };
          if (p.name && p.phone) return;
          const updateData: { name?: string; phone?: string; updated_at: string } = {
            updated_at: new Date().toISOString(),
          };
          if (!p.name && input.name) updateData.name = input.name;
          if (!p.phone && input.phone) updateData.phone = input.phone;
          if (updateData.name || updateData.phone) {
            await supabase.from("users").update(updateData as never).eq("id", userId);
          }
        } catch (err) {
          console.error("Error updating user profile:", err);
        }
      })(),
    );
  }

  if (priceResult.discountCode) {
    const codeStr = priceResult.discountCode;
    postInsertTasks.push(
      (async () => {
        try {
          const { data: codeData, error: codeError } = await supabase
            .from("discount_codes")
            .select("id")
            .eq("code", codeStr.toUpperCase())
            .single();
          if (codeError || !codeData || !(codeData as { id: string }).id) return;
          const codeId = (codeData as { id: string }).id;
          const { error: insertError } = await supabase
            .from("discount_code_uses")
            .insert({
              discount_code_id: codeId,
              user_id: userId || null,
              email: normalizedEmail,
              reservation_id: reservationId,
            } as never);
          if (insertError) {
            console.error("Error al insertar uso de código:", insertError);
            return;
          }
          const { error: rpcError } = await supabase.rpc(
            "increment_discount_code_uses",
            { code_id: codeId } as never,
          );
          if (rpcError) {
            console.error(
              "Error al incrementar contador de usos del código:",
              rpcError,
            );
          }
        } catch (err) {
          console.error("Error al registrar uso de código:", err);
        }
      })(),
    );
  }

  if (!userId) {
    postInsertTasks.push(
      (async () => {
        try {
          const tok = await generateGuestToken(normalizedEmail, String(reservationId));
          guestToken = tok;
          guestReservationUrl = generateGuestReservationUrl(tok);
        } catch (err) {
          console.error("Error al generar token de invitado:", err);
        }
      })(),
    );
  }

  await Promise.all(postInsertTasks);

  // 10. Email de confirmación en segundo plano.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageUrl = guestReservationUrl
    ? guestReservationUrl
    : `${baseUrl}/reservaciones/${reservationId}`;
  if (normalizedEmail) {
    sendReservationConfirmation({
      to: normalizedEmail,
      name: input.name,
      date: input.date,
      startTime: input.startTime,
      price: Number.isFinite(Number(finalPrice)) ? Number(finalPrice) : 0,
      reservationId,
      manageUrl,
      sessionType: sessionTypeNorm,
      photographerStudio: photographerStudioNorm,
    })
      .then((r) => {
        if (!r.ok) {
          console.error("Error al enviar email de confirmación:", r.error);
        }
      })
      .catch((e) => {
        console.error("Error inesperado al enviar email de confirmación:", e);
      });
  }

  return {
    ok: true,
    reservationId,
    guestToken,
    guestReservationUrl,
    loyaltyLevelChanged,
    newLoyaltyLevel,
    finalPrice,
    reconciledExisting: false,
  };
}

// =====================================================
// Helpers
// =====================================================

/**
 * Resultado de `markPendingConsumed`:
 * - `consumed`: el UPDATE pegó y la fila quedó como `consumed`.
 * - `already_terminal`: el pending ya no estaba en `pending_payment`
 *   (lo dejó otro proceso: cron en `refund_in_progress`/`refunded`/`failed`,
 *   o webhook en `consumed`). Es estado terminal esperado, no es error.
 * - `error`: hubo error de DB (network, timeout, RLS, schema mismatch).
 *   El caller debe loggear con contexto para que sea visible.
 */
type MarkPendingConsumedResult = "consumed" | "already_terminal" | "error";

/**
 * Marca un pending como `consumed`. Sólo afecta filas en `pending_payment`
 * para no pisar `refund_in_progress` (cron está reembolsando), `refunded`
 * (ya reembolsado), `failed` (Conekta no pagó) ni `consumed` (idempotente).
 *
 * Devuelve un resultado tipado para que el caller distinga el caso normal
 * (`already_terminal`, p. ej. otro proceso ya lo marcó) del caso anómalo
 * (`error`, problema de BD que requiere observabilidad).
 *
 * Importante: aunque este UPDATE falle silenciosamente, NUNCA causa un
 * reembolso incorrecto: el cron `refund-orphan-payments` hace doble recheck
 * contra `reservations` (por `payment_id` y `additional_payment_id`) antes
 * de reembolsar, así que si la reserva existe la detecta y reconcilia el
 * pending. Lo único en juego aquí es la consistencia inmediata y la
 * eficiencia (evitar trabajo innecesario al cron).
 */
async function markPendingConsumed(
  supabase: FinalizeReservationSupabase,
  pendingId: string | null | undefined,
  reservationId: number,
): Promise<MarkPendingConsumedResult> {
  if (!pendingId) return "consumed";
  try {
    const { data, error } = await supabase
      .from("pending_reservations")
      .update({
        status: "consumed",
        consumed_reservation_id: reservationId,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", pendingId)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle();
    if (error) {
      console.error(
        "[finalize-reservation] DB error marcando pending consumed:",
        { pendingId, reservationId, error },
      );
      return "error";
    }
    return data ? "consumed" : "already_terminal";
  } catch (err) {
    console.error(
      "[finalize-reservation] Excepción marcando pending consumed:",
      { pendingId, reservationId, err },
    );
    return "error";
  }
}

async function verifyConektaOrderForReservation(args: {
  paymentId: string;
  expectedAmount: number;
  expectedEmail: string;
  supabase: FinalizeReservationSupabase;
}): Promise<string | null> {
  const { paymentId, expectedAmount, expectedEmail, supabase } = args;

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

  let order;
  try {
    order = await getConektaOrder(paymentId);
  } catch (err) {
    console.error("Error consultando orden Conekta:", err);
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
  if (intent !== "reservation") {
    return "El pago corresponde a otro tipo de operación.";
  }

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
 * Reembolso best-effort. Idempotency-Key estable derivada del chargeId para
 * que reintentos resuelvan al mismo resultado. Si se reembolsa con éxito,
 * marca cualquier `pending_reservations` con ese paymentId como `refunded`
 * para evitar que el cron lo reintente.
 *
 * Devuelve `true` SOLO si Conekta confirmó el refund, si Conekta indica que
 * el cargo ya estaba reembolsado (race con el cron / dashboard / otra
 * invocación), o si no había nada que reembolsar porque no hay charge pagado.
 * Devuelve `false` si Conekta lanzó cualquier otro error, en cuyo caso el
 * cron de huérfanos lo reintentará.
 *
 * @param db Cliente opcional; si no se pasa, se crea uno (útil en catch
 * globales donde no hay instancia compartida).
 */
export async function safeRefundOrder(
  paymentId: string,
  db?: FinalizeReservationSupabase,
): Promise<boolean> {
  const supabase = db ?? createServiceRoleClient();
  let charge: Awaited<ReturnType<typeof findPaidCharge>> = null;
  try {
    const order = await getConektaOrder(paymentId);
    charge = findPaidCharge(order);
    if (!charge) return true;
    await refundConektaOrderCharge({
      orderId: paymentId,
      chargeId: charge.id,
      amountCents: charge.amount,
      idempotencyKey: `refund_${charge.id}`,
    });
  } catch (err) {
    if (isAlreadyRefundedError(err)) {
      console.warn(
        "[finalize-reservation] safeRefundOrder: el cargo ya estaba reembolsado en Conekta:",
        paymentId,
      );
      // No retornamos aún: caemos al `update` de pending_reservations para
      // dejar la fila marcada como `refunded` y evitar que el cron la
      // reintente, igual que en el path de éxito.
    } else {
      console.error("Reembolso automático falló para", paymentId, err);
      return false;
    }
  }
  try {
    await supabase
      .from("pending_reservations")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        notes: "Reembolso automático desde finalize-reservation.",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("payment_id", paymentId)
      .in("status", ["pending_payment", "refund_in_progress"]);
  } catch (markErr) {
    console.error(
      "[finalize-reservation] No se pudo marcar pending como refunded:",
      markErr,
    );
    // El refund SÍ se hizo en Conekta; sólo no pudimos marcar pending.
    // Devolvemos true porque el cliente fue reembolsado.
  }
  return true;
}