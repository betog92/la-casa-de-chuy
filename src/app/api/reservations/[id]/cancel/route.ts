import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parse, addDays, startOfDay } from "date-fns";
import { calculateBusinessDays, getMonterreyToday } from "@/utils/business-days";
import {
  calculateTotalPaid,
  calculateRefundAmount,
  generateDummyRefundId,
} from "@/utils/refunds";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
} from "@/utils/api-response";
import type { Database } from "@/types/database.types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reservationId } = await params;

    if (!reservationId) {
      return validationErrorResponse("ID de reserva requerido");
    }

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
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return unauthorizedResponse("Debes iniciar sesión para cancelar una reserva");
    }

    // Obtener la reserva y verificar que pertenece al usuario
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select("id, user_id, status, date, price, additional_payment_amount")
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Verificar que la reserva pertenece al usuario autenticado
    if (reservation.user_id !== user.id) {
      return unauthorizedResponse("No tienes permisos para cancelar esta reserva");
    }

    // Verificar que el status es 'confirmed'
    if (reservation.status !== "confirmed") {
      return errorResponse(
        "Solo se pueden cancelar reservas confirmadas",
        400
      );
    }

    // Calcular días hábiles desde mañana hasta la fecha de la reserva
    const today = getMonterreyToday();
    const tomorrow = addDays(today, 1);
    const reservationDate = startOfDay(parse(reservation.date, "yyyy-MM-dd", new Date()));

    const businessDays = calculateBusinessDays(tomorrow, reservationDate);

    // Si < 5 días hábiles, rechazar cancelación completamente
    if (businessDays < 5) {
      return errorResponse(
        `La cancelación solo está disponible con al menos 5 días hábiles de anticipación. Faltan ${businessDays} día${businessDays !== 1 ? "s" : ""} hábil${businessDays !== 1 ? "es" : ""}.`,
        400
      );
    }

    // Calcular el total pagado (precio + pago adicional si existe)
    const totalPaid = calculateTotalPaid(
      reservation.price,
      reservation.additional_payment_amount
    );

    // Calcular reembolso del 80% del total pagado
    const refundAmount = calculateRefundAmount(totalPaid);

    // TODO: Integrar con Conekta API para procesar el reembolso real
    // Por ahora, generar un refund_id dummy
    const dummyRefundId = generateDummyRefundId();

    // Actualizar la reserva
    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        refund_amount: refundAmount,
        refund_status: "pending",
        refund_id: dummyRefundId,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", reservationId);

    if (updateError) {
      console.error("Error cancelling reservation:", updateError);
      return errorResponse("Error al cancelar la reserva", 500);
    }

    return successResponse({
      message: "Reserva cancelada exitosamente",
      refund_amount: refundAmount,
      refund_id: dummyRefundId,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cancelar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}

