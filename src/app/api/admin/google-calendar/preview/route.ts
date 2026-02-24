import { requireAdmin } from "@/lib/auth/admin";
import { fetchGoogleCalendarEvents } from "@/lib/google-calendar-sync";
import { successResponse, errorResponse, unauthorizedResponse } from "@/utils/api-response";

/**
 * GET /api/admin/google-calendar/preview
 *
 * Solo lectura: obtiene los eventos de Google Calendar (hoy → +6 meses)
 * y los devuelve tal como vendrían mapeados, SIN insertar nada en la BD.
 * Usar para validar que los datos se ven correctos antes de importar.
 */
export async function GET() {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const events = await fetchGoogleCalendarEvents();

    return successResponse({
      total: events.length,
      events,
    });
  } catch (error) {
    console.error("Error en preview de Google Calendar:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al conectar con Google Calendar",
      500
    );
  }
}
