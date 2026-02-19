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
    const { data: reservationData, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, status, payment_id, created_at, reschedule_count, original_date, original_start_time, original_payment_id, additional_payment_amount, additional_payment_id, additional_payment_method, rescheduled_by_user_id, cancelled_by_user_id, last_minute_discount, loyalty_discount, loyalty_points_used, credits_used, referral_discount, discount_code, discount_code_discount, refund_amount, refund_id, refund_status, cancelled_at"
      )
      .eq("id", reservationId)
      .ilike("email", email)
      .single();

    if (error || !reservationData) {
      return notFoundResponse("Reserva");
    }

    // Historial de reagendamientos (todos, orden cronológico)
    type HistoryRow = {
      id: number;
      rescheduled_at: string;
      rescheduled_by_user_id: string | null;
      previous_date: string;
      previous_start_time: string;
      new_date: string;
      new_start_time: string;
      additional_payment_amount: number | null;
      additional_payment_method: string | null;
    };
    const { data: historyRows } = await supabase
      .from("reservation_reschedule_history")
      .select("id, rescheduled_at, rescheduled_by_user_id, previous_date, previous_start_time, new_date, new_start_time, additional_payment_amount, additional_payment_method")
      .eq("reservation_id", reservationId)
      .order("rescheduled_at", { ascending: true });
    const historyList = (historyRows ?? []) as HistoryRow[];

    // Una sola query de users para rescheduled_by, cancelled_by e historial
    const rescheduledByUserId = (reservationData as { rescheduled_by_user_id?: string | null }).rescheduled_by_user_id;
    const cancelledByUserId = (reservationData as { cancelled_by_user_id?: string | null }).cancelled_by_user_id;
    const historyUserIds = historyList.map((h) => h.rescheduled_by_user_id).filter(Boolean) as string[];
    const allUserIds = [...new Set([rescheduledByUserId, cancelledByUserId, ...historyUserIds].filter(Boolean))] as string[];
    let usersMap: Record<string, { id: string; name: string | null; email: string }> = {};
    if (allUserIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", allUserIds);
      const users = (usersData ?? []) as { id: string; name: string | null; email: string }[];
      for (const u of users) {
        usersMap[u.id] = { id: u.id, name: u.name ?? null, email: u.email };
      }
    }
    const rescheduled_by = rescheduledByUserId ? usersMap[rescheduledByUserId] ?? null : null;
    const cancelled_by = cancelledByUserId ? usersMap[cancelledByUserId] ?? null : null;
    const reschedule_history = historyList.map((h) => ({
      rescheduled_at: h.rescheduled_at,
      rescheduled_by: h.rescheduled_by_user_id ? usersMap[h.rescheduled_by_user_id] ?? null : null,
      previous_date: h.previous_date,
      previous_start_time: h.previous_start_time,
      new_date: h.new_date,
      new_start_time: h.new_start_time,
      additional_payment_amount: h.additional_payment_amount,
      additional_payment_method: h.additional_payment_method,
    }));

    const reservation = {
      ...(reservationData as Record<string, unknown>),
      rescheduled_by,
      cancelled_by,
      reschedule_history,
    };

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
