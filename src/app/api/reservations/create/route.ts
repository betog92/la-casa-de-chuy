import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateSlotAvailability,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import { validateReservationFields } from "@/utils/validation";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  conflictResponse,
} from "@/utils/api-response";
import {
  generateGuestToken,
  generateGuestReservationUrl,
} from "@/lib/auth/guest-tokens";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json();

    // Validar campos
    const validation = validateReservationFields(body);
    if (!validation.isValid) {
      return validationErrorResponse(validation.error!);
    }

    const {
      email,
      name,
      phone,
      date,
      startTime,
      price,
      originalPrice,
      paymentId,
      userId,
      discountAmount,
      lastMinuteDiscount,
      loyaltyDiscount,
      loyaltyPointsUsed,
      creditsUsed,
      referralDiscount,
      discountCode,
      discountCodeDiscount,
    } = body;

    // Validar disponibilidad
    const isAvailable = await validateSlotAvailability(
      supabase,
      date,
      startTime
    );
    if (!isAvailable) {
      return conflictResponse(
        "El horario seleccionado ya no está disponible. Por favor selecciona otro horario."
      );
    }

    // Crear reserva
    const endTime = calculateEndTime(startTime);
    const reservationData = {
      email,
      name,
      phone,
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      price,
      original_price: originalPrice,
      payment_id: paymentId,
      status: "confirmed" as const,
      user_id: userId || null,
      discount_amount: discountAmount || 0,
      // Campos específicos de descuentos
      last_minute_discount: lastMinuteDiscount || 0,
      loyalty_discount: loyaltyDiscount || 0,
      loyalty_points_used: loyaltyPointsUsed || 0,
      credits_used: creditsUsed || 0,
      referral_discount: referralDiscount || 0,
      // Código de descuento
      discount_code: discountCode || null,
      discount_code_discount: discountCodeDiscount || 0,
    };

    const { data, error } = await supabase
      .from("reservations")
      .insert(reservationData as never)
      .select("id")
      .single();

    if (error) {
      console.error("Error al crear reserva:", error);

      if (error.code === "23505" || error.message?.includes("UNIQUE")) {
        return conflictResponse(
          "El horario fue reservado por otro usuario. Por favor selecciona otro horario."
        );
      }

      return errorResponse(error.message || "Error al crear la reserva", 500);
    }

    const reservationId = (data as { id: string } | null)?.id;
    if (!reservationId) {
      return errorResponse(
        "No se pudo obtener el ID de la reserva creada",
        500
      );
    }

    // Si se usó un código de descuento, registrar el uso y actualizar contadores
    if (discountCode) {
      try {
        // Buscar el código de descuento
        const { data: codeData, error: codeError } = await supabase
          .from("discount_codes")
          .select("id")
          .eq("code", discountCode.toUpperCase())
          .single();

        if (!codeError && codeData && (codeData as { id: string }).id) {
          const codeId = (codeData as { id: string }).id;
          // Crear registro de uso
          await supabase.from("discount_code_uses").insert({
            discount_code_id: codeId,
            user_id: userId || null,
            email: email.toLowerCase().trim(),
            reservation_id: reservationId,
          } as never);

          // Incrementar contador de usos de forma atómica usando función SQL
          // Esto evita condiciones de carrera en actualizaciones concurrentes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("increment_discount_code_uses", {
            code_id: codeId,
          });
        }
      } catch (codeErr) {
        // No fallar la reserva si hay error al registrar el código
        console.error("Error al registrar uso de código:", codeErr);
      }
    }

    // Si es un invitado (no tiene userId), generar token para magic link
    let guestToken: string | null = null;
    let guestReservationUrl: string | null = null;

    if (!userId) {
      try {
        guestToken = await generateGuestToken(email, reservationId);
        guestReservationUrl = generateGuestReservationUrl(guestToken);
      } catch (tokenError) {
        // No fallar la reserva si hay error al generar el token
        console.error("Error al generar token de invitado:", tokenError);
      }
    }

    return successResponse({
      reservationId,
      guestToken, // Token JWT para invitados
      guestReservationUrl, // URL completa del magic link
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al crear la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
