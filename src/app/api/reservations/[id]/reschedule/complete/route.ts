import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
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
import {
  sendRescheduleConfirmation,
} from "@/lib/email";
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

    // Validar campos requeridos
    if (!date || !startTime || !paymentId) {
      return validationErrorResponse("Fecha, hora y ID de pago son requeridos");
    }

    // Obtener la reserva
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, status, reschedule_count, date, start_time, payment_id, email"
      )
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Type assertion para ayudar a TypeScript
    const reservationRow = reservation as Pick<
      ReservationRow,
      "id" | "user_id" | "status" | "reschedule_count" | "date" | "start_time" | "payment_id" | "email"
    >;

    // Validar autorización: usuario autenticado O token de invitado válido
    if (user) {
      // Usuario autenticado: verificar que la reserva pertenece al usuario
      if (reservationRow.user_id !== user.id) {
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

    // Verificar límite de reagendamientos (solo 1 intento permitido)
    if ((reservationRow.reschedule_count || 0) >= 1) {
      return errorResponse(
        "Solo se permite un reagendamiento por reserva. Ya has utilizado tu intento.",
        400
      );
    }

    // Validar que el nuevo slot esté disponible (evita race condition)
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

    // Calcular end_time
    const endTime = calculateEndTime(startTime);

    // Guardar valores originales antes de actualizar (solo si es la primera vez que se reagenda)
    const updateData: ReservationUpdate = {
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      additional_payment_id: paymentId, // Guardar el ID del pago adicional
      reschedule_count: (reservationRow.reschedule_count || 0) + 1,
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
      if (noRows) {
        return conflictResponse(
          "Solo se permite un reagendamiento por reserva. Ya has utilizado tu intento."
        );
      }
      console.error("Error completing reschedule:", updateError);
      return errorResponse("Error al completar el reagendamiento", 500);
    }

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
    return errorResponse(errorMessage, 500);
  }
}
