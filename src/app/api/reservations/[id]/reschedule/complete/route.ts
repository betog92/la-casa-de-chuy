import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
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
      return unauthorizedResponse(
        "Debes iniciar sesión para completar el reagendamiento"
      );
    }

    // Obtener el cuerpo de la solicitud
    const body = await request.json();
    const { date, startTime, paymentId, additionalAmount } = body;

    // Validar campos requeridos
    if (!date || !startTime || !paymentId) {
      return validationErrorResponse("Fecha, hora y ID de pago son requeridos");
    }

    // Obtener la reserva y verificar que pertenece al usuario
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, status, reschedule_count, date, start_time, payment_id"
      )
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Verificar que la reserva pertenece al usuario autenticado
    if (reservation.user_id !== user.id) {
      return unauthorizedResponse(
        "No tienes permisos para completar el reagendamiento de esta reserva"
      );
    }

    // Verificar que el status es 'confirmed'
    if (reservation.status !== "confirmed") {
      return errorResponse(
        "Solo se pueden reagendar reservas confirmadas",
        400
      );
    }

    // Verificar límite de reagendamientos (solo 1 intento permitido)
    if ((reservation.reschedule_count || 0) >= 1) {
      return errorResponse(
        "Solo se permite un reagendamiento por reserva. Ya has utilizado tu intento.",
        400
      );
    }

    // Calcular end_time
    const endTime = calculateEndTime(startTime);

    // Guardar valores originales antes de actualizar (solo si es la primera vez que se reagenda)
    const updateData: Record<string, unknown> = {
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      additional_payment_id: paymentId, // Guardar el ID del pago adicional
      reschedule_count: (reservation.reschedule_count || 0) + 1,
    };

    // Si hay monto adicional, guardarlo
    if (
      additionalAmount &&
      typeof additionalAmount === "number" &&
      additionalAmount > 0
    ) {
      updateData.additional_payment_amount = additionalAmount;
    }

    // Si es la primera vez que se reagenda, guardar valores originales
    if ((reservation.reschedule_count || 0) === 0) {
      updateData.original_date = reservation.date;
      updateData.original_start_time = reservation.start_time;
      if (reservation.payment_id) {
        updateData.original_payment_id = reservation.payment_id;
      }
    }

    // Actualizar la reserva
    const { data: updatedReservation, error: updateError } = await supabase
      .from("reservations")
      .update(updateData)
      .eq("id", reservationId)
      .select()
      .single();

    if (updateError) {
      console.error("Error completing reschedule:", updateError);
      return errorResponse("Error al completar el reagendamiento", 500);
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
    return errorResponse(errorMessage, 500);
  }
}
