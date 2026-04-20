import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
  conflictResponse,
} from "@/utils/api-response";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * PATCH /api/admin/time-slots
 *
 * Body: { date: string, startTime: string, available: boolean }
 *
 * Habilita o deshabilita un slot individual de una fecha. No permite
 * deshabilitar slots que ya tienen una reserva confirmada.
 */
export async function PATCH(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const body = await request.json();
    const { date, startTime, available } = body as {
      date?: string;
      startTime?: string;
      available?: boolean;
    };

    if (!date || !DATE_REGEX.test(date)) {
      return validationErrorResponse("Se requiere date (yyyy-MM-dd)");
    }
    if (!startTime || !TIME_REGEX.test(startTime)) {
      return validationErrorResponse("Se requiere startTime (HH:MM)");
    }
    if (typeof available !== "boolean") {
      return validationErrorResponse("Se requiere available (boolean)");
    }

    const normalizedTime =
      startTime.length === 5 ? `${startTime}:00` : startTime;

    const supabase = createServiceRoleClient();

    // Asegurar que el slot exista (solo necesario en el camino habilitar)
    const { data: existing, error: fetchErr } = await supabase
      .from("time_slots")
      .select("id, available, is_occupied")
      .eq("date", date)
      .eq("start_time", normalizedTime)
      .maybeSingle();

    if (fetchErr) {
      console.error("Error fetching slot:", fetchErr);
      return errorResponse("Error al consultar el horario", 500);
    }

    if (!existing) {
      return notFoundResponse("Horario");
    }

    const slot = existing as {
      id: string;
      available: boolean;
      is_occupied: boolean;
    };

    if (available === false && slot.is_occupied) {
      return conflictResponse(
        "Este horario tiene una reserva confirmada y no se puede deshabilitar"
      );
    }

    if (slot.available === available) {
      return successResponse({
        slot: { id: slot.id, available, is_occupied: slot.is_occupied },
      });
    }

    const { data: updated, error: updErr } = await supabase
      .from("time_slots")
      .update({ available } as never)
      .eq("id", slot.id)
      .select("id, date, start_time, end_time, available, is_occupied")
      .single();

    if (updErr) {
      console.error("Error updating slot:", updErr);
      return errorResponse("Error al actualizar el horario", 500);
    }

    return successResponse({ slot: updated });
  } catch (error) {
    console.error("Error in admin time-slots PATCH:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al actualizar horario",
      500
    );
  }
}
