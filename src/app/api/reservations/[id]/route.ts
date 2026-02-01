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

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];

export async function GET(
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

    // Obtener la reserva usando service role para evitar problemas de RLS
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, payment_id, status, created_at, last_minute_discount, loyalty_discount, loyalty_points_used, credits_used, referral_discount, discount_code, discount_code_discount, refund_amount, refund_id, refund_status, cancelled_at, reschedule_count, original_date, original_start_time, original_payment_id, additional_payment_id, additional_payment_amount, user_id"
      )
      .eq("id", reservationId)
      .single();

    if (error || !data) {
      console.error("Error loading reservation:", error);
      return notFoundResponse("Reserva");
    }

    // Type assertion para ayudar a TypeScript
    const reservationData = data as ReservationRow;

    // Si hay usuario autenticado, verificar pertenencia; si no, permitir (flujo invitado/confirmación)
    if (user && reservationData.user_id && reservationData.user_id !== user.id) {
      return unauthorizedResponse("No tienes permisos para ver esta reserva");
    }

    // Si no hay sesión, comprobar si el email de la reserva ya tiene cuenta (para UI de confirmación)
    let hasAccount: boolean | undefined;
    if (!user && reservationData.email) {
      const normalized = String(reservationData.email).toLowerCase().trim();
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalized)
        .limit(1)
        .maybeSingle();
      hasAccount = !!userRow;
    }

    return successResponse({
      reservation: reservationData,
      ...(hasAccount !== undefined && { hasAccount }),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
