import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyGuestToken } from "@/lib/auth/guest-tokens";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
} from "@/utils/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return errorResponse("Token requerido", 400);
    }

    // Verificar y decodificar el token
    const tokenResult = await verifyGuestToken(token);
    if (!tokenResult.valid || !tokenResult.payload) {
      return errorResponse(
        tokenResult.error || "Token inválido o expirado",
        401
      );
    }

    const { email, reservationId: reservationIdStr } = tokenResult.payload;

    // Parsear y validar ID numérico (reservations.id es INTEGER)
    const reservationId =
      typeof reservationIdStr === "string"
        ? parseInt(reservationIdStr, 10)
        : NaN;
    if (isNaN(reservationId) || reservationId <= 0) {
      return errorResponse("Token inválido: ID de reserva inválido", 400);
    }

    // Obtener la reserva de la base de datos
    // El email del token ya está normalizado (lowercase), y las reservas también se almacenan normalizadas
    // Usamos .ilike() para comparación case-insensitive como medida adicional de seguridad
    const supabase = createServiceRoleClient();
    const { data: reservation, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, status, payment_id, created_at, reschedule_count, original_date, original_start_time, original_payment_id, additional_payment_amount, additional_payment_id, last_minute_discount, loyalty_discount, loyalty_points_used, credits_used, referral_discount, discount_code, discount_code_discount, refund_amount, refund_id, refund_status, cancelled_at"
      )
      .eq("id", reservationId)
      .ilike("email", email)
      .single();

    if (error || !reservation) {
      return notFoundResponse("Reserva");
    }

    return successResponse({
      reservation,
      token: tokenResult.payload,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
