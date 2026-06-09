import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { isProfileContactComplete } from "@/lib/user-profile-contact";
import type { Database } from "@/types/database.types";

/**
 * GET /api/users/contact
 * Solo name/phone — para decidir si hace falta sync sin cargar loyalty/credits.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return unauthorizedResponse("Debes iniciar sesión");
    }

    const { data: profile, error } = await supabase
      .from("users")
      .select("name, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[/api/users/contact] Error leyendo perfil:", error);
      return errorResponse("Error al leer contacto", 500);
    }

    const row = profile as { name: string | null; phone: string | null } | null;
    const name = row?.name ?? null;
    const phone = row?.phone ?? null;

    return successResponse({
      name,
      phone,
      contactComplete: isProfileContactComplete({ name, phone }),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error al leer contacto";
    console.error("[/api/users/contact]", error);
    return errorResponse(message, 500);
  }
}
