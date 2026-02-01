import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parse, addDays, startOfDay } from "date-fns";
import {
  calculateBusinessDays,
  getMonterreyToday,
} from "@/utils/business-days";
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
import { sendCancellationConfirmation } from "@/lib/email";
import { verifyGuestToken, generateGuestReservationUrl } from "@/lib/auth/guest-tokens";
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

    // Obtener el body para verificar si hay token de invitado
    const body = await request.json().catch(() => ({}));
    const guestToken = body.token as string | undefined;

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

    // Obtener la reserva
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, status, date, start_time, price, additional_payment_amount, email, name"
      )
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    const reservationRow = reservation as {
      id: string;
      user_id: string | null;
      status: string;
      date: string;
      start_time: string | null;
      price: number;
      additional_payment_amount: number | null;
      email: string | null;
      name: string | null;
    };

    // Validar autorización: usuario autenticado O token de invitado válido
    if (user) {
      // Usuario autenticado: verificar que la reserva pertenece al usuario
      if (reservationRow.user_id !== user.id) {
        return unauthorizedResponse(
          "No tienes permisos para cancelar esta reserva"
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
      const reservationEmail = (reservationRow.email || "").toLowerCase().trim();
      if (tokenEmail !== reservationEmail || tokenResult.payload.reservationId !== reservationId) {
        return unauthorizedResponse(
          "No tienes permisos para cancelar esta reserva"
        );
      }
    } else {
      // Sin autenticación ni token
      return unauthorizedResponse(
        "Debes iniciar sesión o proporcionar un token válido para cancelar una reserva"
      );
    }

    // Verificar que el status es 'confirmed'
    if (reservationRow.status !== "confirmed") {
      return errorResponse("Solo se pueden cancelar reservas confirmadas", 400);
    }

    // Calcular días hábiles desde mañana hasta la fecha de la reserva
    const today = getMonterreyToday();
    const tomorrow = addDays(today, 1);
    const reservationDate = startOfDay(
      parse(reservationRow.date, "yyyy-MM-dd", new Date())
    );

    const businessDays = calculateBusinessDays(tomorrow, reservationDate);

    // Si < 5 días hábiles, rechazar cancelación completamente
    if (businessDays < 5) {
      return errorResponse(
        `La cancelación solo está disponible con al menos 5 días hábiles de anticipación. Faltan ${businessDays} día${
          businessDays !== 1 ? "s" : ""
        } hábil${businessDays !== 1 ? "es" : ""}.`,
        400
      );
    }

    // Calcular el total pagado (precio + pago adicional si existe)
    const totalPaid = calculateTotalPaid(
      reservationRow.price,
      reservationRow.additional_payment_amount
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
      } as never)
      .eq("id", reservationId);

    if (updateError) {
      console.error("Error cancelling reservation:", updateError);
      return errorResponse("Error al cancelar la reserva", 500);
    }

    // Revocar puntos y créditos asociados a esta reserva
    // Incluye puntos de referidos: si el referido cancela, se revocan también
    // los puntos otorgados al que refirió (asumiendo que se almacenan con este reservation_id).
    const revokeTimestamp = new Date().toISOString();

    // Puntos de lealtad (revocar todos los ligados a la reserva)
    type LoyaltyRow = {
      id: string;
      user_id: string | null;
      points: number | null;
      used: boolean;
      expires_at: string | null;
    };

    const { data: loyaltyData, error: fetchLoyaltyError } = await supabase
      .from("loyalty_points")
      .select("id, user_id, points, used, expires_at")
      .eq("reservation_id", reservationId)
      .eq("revoked", false);

    if (fetchLoyaltyError) {
      console.error("Error consultando puntos de lealtad:", fetchLoyaltyError);
    } else {
      const loyaltyRows = (loyaltyData as LoyaltyRow[] | null) || [];

      if (loyaltyRows.length > 0) {
        const loyaltyIds = loyaltyRows.map((row) => row.id);

        const { error: revokeAllLoyaltyError } = await supabase
          .from("loyalty_points")
          .update({ revoked: true, revoked_at: revokeTimestamp } as never)
          .in("id", loyaltyIds);

        if (revokeAllLoyaltyError) {
          console.error(
            "Error revocando puntos de lealtad:",
            revokeAllLoyaltyError
          );
        }
      }
    }

    // Créditos: revocar todos los ligados a la reserva
    type CreditRow = {
      id: string;
      user_id: string | null;
      amount: number | null;
      used: boolean;
      expires_at: string | null;
    };

    const { data: creditsData, error: fetchCreditsError } = await supabase
      .from("credits")
      .select("id, user_id, amount, used, expires_at")
      .eq("reservation_id", reservationId)
      .eq("revoked", false);

    if (fetchCreditsError) {
      console.error("Error consultando créditos:", fetchCreditsError);
    } else {
      const creditRows = (creditsData as CreditRow[] | null) || [];

      if (creditRows.length > 0) {
        const creditIds = creditRows.map((row) => row.id);

        const { error: revokeAllCreditsError } = await supabase
          .from("credits")
          .update({ revoked: true, revoked_at: revokeTimestamp } as never)
          .in("id", creditIds);

        if (revokeAllCreditsError) {
          console.error("Error revocando créditos:", revokeAllCreditsError);
        }
      }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const manageUrl = guestToken
      ? generateGuestReservationUrl(guestToken)
      : `${baseUrl}/reservaciones/${reservationId}`;
    const to = (reservationRow.email || "").trim();
    const name = (reservationRow.name || "Cliente").trim();
    const startTime = reservationRow.start_time || "00:00";

    if (to) {
      sendCancellationConfirmation({
        to,
        name,
        date: reservationRow.date || "",
        startTime,
        refundAmount,
        reservationId,
        manageUrl,
      })
        .then((r) => {
          if (!r.ok) console.error("Error email cancelación:", r.error);
        })
        .catch((e) =>
          console.error("Error inesperado enviando email cancelación:", e)
        );
    }

    return successResponse({
      message: "Reserva cancelada exitosamente",
      refund_amount: refundAmount,
      refund_id: dummyRefundId,
      refund_status: "pending",
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cancelar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
