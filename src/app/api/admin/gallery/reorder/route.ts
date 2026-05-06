import { requireAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
  errorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * PATCH /api/admin/gallery/reorder — body: { orderedIds: string[] }
 */
export async function PATCH(request: Request) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isAdmin) return forbiddenResponse("Sin permisos de administrador");

  const body = (await request.json().catch(() => null)) as {
    orderedIds?: unknown;
  } | null;
  if (!body || !Array.isArray(body.orderedIds)) {
    return validationErrorResponse("Se requiere orderedIds (array de UUIDs)");
  }
  const orderedIds = body.orderedIds.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (orderedIds.length === 0) {
    return validationErrorResponse("orderedIds vacío");
  }

  const seen = new Set(orderedIds);
  if (seen.size !== orderedIds.length) {
    return validationErrorResponse("Hay IDs duplicados en el orden");
  }

  const supabase = createServiceRoleClient();

  const { data: existingRows, error: listErr } = await supabase
    .from("gallery_images")
    .select("id");

  if (listErr) {
    console.error("[gallery reorder list]", listErr);
    return errorResponse("No se pudo verificar la galería", 500);
  }

  const existingIds = new Set(
    ((existingRows as { id: string }[] | null) ?? []).map((r) => r.id),
  );

  if (orderedIds.length !== existingIds.size) {
    return validationErrorResponse(
      "La lista debe incluir exactamente todas las imágenes de la galería",
    );
  }

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      return validationErrorResponse("Hay un ID que no existe en la galería");
    }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("gallery_images")
      .update({ sort_order: i } as never)
      .eq("id", orderedIds[i]);
    if (error) {
      console.error("[gallery reorder]", error);
      return errorResponse("No se pudo guardar el orden", 500);
    }
  }

  return successResponse({ message: "Orden actualizado" });
}
