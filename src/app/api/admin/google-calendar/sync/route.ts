import { requireAdmin } from "@/lib/auth/admin";
import { syncAppointlyEvents } from "@/lib/google-calendar-sync";
import { successResponse, errorResponse, unauthorizedResponse } from "@/utils/api-response";

/**
 * POST /api/admin/google-calendar/sync
 *
 * Fase 1: Importa eventos de Appointly desde Google Calendar como reservas
 * en la base de datos. Idempotente: omite eventos ya importados.
 *
 * Solo accesible por admins (o por cron con x-cron-secret).
 */
export async function POST(request: Request) {
  // Permitir acceso por cron secret además de sesión admin
  const cronSecret = request.headers.get("x-cron-secret");
  const validCronSecret =
    cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!validCronSecret) {
    const { isAdmin } = await requireAdmin();
    if (!isAdmin) {
      return unauthorizedResponse("No tienes permisos de administrador");
    }
  }

  try {
    const result = await syncAppointlyEvents();

    return successResponse({
      message: `Sincronización completada. Importadas: ${result.imported}, omitidas: ${result.skipped}, errores: ${result.errors.length}`,
      ...result,
    });
  } catch (error) {
    console.error("Error en sync de Google Calendar:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al sincronizar con Google Calendar",
      500
    );
  }
}
