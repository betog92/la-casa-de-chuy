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
import { isUuidString } from "@/utils/uuid";

const CAPTION_MAX = 500;

/**
 * PATCH /api/admin/gallery/[id] — body: { caption?: string | null }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isAdmin) return forbiddenResponse("Sin permisos de administrador");

  const { id } = await params;
  if (!id || typeof id !== "string" || !isUuidString(id)) {
    return validationErrorResponse("ID inválido");
  }

  const body = (await request.json().catch(() => null)) as {
    caption?: unknown;
  } | null;
  if (!body || typeof body !== "object") {
    return validationErrorResponse("Cuerpo JSON inválido");
  }

  let caption: string | null;
  if (body.caption === null || body.caption === undefined) {
    caption = null;
  } else if (typeof body.caption === "string") {
    const t = body.caption.trim();
    if (t.length > CAPTION_MAX) {
      return validationErrorResponse(
        `La leyenda no puede superar ${CAPTION_MAX} caracteres`,
      );
    }
    caption = t.length ? t : null;
  } else {
    return validationErrorResponse("caption debe ser texto o null");
  }

  const supabase = createServiceRoleClient();
  const { data: row, error: fetchErr } = await supabase
    .from("gallery_images")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[gallery PATCH fetch]", fetchErr);
    return errorResponse("Error al buscar la imagen", 500);
  }
  if (!row) {
    return notFoundResponse("Imagen");
  }

  const { data: updated, error: updErr } = await supabase
    .from("gallery_images")
    .update({ caption } as never)
    .eq("id", id)
    .select("id, public_url, sort_order, caption, created_at")
    .single();

  if (updErr || !updated) {
    console.error("[gallery PATCH]", updErr);
    return errorResponse("No se pudo actualizar la leyenda", 500);
  }

  return successResponse({ image: updated });
}

/**
 * DELETE /api/admin/gallery/[id] — borra fila primero, luego Storage (huérfanos se registran en log).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isAdmin) return forbiddenResponse("Sin permisos de administrador");

  const { id } = await params;
  if (!id || typeof id !== "string" || !isUuidString(id)) {
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

  const { error: delErr } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", id);

  if (delErr) {
    console.error("[gallery delete row]", delErr);
    return errorResponse("No se pudo eliminar el registro", 500);
  }

  const { error: rmErr } = await supabase.storage
    .from("gallery")
    .remove([storagePath]);
  if (rmErr) {
    console.error("[gallery delete storage orphan]", rmErr, storagePath);
  }

  return successResponse({ message: "Imagen eliminada" });
}
