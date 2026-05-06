import { requireAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
  errorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isUuidString } from "@/utils/uuid";

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
  if (orderedIds.some((id) => !isUuidString(id))) {
    return validationErrorResponse("Cada ID debe ser un UUID válido");
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

  const { error: rpcErr } = await supabase.rpc(
    "reorder_gallery_images",
    { p_ordered_ids: orderedIds } as never,
  );

  if (rpcErr) {
    console.error("[gallery reorder rpc]", rpcErr);
    const msg = rpcErr.message || "";
    const lower = msg.toLowerCase();
    const looksLikeValidation =
      msg.includes("coincide") ||
      msg.includes("duplicados") ||
      msg.includes("desconocido") ||
      msg.includes("requerido") ||
      lower.includes("duplicate") ||
      lower.includes("unknown") ||
      lower.includes("mismatch") ||
      lower.includes("required") ||
      lower.includes("invalid input");
    if (looksLikeValidation) {
      return validationErrorResponse(
        msg.length > 0 && msg.length < 200
          ? msg
          : "No se pudo aplicar el orden indicado",
      );
    }
    return errorResponse("No se pudo guardar el orden", 500);
  }

  return successResponse({ message: "Orden actualizado" });
}
