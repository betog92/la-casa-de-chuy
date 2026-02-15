import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";

/**
 * GET: Lista disponibilidad en un rango de fechas
 */
export async function GET(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!dateFrom || !dateTo) {
      return validationErrorResponse(
        "Se requieren dateFrom y dateTo (yyyy-MM-dd)"
      );
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("availability")
      .select("id, date, is_closed, is_holiday, custom_price")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });

    if (error) {
      console.error("Error listing availability:", error);
      return errorResponse("Error al listar disponibilidad", 500);
    }

    return successResponse({ availability: data ?? [] });
  } catch (error) {
    console.error("Error in admin availability GET:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar disponibilidad",
      500
    );
  }
}

/**
 * POST: Crear o actualizar disponibilidad para una fecha
 * Body: { date: string, isClosed?: boolean, isHoliday?: boolean, customPrice?: number | null }
 */
export async function POST(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const body = await request.json();
    const { date, isClosed, isHoliday, customPrice } = body;

    if (!date || typeof date !== "string") {
      return validationErrorResponse("Se requiere date (yyyy-MM-dd)");
    }

    // Validar formato de fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return validationErrorResponse("Formato de fecha inválido (usar yyyy-MM-dd)");
    }

    const supabase = createServiceRoleClient();

    const upsertData: {
      date: string;
      is_closed?: boolean;
      is_holiday?: boolean;
      custom_price?: number | null;
      updated_at: string;
    } = {
      date,
      updated_at: new Date().toISOString(),
    };

    if (typeof isClosed === "boolean") upsertData.is_closed = isClosed;
    if (typeof isHoliday === "boolean") upsertData.is_holiday = isHoliday;
    if (customPrice !== undefined) {
      upsertData.custom_price =
        customPrice === null || customPrice === ""
          ? null
          : Number(customPrice);
    }

    const { data, error } = await supabase
      .from("availability")
      .upsert(upsertData as never, {
        onConflict: "date",
      })
      .select("id, date, is_closed, is_holiday, custom_price")
      .single();

    if (error) {
      console.error("Error upserting availability:", error);
      return errorResponse("Error al guardar disponibilidad", 500);
    }

    return successResponse({ availability: data });
  } catch (error) {
    console.error("Error in admin availability POST:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al guardar disponibilidad",
      500
    );
  }
}
