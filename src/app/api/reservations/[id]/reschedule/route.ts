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
import { sendRescheduleConfirmation } from "@/lib/email";
import { verifyGuestToken, generateGuestReservationUrl } from "@/lib/auth/guest-tokens";
import type { Database } from "@/types/database.types";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationUpdate = Database["public"]["Tables"]["reservations"]["Update"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const reservationId =
      typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
    if (isNaN(reservationId) || reservationId <= 0) {
      return validationErrorResponse("ID de reserva inválido");
    }

    // Obtener el cuerpo de la solicitud
    let body: { date?: string; startTime?: string; token?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Si no hay body o es inválido, body queda como objeto vacío
    }
    const { date, startTime, token: guestToken } = body;

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

    // Obtener la reserva
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select("id, user_id, status, date, start_time, reschedule_count, price, payment_id, email")
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Type assertion para ayudar a TypeScript
    const reservationRow = reservation as Pick<
      ReservationRow,
      "id" | "user_id" | "status" | "date" | "start_time" | "reschedule_count" | "price" | "payment_id" | "email"
    >;

    // Validar autorización: usuario autenticado O token de invitado válido
    if (user) {
      // Usuario autenticado: verificar que la reserva pertenece al usuario
      if (reservationRow.user_id !== user.id) {
        return unauthorizedResponse("No tienes permisos para reagendar esta reserva");
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
        return unauthorizedResponse("No tienes permisos para reagendar esta reserva");
      }
    } else {
      // Sin autenticación ni token
      return unauthorizedResponse(
        "Debes iniciar sesión o proporcionar un token válido para reagendar una reserva"
      );
    }

    // Verificar que el status es 'confirmed'
    if (reservationRow.status !== "confirmed") {
      return errorResponse(
        "Solo se pueden reagendar reservas confirmadas",
        400
      );
    }

    // Verificar límite de reagendamientos (solo 1 intento permitido)
    if ((reservationRow.reschedule_count || 0) >= 1) {
      return errorResponse(
        "Solo se permite un reagendamiento por reserva. Ya has utilizado tu intento.",
        400
      );
    }

    // Calcular días hábiles desde mañana hasta la fecha actual de la reserva
    const tomorrow = addDays(today, 1);
    const currentReservationDate = startOfDay(
      parse(reservationRow.date, "yyyy-MM-dd", new Date())
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
    const currentPrice = reservationRow.price;

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
    const updateData: ReservationUpdate = {
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      reschedule_count: (reservationRow.reschedule_count || 0) + 1,
    };

    // Si es la primera vez que se reagenda, guardar valores originales
    if ((reservationRow.reschedule_count || 0) === 0) {
      updateData.original_date = reservationRow.date;
      updateData.original_start_time = reservationRow.start_time;
      if (reservationRow.payment_id) {
        updateData.original_payment_id = reservationRow.payment_id;
      }
    }

    // Actualizar la reserva
    const { data: updatedReservation, error: updateError } = await supabase
      .from("reservations")
      // @ts-expect-error - TypeScript tiene problemas con tipos de Supabase cuando se usan selects parciales
      .update(updateData)
      .eq("id", reservationId)
      .select("email, name, date, start_time, additional_payment_amount")
      .single();

    if (updateError) {
      console.error("Error rescheduling reservation:", updateError);
      return errorResponse("Error al reagendar la reserva", 500);
    }

    // Enviar email de confirmación (no hay pago adicional)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const manageUrl = guestToken
      ? generateGuestReservationUrl(guestToken)
      : `${baseUrl}/reservaciones/${reservationId}`;
    const row = updatedReservation as {
      email?: string | null;
      name?: string | null;
      date?: string;
      start_time?: string | null;
      additional_payment_amount?: number | null;
    };
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
        additionalAmount: null, // No hay pago adicional en este caso
      })
        .then((r) => {
          if (!r.ok) console.error("Error email reagendamiento:", r.error);
        })
        .catch((e) =>
          console.error("Error inesperado enviando email reagendamiento:", e)
        );
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

