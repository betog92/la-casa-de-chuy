import { requireAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * DELETE /api/admin/gallery/[id] — borra Storage + fila.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isAdmin) return forbiddenResponse("Sin permisos de administrador");

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return validationErrorResponse("ID inválido");
  }

  const supabase = createServiceRoleClient();
  const { data: row, error: fetchErr } = await supabase
    .from("gallery_images")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[gallery delete fetch]", fetchErr);
    return errorResponse("Error al buscar la imagen", 500);
  }
  if (!row) {
    return notFoundResponse("Imagen");
  }

  const storagePath = (row as { storage_path: string }).storage_path;
  const { error: rmErr } = await supabase.storage
    .from("gallery")
    .remove([storagePath]);
  if (rmErr) {
    console.error("[gallery delete storage]", rmErr);
    return errorResponse(
      "No se pudo eliminar el archivo en almacenamiento. Intenta de nuevo.",
      500,
    );
  }

  const { error: delErr } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", id);

  if (delErr) {
    console.error("[gallery delete row]", delErr);
    return errorResponse("No se pudo eliminar el registro", 500);
  }

  return successResponse({ message: "Imagen eliminada" });
}
