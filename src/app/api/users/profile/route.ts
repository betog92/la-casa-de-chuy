import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import type { Database } from "@/types/database.types";

export async function GET(request: NextRequest) {
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
          setAll() {
            // No necesitamos establecer cookies aquí
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return unauthorizedResponse("Debes iniciar sesión");
    }

    // Obtener datos del perfil desde la tabla users
    const { data: profile, error } = await supabase
      .from("users")
      .select("id, email, name, phone")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned, que es válido si el usuario no está en la tabla todavía
      console.error("Error loading user profile:", error);
      return errorResponse("Error al cargar el perfil", 500);
    }

    // Si no existe perfil, devolver solo el email de auth
    if (!profile) {
      return successResponse({
        email: user.email,
        name: null,
        phone: null,
      });
    }

    return successResponse({
      email: profile.email || user.email,
      name: profile.name || null,
      phone: profile.phone || null,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar el perfil";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
