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

        if (!codeError && codeData) {
          // Crear registro de uso
          await supabase.from("discount_code_uses").insert({
            discount_code_id: codeData.id,
            user_id: userId || null,
            email: email.toLowerCase(),
            reservation_id: reservationId,
          });

          // Incrementar contador de usos
          const { data: currentCode } = await supabase
            .from("discount_codes")
            .select("current_uses")
            .eq("id", codeData.id)
            .single();

          if (currentCode) {
            await supabase
              .from("discount_codes")
              .update({
                current_uses: (currentCode.current_uses || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq("id", codeData.id);
          }
        }
      } catch (codeErr) {
        // No fallar la reserva si hay error al registrar el código
        console.error("Error al registrar uso de código:", codeErr);
      }
    }

    return successResponse({ reservationId });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al crear la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
