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
  calculateRefundAmount,
  getTotalConektaPaid,
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
import { requireAdmin } from "@/lib/auth/admin";
import type { Database } from "@/types/database.types";

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
    } = await authClient.auth.getUser();

    let isAdmin = false;
    if (user) {
      const adminCheck = await requireAdmin();
      isAdmin = adminCheck.isAdmin;
    }

    // Obtener la reserva (payment_method y original_price para calcular reembolso solo Conekta)
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, status, date, start_time, price, original_price, payment_method, additional_payment_amount, email, name"
      )
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    const reservationRow = reservation as {
      id: number;
      user_id: string | null;
      status: string;
      date: string;
      start_time: string | null;
      price: number;
      original_price: number;
      payment_method: string | null;
      additional_payment_amount: number | null;
      email: string | null;
      name: string | null;
    };

    // Historial de reagendos para sumar pagos adicionales por Conekta
    const { data: historyRows } = await supabase
      .from("reservation_reschedule_history")
      .select("additional_payment_amount, additional_payment_method")
      .eq("reservation_id", reservationId)
      .order("rescheduled_at", { ascending: true });
    const historyList = (historyRows ?? []) as {
      additional_payment_amount: number | null;
      additional_payment_method: string | null;
    }[];

    // Validar autorización: usuario autenticado O token de invitado válido (admin puede cancelar cualquier reserva)
    if (user) {
      if (reservationRow.user_id !== user.id && !isAdmin) {
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
      if (tokenEmail !== reservationEmail || tokenResult.payload.reservationId !== String(reservationId)) {
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

    // Si < 5 días hábiles, rechazar cancelación (admin puede cancelar en cualquier momento)
    if (!isAdmin && businessDays < 5) {
      return errorResponse(
        `La cancelación solo está disponible con al menos 5 días hábiles de anticipación. Faltan ${businessDays} día${
          businessDays !== 1 ? "s" : ""
        } hábil${businessDays !== 1 ? "es" : ""}.`,
        400
      );
    }

    // Reembolso solo por lo pagado con Conekta (reservación inicial + adicionales por tarjeta)
    const originalPrice =
      reservationRow.original_price ?? reservationRow.price ?? 0;
    const totalConektaPaid = getTotalConektaPaid(
      reservationRow.payment_method,
      originalPrice,
      historyList
    );
    const refundAmount = calculateRefundAmount(totalConektaPaid);

    // TODO: Integrar con Conekta API para procesar el reembolso real
    // Por ahora, generar un refund_id dummy
    const dummyRefundId = generateDummyRefundId();

    // Actualizar la reserva (guardar quién canceló si fue admin)
    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        refund_amount: refundAmount,
        refund_status: "pending",
        refund_id: dummyRefundId,
        cancelled_at: new Date().toISOString(),
        ...(isAdmin && user && { cancelled_by_user_id: user.id }),
      } as never)
      .eq("id", reservationId);

    if (updateError) {
      console.error("Error cancelling reservation:", updateError);
      return errorResponse("Error al cancelar la reserva", 500);
    }

    // Revocar puntos y créditos asociados a esta reserva (en paralelo)
    const revokeTimestamp = new Date().toISOString();

    const [loyaltyResult, creditsResult] = await Promise.all([
      supabase
        .from("loyalty_points")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("revoked", false),
      supabase
        .from("credits")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("revoked", false),
    ]);

    const loyaltyIds =
      !loyaltyResult.error && Array.isArray(loyaltyResult.data) && loyaltyResult.data.length > 0
        ? (loyaltyResult.data as { id: string }[]).map((r) => r.id)
        : [];
    const creditIds =
      !creditsResult.error && Array.isArray(creditsResult.data) && creditsResult.data.length > 0
        ? (creditsResult.data as { id: string }[]).map((r) => r.id)
        : [];

    const [revokeLoyaltyOut, revokeCreditsOut] = await Promise.all([
      loyaltyIds.length > 0
        ? supabase
            .from("loyalty_points")
            .update({ revoked: true, revoked_at: revokeTimestamp } as never)
            .in("id", loyaltyIds)
        : Promise.resolve({ error: null }),
      creditIds.length > 0
        ? supabase
            .from("credits")
            .update({ revoked: true, revoked_at: revokeTimestamp } as never)
            .in("id", creditIds)
        : Promise.resolve({ error: null }),
    ]);

    if (loyaltyResult.error) {
      console.error("Error consultando puntos de lealtad:", loyaltyResult.error);
    }
    if (revokeLoyaltyOut.error) {
      console.error("Error revocando puntos de lealtad:", revokeLoyaltyOut.error);
    }
    if (creditsResult.error) {
      console.error("Error consultando créditos:", creditsResult.error);
    }
    if (revokeCreditsOut.error) {
      console.error("Error revocando créditos:", revokeCreditsOut.error);
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

    // Si canceló un admin, devolver cancelled_by para que el front no tenga que hacer refetch
    let cancelled_by: { id: string; name: string | null; email: string } | null = null;
    if (isAdmin && user) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("id", user.id)
        .maybeSingle();
      if (userRow) {
        const row = userRow as { id: string; name: string | null; email: string };
        cancelled_by = { id: row.id, name: row.name ?? null, email: row.email };
      }
    }

    return successResponse({
      message: "Reserva cancelada exitosamente",
      refund_amount: refundAmount,
      refund_id: dummyRefundId,
      refund_status: "pending",
      cancelled_by,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cancelar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
