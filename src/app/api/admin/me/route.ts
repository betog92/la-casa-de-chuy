import { requireAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";

/**
 * Verifica si el usuario actual es admin.
 * Usado por el frontend para proteger rutas y mostrar/ocultar el panel.
 */
export async function GET() {
  const { user, isAdmin } = await requireAdmin();

  if (!user) {
    return unauthorizedResponse("Debes iniciar sesión para acceder");
  }

  if (!isAdmin) {
    return forbiddenResponse("No tienes permisos de administrador");
  }

  return successResponse({ user, isAdmin: true });
}
