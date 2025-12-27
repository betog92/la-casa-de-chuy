import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parse, addDays, startOfDay } from "date-fns";
import { calculateBusinessDays, getMonterreyToday } from "@/utils/business-days";
import { calculatePriceWithCustom } from "@/utils/pricing";
import {
  calculateEndTime,
  validateSlotAvailability,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
  conflictResponse,
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
      return unauthorizedResponse("Debes iniciar sesión para reagendar una reserva");
    }

    // Obtener el cuerpo de la solicitud
    const body = await request.json();
    const { date, startTime } = body;

    // Validar campos requeridos
    if (!date || !startTime) {
      return validationErrorResponse("Fecha y hora de reagendamiento requeridas");
    }

    // Validar formato de fecha
    let newDate: Date;
    try {
      newDate = parse(date, "yyyy-MM-dd", new Date());
    } catch {
      return validationErrorResponse("Formato de fecha inválido");
    }

    // Validar que la nueva fecha no sea en el pasado
    const today = getMonterreyToday();
    const newDateNormalized = startOfDay(newDate);
    if (newDateNormalized < today) {
      return validationErrorResponse("No se puede reagendar a una fecha pasada");
    }

    // Obtener la reserva y verificar que pertenece al usuario
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select("id, user_id, status, date, start_time, reschedule_count, price, payment_id")
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Verificar que la reserva pertenece al usuario autenticado
    if (reservation.user_id !== user.id) {
      return unauthorizedResponse("No tienes permisos para reagendar esta reserva");
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

    // Calcular días hábiles desde mañana hasta la fecha actual de la reserva
    const tomorrow = addDays(today, 1);
    const currentReservationDate = startOfDay(
      parse(reservation.date, "yyyy-MM-dd", new Date())
    );

    const businessDays = calculateBusinessDays(tomorrow, currentReservationDate);

    // Si < 5 días hábiles, rechazar reagendamiento completamente
    if (businessDays < 5) {
      return errorResponse(
        `El reagendamiento solo está disponible con al menos 5 días hábiles de anticipación. Faltan ${businessDays} día${businessDays !== 1 ? "s" : ""} hábil${businessDays !== 1 ? "es" : ""}.`,
        400
      );
    }

    // Validar que el nuevo slot esté disponible
    const isAvailable = await validateSlotAvailability(supabase, date, startTime);
    if (!isAvailable) {
      return conflictResponse(
        "El horario seleccionado ya no está disponible. Por favor selecciona otro horario."
      );
    }

    // Calcular el precio de la nueva fecha
    const newPrice = await calculatePriceWithCustom(supabase, newDate);
    const currentPrice = reservation.price;

    // Comparar precios para determinar si se requiere pago adicional
    if (newPrice > currentPrice) {
      // Requiere pago adicional - NO actualizar la reserva todavía
      const additionalAmount = newPrice - currentPrice;
      return successResponse({
        message: "Reagendamiento requiere pago adicional",
        requiresPayment: true,
        additionalAmount,
        newPrice,
        currentPrice,
      });
    }

    // No requiere pago adicional - proceder con el reagendamiento directamente
    // Calcular end_time
    const endTime = calculateEndTime(startTime);

    // Guardar valores originales antes de actualizar (solo si es la primera vez que se reagenda)
    const updateData: Record<string, unknown> = {
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      reschedule_count: (reservation.reschedule_count || 0) + 1,
    };

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
      console.error("Error rescheduling reservation:", updateError);
      return errorResponse("Error al reagendar la reserva", 500);
    }

    return successResponse({
      message: "Reserva reagendada exitosamente",
      requiresPayment: false,
      reservation: updatedReservation,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al reagendar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}

