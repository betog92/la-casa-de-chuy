import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/admin/availability/day?date=YYYY-MM-DD
 *
 * Devuelve toda la información necesaria para el panel del día:
 * - availability (override): is_closed, is_holiday, custom_price (o null si no hay)
 * - slots: lista de time_slots de ese día (con available e is_occupied)
 * - reservations: reservas confirmadas del día (id, name, start_time, end_time, status)
 *
 * Si el día no tiene slots generados, los crea con `ensure_time_slots_for_date`.
 */
export async function GET(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !DATE_REGEX.test(date)) {
      return validationErrorResponse("Se requiere date (yyyy-MM-dd)");
    }

    const supabase = createServiceRoleClient();

    const fetchSlots = async () =>
      supabase
        .from("time_slots")
        .select("id, start_time, end_time, available, is_occupied")
        .eq("date", date)
        .order("start_time", { ascending: true });

    let { data: slotRows, error: slotsErr } = await fetchSlots();

    if (!slotsErr && (!slotRows || slotRows.length === 0)) {
      // Generar slots on-demand para fechas dentro del rango permitido
      const { error: ensureErr } = await supabase.rpc(
        "ensure_time_slots_for_date",
        { p_date: date } as never
      );
      if (!ensureErr) {
        const retry = await fetchSlots();
        slotRows = retry.data;
        slotsErr = retry.error;
      }
      // Si la RPC falla (ej. fecha pasada o > 6 meses), seguimos con lista vacía
    }

    if (slotsErr) {
      console.error("Error listing slots:", slotsErr);
      return errorResponse("Error al cargar horarios", 500);
    }

    const { data: availabilityRow, error: availErr } = await supabase
      .from("availability")
      .select("id, date, is_closed, is_holiday, custom_price")
      .eq("date", date)
      .maybeSingle();
    if (availErr) {
      console.error("Error loading availability:", availErr);
      return errorResponse("Error al cargar disponibilidad", 500);
    }

    const { data: reservationRows, error: resErr } = await supabase
      .from("reservations")
      .select("id, name, email, start_time, end_time, status")
      .eq("date", date)
      .eq("status", "confirmed")
      .order("start_time", { ascending: true });
    if (resErr) {
      console.error("Error loading reservations:", resErr);
      return errorResponse("Error al cargar reservas", 500);
    }

    type SlotRow = {
      id: string;
      start_time: string;
      end_time: string;
      available: boolean;
      is_occupied: boolean;
    };
    type ReservationRow = {
      id: number;
      name: string;
      email: string;
      start_time: string;
      end_time: string;
      status: "confirmed" | "cancelled" | "completed";
    };

    const reservations = (reservationRows ?? []) as ReservationRow[];
    const slots = (slotRows ?? []) as SlotRow[];

    // Map slot -> reserva (por start_time HH:MM:SS)
    const reservationByTime = new Map<string, ReservationRow>();
    for (const r of reservations) {
      reservationByTime.set(r.start_time, r);
    }

    const slotsWithReservation = slots.map((s) => ({
      ...s,
      reservation: reservationByTime.get(s.start_time)
        ? {
            id: reservationByTime.get(s.start_time)!.id,
            name: reservationByTime.get(s.start_time)!.name,
          }
        : null,
    }));

    return successResponse({
      date,
      availability: availabilityRow ?? null,
      slots: slotsWithReservation,
      reservations,
    });
  } catch (error) {
    console.error("Error in admin availability/day GET:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar el día",
      500
    );
  }
}
