import { requireSuperAdmin } from "@/lib/auth/admin";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
  errorResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  LOCATION_CONTENT_KEY,
  defaultLocationContent,
  parseLocationContent,
  type LocationContent,
} from "@/lib/site-location";
import { isAllowedMapsEmbedUrl } from "@/utils/maps-embed";

/**
 * GET /api/admin/location — contenido actual (o valores por defecto).
 */
export async function GET() {
  const { user, isSuperAdmin } = await requireSuperAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isSuperAdmin) {
    return forbiddenResponse("Solo super administradores (familia) pueden editar la ubicación");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", LOCATION_CONTENT_KEY)
    .maybeSingle();

  if (error) {
    console.error("[admin location GET]", error);
    return successResponse({ location: defaultLocationContent() });
  }

  const value = data ? (data as { value: unknown }).value : null;
  return successResponse({ location: parseLocationContent(value) });
}

/**
 * PUT /api/admin/location — guarda JSON de ubicación.
 */
export async function PUT(request: Request) {
  const { user, isSuperAdmin } = await requireSuperAdmin();
  if (!user) return unauthorizedResponse("Debes iniciar sesión");
  if (!isSuperAdmin) {
    return forbiddenResponse("Solo super administradores (familia) pueden editar la ubicación");
  }

  const body = (await request.json().catch(() => null)) as
    | Partial<LocationContent>
    | null;
  if (!body || typeof body !== "object") {
    return validationErrorResponse("Cuerpo JSON inválido");
  }

  const merged: LocationContent = {
    ...defaultLocationContent(),
    address: typeof body.address === "string" ? body.address : "",
    mapsEmbedUrl:
      typeof body.mapsEmbedUrl === "string" ? body.mapsEmbedUrl : "",
    directions: typeof body.directions === "string" ? body.directions : "",
    parkingNote:
      typeof body.parkingNote === "string" ? body.parkingNote : "",
  };

  if (!isAllowedMapsEmbedUrl(merged.mapsEmbedUrl)) {
    return validationErrorResponse(
      "La URL del mapa debe ser HTTPS y de dominios permitidos (p. ej. Google Maps).",
    );
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("site_content").upsert(
    {
      key: LOCATION_CONTENT_KEY,
      value: merged as never,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );

  if (error) {
    console.error("[admin location PUT]", error);
    return errorResponse("No se pudo guardar", 500);
  }

  return successResponse({ location: merged });
}
