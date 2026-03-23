import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
} from "@/utils/api-response";

/**
 * DELETE /api/admin/google-calendar/vestidos/[googleEventId]
 *
 * Elimina un evento de vestidos (creado en la app o importado al arranque).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ googleEventId: string }> }
) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { googleEventId: raw } = await params;
    const id = decodeURIComponent(raw ?? "").trim();
    if (!id) {
      return validationErrorResponse("Identificador de evento requerido");
    }

    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from("vestido_calendar_events")
      .select("google_event_id")
      .eq("google_event_id", id)
      .maybeSingle();

    if (!existing) {
      return notFoundResponse("Evento");
    }

    await supabase.from("vestido_calendar_notes").delete().eq("google_event_id", id);

    const { error } = await supabase.from("vestido_calendar_events").delete().eq("google_event_id", id);

    if (error) {
      console.error("Error al eliminar evento vestido:", error);
      return errorResponse("Error al eliminar el evento", 500);
    }

    return successResponse({ message: "Evento eliminado" });
  } catch {
    return errorResponse("Error al procesar la solicitud", 500);
  }
}
