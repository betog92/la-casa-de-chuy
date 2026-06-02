import { requireSuperAdmin } from "@/lib/auth/admin";
import { syncAppointlyEvents } from "@/lib/google-calendar-sync";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";
import { isCronSecretAuthorized } from "@/utils/cron-auth";

/**
 * POST /api/admin/google-calendar/sync
 *
 * Fase 1: Importa eventos de Appointly desde Google Calendar como reservas
 * en la base de datos. Idempotente: omite eventos ya importados.
 *
 * Solo accesible por admins (o por cron con CRON_SECRET: Bearer o x-cron-secret).
 */
export async function POST(request: Request) {
  if (!isCronSecretAuthorized(request)) {
    const { user, isSuperAdmin } = await requireSuperAdmin();
    if (!user) {
      return unauthorizedResponse("Debes iniciar sesión");
    }
    if (!isSuperAdmin) {
      return forbiddenResponse(
        "Solo super administradores (familia) pueden sincronizar el calendario",
      );
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
