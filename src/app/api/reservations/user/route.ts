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
    // Crear cliente de Supabase con autenticación
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
            // En API routes solo leemos cookies para autenticación
            // No necesitamos establecer cookies aquí
          },
        },
      }
    );

    // Obtener el usuario autenticado
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return unauthorizedResponse("Debes iniciar sesión para ver tus reservas");
    }

    // Obtener las reservas del usuario
    // Como el usuario debe verificar su email antes de poder hacer login (configuración de Supabase),
    // todas sus reservas de invitado ya están vinculadas con user_id cuando accede a esta ruta.
    // Por lo tanto, solo necesitamos buscar por user_id.
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, status, payment_id, created_at"
      )
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("start_time", { ascending: false });

    if (error) {
      console.error("Error loading user reservations:", error);
      return errorResponse("Error al cargar tus reservas", 500);
    }

    return successResponse({ reservations: reservations || [] });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al cargar reservas";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
