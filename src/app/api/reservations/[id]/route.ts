import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import type { Database } from "@/types/database.types";

export async function GET(
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
      return unauthorizedResponse("Debes iniciar sesión para ver esta reserva");
    }

    // Obtener la reserva usando service role para evitar problemas de RLS
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, payment_id, status, created_at, last_minute_discount, loyalty_discount, loyalty_points_used, credits_used, referral_discount, discount_code, discount_code_discount, refund_amount, refund_id, cancelled_at, reschedule_count, original_date, original_start_time, original_payment_id, additional_payment_id, additional_payment_amount, user_id"
      )
      .eq("id", reservationId)
      .single();

    if (error || !data) {
      console.error("Error loading reservation:", error);
      return notFoundResponse("Reserva");
    }

    // Verificar que la reserva pertenece al usuario autenticado
    if (data.user_id !== user.id) {
      return unauthorizedResponse("No tienes permisos para ver esta reserva");
    }

    return successResponse({ reservation: data });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
