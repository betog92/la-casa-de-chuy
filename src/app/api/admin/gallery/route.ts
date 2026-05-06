import { requireAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/gallery — lista imágenes (ordenadas) para el panel.
 */
export async function GET() {
  const { user, isAdmin } = await requireAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isAdmin) return forbiddenResponse("Sin permisos de administrador");

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("gallery_images")
    .select("id, public_url, sort_order, caption, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin gallery GET]", error);
    return errorResponse("No se pudo cargar la galería", 500);
  }

  return successResponse({ images: data ?? [] });
}
