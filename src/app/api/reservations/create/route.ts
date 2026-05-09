import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateSlotAvailability,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import { isSessionType } from "@/utils/session-type";
import { validateDateFormat, validateTimeFormat } from "@/utils/validation";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import {
  generateGuestToken,
  generateGuestReservationUrl,
} from "@/lib/auth/guest-tokens";
import { sendReservationConfirmation } from "@/lib/email";
import { calculateLoyaltyLevel } from "@/utils/loyalty";
import { computeAuthoritativeReservationPrice } from "@/lib/payments/pricing-server";
import {
  getConektaOrder,
  findPaidCharge,
  refundConektaCharge,
  toCents,
} from "@/lib/payments/conekta";
import type { Database } from "@/types/database.types";

const PHOTOGRAPHER_STUDIO_MAX = 500;

/**
 * Endpoint server-side para confirmar una reserva pagada con Conekta.
 *
 * Diseño anti-fraude:
 * - El servidor recalcula el precio definitivo con la BD; los campos `price`,
 *   `originalPrice`, `discountAmount`, etc. enviados por el cliente se IGNORAN.
 * - El `paymentId` se verifica directamente contra la API de Conekta:
 *   debe estar pagado, ser del intent correcto, del mismo email y por el
 *   monto exacto que recalcula el servidor.
 * - Se valida que el mismo `paymentId` no se reutilice entre reservas.
 * - Si la inserción falla por race condition, se REEMBOLSA el cargo
 *   automáticamente para que el cliente no pierda el dinero.
 */

interface CreateReservationBody {
  email?: string;
  name?: string;
  phone?: string;
  date?: string;
  startTime?: string;
  paymentId?: string;
  sessionType?: string;
  photographerStudio?: string | null;

  // Beneficios solicitados (el servidor revalida)
  useLoyaltyDiscount?: boolean;
  useLoyaltyPoints?: number;
  useCredits?: number;
  discountCode?: string | null;
}

export async function POST(request: NextRequest) {
  // Sacamos `paymentId` afuera del try interno para que el catch outer pueda
  // reembolsar si una excepción inesperada brinca el flujo después del cobro.
  let paymentId: string | null = null;
  try {
    const authenticatedUserId = await getAuthenticatedUserId();

    const body = (await request.json().catch(() => ({}))) as CreateReservationBody;
    paymentId =
      typeof body.paymentId === "string" && body.paymentId.trim() !== ""
        ? body.paymentId
        : null;

    // Helper local: si rechazamos la request DESPUÉS de validar el paymentId
    // contra Conekta (es decir, sabemos que sí existe un cargo legítimo),
    // reembolsamos automáticamente para no dejar al cliente cobrado.
    const rejectAndRefund = async (
      message: string,
      status: number,
    ) => {
      if (paymentId) {
        await safeRefundOrder(paymentId);
      }
      return errorResponse(
        paymentId
          ? `${message} Tu pago será reembolsado automáticamente.`
          : message,
        status,
      );
    };

    // Validaciones básicas (pre-Conekta: aún no verificamos el paymentId)
    if (!body.email || !body.name || !body.phone || !body.date || !body.startTime) {
      return validationErrorResponse(
        "Faltan campos requeridos (email, name, phone, date, startTime)",
      );
    }
    if (!validateDateFormat(body.date)) {
      return validationErrorResponse("Formato de fecha inválido (yyyy-MM-dd)");
    }
    if (!validateTimeFormat(body.startTime)) {
      return validationErrorResponse("Formato de hora inválido (HH:mm)");
    }
    const sessionTypeNorm = String(body.sessionType ?? "").trim();
    if (!sessionTypeNorm || !isSessionType(sessionTypeNorm)) {
      return validationErrorResponse(
        "Tipo de sesión inválido (xv_anos, boda, casual)",
      );
    }
    const photographerStudioNorm =
      body.photographerStudio == null || body.photographerStudio === ""
        ? null
        : String(body.photographerStudio).trim().slice(0, PHOTOGRAPHER_STUDIO_MAX) || null;
    if (photographerStudioNorm && photographerStudioNorm.length > PHOTOGRAPHER_STUDIO_MAX) {
      return validationErrorResponse(
        `Fotógrafo/estudio: máximo ${PHOTOGRAPHER_STUDIO_MAX} caracteres`,
      );
    }

    const normalizedEmail = body.email.toLowerCase().trim();
    const supabase = createServiceRoleClient();

    // Recalcular precio autoritativo (única fuente de verdad)
    const priceResult = await computeAuthoritativeReservationPrice(supabase, {
      dateString: body.date,
      contactEmail: normalizedEmail,
      userId: authenticatedUserId,
      useLoyaltyDiscount: body.useLoyaltyDiscount === true,
      useLoyaltyPoints: Number(body.useLoyaltyPoints) || 0,
      useCredits: Number(body.useCredits) || 0,
      discountCode: body.discountCode ?? null,
    });

    if (!priceResult.ok) {
      // Si el cliente envió un paymentId, el cobro pudo haber ocurrido
      // entre /create-order y aquí (race en beneficios). Reembolsar.
      return rejectAndRefund(priceResult.message, 400);
    }

    const userId = priceResult.resolvedUserId;
    const finalPrice = priceResult.finalPrice;

    // Si el precio final es > 0, exigir paymentId verificado contra Conekta
    if (finalPrice > 0) {
      if (!paymentId) {
        return validationErrorResponse("Falta paymentId");
      }
      const verifyError = await verifyConektaOrderForReservation({
        paymentId,
        expectedAmount: finalPrice,
        expectedEmail: normalizedEmail,
        supabase,
      });
      if (verifyError) {
        // Si el paymentId NO nos pertenece (intent/email/reservation_id no
        // coinciden o ya fue usado en otra reserva), NO reembolsamos: o no
        // hay dinero que devolver, o devolverlo perjudicaría a otra reserva.
        // Si el monto no coincide o Conekta falló, sí intentamos reembolsar.
        if (
          verifyError.startsWith("El monto cobrado") ||
          verifyError.startsWith("No se pudo verificar")
        ) {
          return rejectAndRefund(verifyError, 400);
        }
        return errorResponse(verifyError, 400);
      }
    }

    // Validar disponibilidad
    const isAvailable = await validateSlotAvailability(
      supabase,
      body.date,
      body.startTime,
    );
    if (!isAvailable) {
      // El cliente ya pagó: si hay paymentId y el slot acaba de ocuparse,
      // reembolsar para no dejar dinero flotando.
      return rejectAndRefund(
        "El horario seleccionado ya no está disponible. Por favor selecciona otro horario.",
        409,
      );
    }

    // Contar reservas previas confirmadas (para nivel de fidelización)
    let previousCount = 0;
    if (userId) {
      const { count } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "confirmed");
      previousCount = count ?? 0;
    }

    // Releer monedas para consumir (sólo si se aplican)
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

    // Crear reserva (con valores AUTORITATIVOS)
    const endTime = calculateEndTime(body.startTime);
    const reservationData = {
      email: normalizedEmail,
      name: body.name,
      phone: body.phone,
      date: body.date,
      start_time: formatTimeToSeconds(body.startTime),
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
      // Reembolsar para no dejar al cliente cobrado sin reserva
      if (isUnique) {
        return rejectAndRefund(
          "El horario fue reservado por otro usuario.",
          409,
        );
      }
      return rejectAndRefund(
        error.message || "Error al crear la reserva.",
        500,
      );
    }

    const reservationId = (data as { id: number } | null)?.id;
    if (reservationId == null || typeof reservationId !== "number") {
      return rejectAndRefund("No se pudo obtener el ID de la reserva creada", 500);
    }

    // Consumo de Monedas Chuy con UPDATE used=false (anti-carrera)
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
            return errorResponse(
              "Las Monedas Chuy ya no están disponibles. La reserva fue creada; contacta a soporte si tu saldo no se actualizó.",
              500,
            );
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
            return errorResponse(
              "Las Monedas Chuy ya no están disponibles. La reserva fue creada; contacta a soporte si tu saldo no se actualizó.",
              500,
            );
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
            console.error(
              "Error al insertar fila de puntos consumidos:",
              insertError,
            );
            await correctReservationLoyaltyPointsUsed(pointsToConsume - remaining);
            return errorResponse(
              "Error al aplicar las Monedas Chuy. La reserva fue creada; contacta a soporte si tu saldo no se actualizó.",
              500,
            );
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

    // Tareas post-insert independientes en paralelo
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
            if (!p.name && body.name) updateData.name = body.name;
            if (!p.phone && body.phone) updateData.phone = body.phone;
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

    // Email de confirmación en segundo plano
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const manageUrl = guestReservationUrl
      ? guestReservationUrl
      : `${baseUrl}/reservaciones/${reservationId}`;
    if (normalizedEmail) {
      sendReservationConfirmation({
        to: normalizedEmail,
        name: body.name,
        date: body.date,
        startTime: body.startTime,
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

    return successResponse({
      reservationId,
      guestToken,
      guestReservationUrl,
      loyaltyLevelChanged,
      newLoyaltyLevel,
      finalPrice,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error inesperado al crear la reserva";
    console.error("Error inesperado:", error);
    // Excepción no controlada DESPUÉS de un cobro. La reserva probablemente
    // no se creó (o no se sabe). Reembolsamos para no dejar al cliente cobrado
    // sin reserva. Si la reserva sí quedó creada pero el insert tuvo éxito
    // y la excepción vino después (post-insert tasks), reembolsar es
    // conservador pero la reserva queda sin pago: alertamos por log.
    if (paymentId) {
      console.error(
        "[reservations/create] Excepción inesperada con paymentId presente; intentando reembolso:",
        paymentId,
      );
      await safeRefundOrder(paymentId);
      return errorResponse(
        `${errorMessage}. Tu pago será reembolsado automáticamente.`,
        500,
      );
    }
    return errorResponse(errorMessage, 500);
  }
}

// =====================================================
// Helpers
// =====================================================

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
            // server-only
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

/**
 * Verifica que el `paymentId` (orden de Conekta) sea legítimo:
 * - existe y está pagado,
 * - corresponde al intent "reservation",
 * - el email coincide,
 * - el monto coincide (con tolerancia de 1 centavo),
 * - no se haya usado en otra reserva.
 *
 * Devuelve mensaje de error si algo falla; null si todo OK.
 */
async function verifyConektaOrderForReservation(args: {
  paymentId: string;
  expectedAmount: number;
  expectedEmail: string;
  supabase: ReturnType<typeof createServiceRoleClient>;
}): Promise<string | null> {
  const { paymentId, expectedAmount, expectedEmail, supabase } = args;

  // 1. ¿Ya está usado en otra reserva (como pago inicial o como adicional
  //    de reagendamiento)? Cualquiera de los dos lo descalifica.
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
  // Tolerancia ±1 centavo por redondeo flotante
  if (Math.abs(order.amount - expectedCents) > 1) {
    return "El monto cobrado no coincide con el esperado. No se acepta el pago.";
  }

  return null;
}

/**
 * Reembolso best-effort: si falla, sólo se logea (no rompe el flujo del cliente).
 *
 * Usamos una `Idempotency-Key` ESTABLE derivada del paymentId para que
 * llamadas concurrentes o reintentos resuelvan al mismo resultado en Conekta
 * en vez de generar errores tipo "already refunded".
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
