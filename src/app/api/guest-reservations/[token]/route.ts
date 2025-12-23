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

    const { email, reservationId } = tokenResult.payload;

    // Obtener la reserva de la base de datos
    // El email del token ya está normalizado (lowercase), y las reservas también se almacenan normalizadas
    // Usamos .ilike() para comparación case-insensitive como medida adicional de seguridad
    const supabase = createServiceRoleClient();
    const { data: reservation, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, status, payment_id, created_at"
      )
      .eq("id", reservationId)
      .ilike("email", email)
      .single();

    if (error || !reservation) {
      return notFoundResponse("Reserva");
    }

    // Verificar que la reserva no esté completada o cancelada
    const reservationData = reservation as {
      status: string;
      id: string;
      email: string;
      name: string;
      phone: string;
      date: string;
      start_time: string; // TIME se devuelve como string desde PostgreSQL
      end_time: string; // TIME se devuelve como string desde PostgreSQL
      price: number;
      original_price: number;
      payment_id: string | null;
      created_at: string;
    };

    if (
      reservationData.status === "completed" ||
      reservationData.status === "cancelled"
    ) {
      return errorResponse(
        "Esta reserva ya ha sido completada o cancelada",
        403
      );
    }

    return successResponse({
      reservation: reservationData,
      token: tokenResult.payload,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
