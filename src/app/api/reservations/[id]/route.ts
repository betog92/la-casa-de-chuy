import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
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
        "id, email, name, phone, date, start_time, end_time, price, original_price, payment_id, payment_method, status, created_at, last_minute_discount, loyalty_discount, loyalty_points_used, credits_used, referral_discount, discount_code, discount_code_discount, refund_amount, refund_id, refund_status, cancelled_at, reschedule_count, original_date, original_start_time, original_payment_id, additional_payment_id, additional_payment_amount, additional_payment_method, user_id, created_by_user_id, rescheduled_by_user_id, cancelled_by_user_id, source, google_event_id, import_type, order_number, import_notes"
      )
      .eq("id", reservationId)
      .single();

    if (error || !data) {
      console.error("Error loading reservation:", error);
      return notFoundResponse("Reserva");
    }

    // Type assertion para ayudar a TypeScript
    const reservationData = data as ReservationRow;

    // Admins pueden ver cualquier reserva (solo consultar si hay sesión para evitar llamada innecesaria)
    const isAdmin = user ? (await requireAdmin()).isAdmin : false;

    // Si hay usuario autenticado, verificar pertenencia (o ser admin); si no, permitir (flujo invitado/confirmación)
    if (
      !isAdmin &&
      user &&
      reservationData.user_id &&
      reservationData.user_id !== user.id
    ) {
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

    // Una sola query de users para created_by, rescheduled_by, cancelled_by y historial
    const createdByUserId = (reservationData as { created_by_user_id?: string | null }).created_by_user_id;
    const rescheduledByUserId = (reservationData as { rescheduled_by_user_id?: string | null }).rescheduled_by_user_id;
    const cancelledByUserId = (reservationData as { cancelled_by_user_id?: string | null }).cancelled_by_user_id;
    const historyUserIds = historyList.map((h) => h.rescheduled_by_user_id).filter(Boolean) as string[];
    const allUserIds = [...new Set([createdByUserId, rescheduledByUserId, cancelledByUserId, ...historyUserIds].filter(Boolean))] as string[];
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
    const created_by = createdByUserId ? usersMap[createdByUserId] ?? null : null;
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
      ...reservationData,
      created_by,
      rescheduled_by,
      cancelled_by,
      reschedule_history,
    };

    return successResponse({
      reservation,
      ...(hasAccount !== undefined && { hasAccount }),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}

/** PATCH: Actualizar detalle de la reserva (solo admin) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("Solo un administrador puede editar la reserva");
  }

  try {
    const { id: rawId } = await params;
    const reservationId =
      typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
    if (isNaN(reservationId) || reservationId <= 0) {
      return validationErrorResponse("ID de reserva inválido");
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Cuerpo de la petición no es JSON válido");
    }
    const updatePayload: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      updatePayload.name = body.name.trim() || body.name;
    }
    if (typeof body.email === "string") {
      updatePayload.email = body.email.trim() || body.email;
    }
    if (typeof body.phone === "string") {
      updatePayload.phone = body.phone.trim();
    }
    if (body.order_number !== undefined) {
      updatePayload.order_number = body.order_number === "" || body.order_number == null ? null : String(body.order_number).trim();
    }
    if (body.import_notes !== undefined) {
      const raw = body.import_notes === "" || body.import_notes == null ? null : String(body.import_notes).trim();
      const maxNotesLength = 10000;
      updatePayload.import_notes = raw === null ? null : raw.slice(0, maxNotesLength);
    }

    if (Object.keys(updatePayload).length === 0) {
      return validationErrorResponse("No hay campos válidos para actualizar");
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("reservations")
      .update(updatePayload)
      .eq("id", reservationId)
      .select("id, name, email, phone, order_number, import_notes")
      .single();

    if (error) {
      console.error("Error updating reservation:", error);
      return errorResponse("Error al actualizar la reserva", 500);
    }
    if (!data) {
      return notFoundResponse("Reserva");
    }

    return successResponse({ reservation: data });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al actualizar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
