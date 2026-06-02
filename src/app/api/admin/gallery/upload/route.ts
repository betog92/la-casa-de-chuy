import { randomUUID } from "node:crypto";
import { requireSuperAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
  errorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { bufferMatchesImageMime } from "@/utils/gallery-server";

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
  const { user, isSuperAdmin } = await requireSuperAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isSuperAdmin) {
    return forbiddenResponse("Solo super administradores (familia) pueden gestionar la galería");
  }

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

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!bufferMatchesImageMime(buffer, mime)) {
    return validationErrorResponse(
      "El archivo no coincide con un formato de imagen válido.",
    );
  }

  const supabase = createServiceRoleClient();
  const path = `${randomUUID()}.${extFromMime(mime)}`;

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

  const { data: rpcData, error: insErr } = await supabase.rpc(
    "register_gallery_image",
    {
      p_storage_path: path,
      p_public_url: publicUrl,
    } as never,
  );

  const inserted = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  if (insErr || !inserted) {
    console.error("[gallery upload insert]", insErr);
    await supabase.storage.from("gallery").remove([path]);
    return errorResponse("No se pudo registrar la imagen", 500);
  }

  return successResponse({ image: inserted }, 201);
}
