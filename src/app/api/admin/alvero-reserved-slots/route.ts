import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  forbiddenResponse,
} from "@/utils/api-response";

/**
 * GET /api/admin/alvero-reserved-slots?date=YYYY-MM-DD
 *
 * Lista los "Espacios reservados para Alvero" (filas con
 * `source='admin'`, `import_type='manual_available'`, status `confirmed`)
 * de un día específico.
 *
 * Estos slots están ocupados (no aparecen en `get_available_slots`),
 * pero el admin puede *promoverlos* a `cita_alvero` enviando
 * `replaces_reservation_id` al POST `/api/admin/reservations`.
 *
 * Auth: admin (lectura). La promoción en sí valida lo mismo en POST.
 */
export async function GET(request: NextRequest) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) {
    return unauthorizedResponse("Debes iniciar sesión");
  }
  if (!isAdmin) {
    return forbiddenResponse("No tienes permisos de administrador");
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return validationErrorResponse("Fecha inválida (use YYYY-MM-DD)");
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("reservations")
      .select("id, date, start_time, end_time, status")
      .eq("source", "admin")
      .eq("import_type", "manual_available")
      .eq("date", date)
      .eq("status", "confirmed")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[admin alvero-reserved-slots]", error);
      return errorResponse("Error al cargar espacios reservados", 500);
    }

    return successResponse({
      slots: data ?? [],
    });
  } catch (error) {
    console.error("Error fetching alvero reserved slots:", error);
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Error al cargar espacios reservados",
      500,
    );
  }
}
