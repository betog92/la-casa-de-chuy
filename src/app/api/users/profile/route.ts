import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { calculateLoyaltyLevel } from "@/utils/loyalty";
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

    // Calcular saldos de puntos, créditos y nivel de fidelización
    const [loyaltyAgg, creditsAgg, reservationsAgg] = await Promise.all([
      supabase
        .from("loyalty_points")
        .select("points")
        .eq("user_id", user.id)
        .eq("revoked", false)
        .eq("used", false),
      supabase
        .from("credits")
        .select("amount")
        .eq("user_id", user.id)
        .eq("revoked", false)
        .eq("used", false),
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "confirmed"),
    ]);

    const loyaltyPoints =
      Array.isArray(loyaltyAgg.data) && loyaltyAgg.data.length > 0
        ? (loyaltyAgg.data as { points: number }[]).reduce(
            (sum, row) => sum + (row.points || 0),
            0
          )
        : 0;

    const credits =
      Array.isArray(creditsAgg.data) && creditsAgg.data.length > 0
        ? (creditsAgg.data as { amount: number }[]).reduce(
            (sum, row) => sum + Number(row.amount || 0),
            0
          )
        : 0;

    const confirmedCount = reservationsAgg.count || 0;

    const loyaltyLevelName = calculateLoyaltyLevel(confirmedCount);

    const baseProfile = profile || {
      email: user.email,
      name: null,
      phone: null,
    };

    return successResponse({
      email: baseProfile.email || user.email,
      name: baseProfile.name || null,
      phone: baseProfile.phone || null,
      loyaltyPoints,
      credits,
      loyaltyLevelName,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar el perfil";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
