import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { syncUserToDatabase } from "@/lib/supabase/user-sync";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    // Obtener el usuario autenticado desde las cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
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
      return unauthorizedResponse("Usuario no autenticado");
    }

    // Sincronizar usuario usando función helper
    const syncResult = await syncUserToDatabase(user);

    if (!syncResult.success) {
      return errorResponse(
        syncResult.error || "Error al sincronizar usuario",
        500
      );
    }

    return successResponse({
      message: "Usuario sincronizado correctamente",
      userId: user.id,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al sincronizar usuario";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}

// También permitir GET para facilitar pruebas
export async function GET(request: NextRequest) {
  return POST(request);
}
