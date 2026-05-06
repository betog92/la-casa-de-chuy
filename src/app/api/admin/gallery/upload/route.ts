import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
  errorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * POST /api/admin/gallery/upload — multipart field "file".
 */
export async function POST(request: Request) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isAdmin) return forbiddenResponse("Sin permisos de administrador");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return validationErrorResponse("Cuerpo inválido");
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return validationErrorResponse("Falta el archivo (campo file)");
  }
  if (file.size <= 0) {
    return validationErrorResponse("Archivo vacío");
  }
  if (file.size > MAX_BYTES) {
    return validationErrorResponse("La imagen no debe superar 5 MB");
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return validationErrorResponse(
      "Formato no permitido. Usa JPEG, PNG, WebP o GIF.",
    );
  }

  const supabase = createServiceRoleClient();
  const path = `${randomUUID()}.${extFromMime(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("gallery")
    .upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (upErr) {
    console.error("[gallery upload storage]", upErr);
    return errorResponse("No se pudo subir la imagen", 500);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("gallery").getPublicUrl(path);

  const { data: maxRows } = await supabase
    .from("gallery_images")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  const maxOrder =
    maxRows && maxRows.length > 0
      ? Number((maxRows[0] as { sort_order: number }).sort_order) || 0
      : -1;
  const sort_order = maxOrder + 1;

  const { data: inserted, error: insErr } = await supabase
    .from("gallery_images")
    .insert({
      storage_path: path,
      public_url: publicUrl,
      sort_order,
    } as never)
    .select("id, public_url, sort_order, caption, created_at")
    .single();

  if (insErr || !inserted) {
    console.error("[gallery upload insert]", insErr);
    await supabase.storage.from("gallery").remove([path]);
    return errorResponse("No se pudo registrar la imagen", 500);
  }

  return successResponse({ image: inserted }, 201);
}
