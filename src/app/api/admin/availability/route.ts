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

    // Validar customPrice: debe ser número finito >= 0 (entero MXN)
    let normalizedCustomPrice: number | null | undefined;
    if (customPrice === undefined) {
      normalizedCustomPrice = undefined;
    } else if (customPrice === null || customPrice === "") {
      normalizedCustomPrice = null;
    } else {
      const n = Number(customPrice);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return validationErrorResponse(
          "customPrice debe ser un entero >= 0"
        );
      }
      normalizedCustomPrice = n;
    }

    const supabase = createServiceRoleClient();

    // Resolver el estado final del día (combinando lo que viene en el body
    // con lo que ya hay guardado, para detectar si la fila quedaría vacía).
    const { data: existing, error: existingErr } = await supabase
      .from("availability")
      .select("is_closed, is_holiday, custom_price")
      .eq("date", date)
      .maybeSingle();
    if (existingErr) {
      console.error("Error reading availability:", existingErr);
      return errorResponse("Error al leer disponibilidad", 500);
    }

    const existingRow = existing as
      | { is_closed: boolean | null; is_holiday: boolean | null; custom_price: number | null }
      | null;

    const finalIsClosed =
      typeof isClosed === "boolean"
        ? isClosed
        : (existingRow?.is_closed ?? false);
    const finalIsHoliday =
      typeof isHoliday === "boolean"
        ? isHoliday
        : (existingRow?.is_holiday ?? false);
    const finalCustomPrice =
      normalizedCustomPrice === undefined
        ? (existingRow?.custom_price ?? null)
        : normalizedCustomPrice;

    // Si el resultado final no aporta ningún override, borrar la fila en
    // lugar de guardar una vacía que infla los contadores.
    if (!finalIsClosed && !finalIsHoliday && finalCustomPrice === null) {
      if (existingRow) {
        const { error: delErr } = await supabase
          .from("availability")
          .delete()
          .eq("date", date);
        if (delErr) {
          console.error("Error deleting empty availability:", delErr);
          return errorResponse("Error al limpiar disponibilidad", 500);
        }
      }
      return successResponse({ availability: null });
    }

    const upsertData = {
      date,
      is_closed: finalIsClosed,
      is_holiday: finalIsHoliday,
      custom_price: finalCustomPrice,
      updated_at: new Date().toISOString(),
    };

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

/**
 * DELETE /api/admin/availability?date=YYYY-MM-DD
 *
 * Borra el override de availability para esa fecha y rehabilita todos los
 * time_slots del día (available = true). No toca reservas existentes.
 */
export async function DELETE(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return validationErrorResponse("Se requiere date (yyyy-MM-dd)");
    }

    const supabase = createServiceRoleClient();

    const { error: delErr } = await supabase
      .from("availability")
      .delete()
      .eq("date", date);

    if (delErr) {
      console.error("Error deleting availability:", delErr);
      return errorResponse("Error al borrar la configuración del día", 500);
    }

    const { error: rehabErr } = await supabase
      .from("time_slots")
      .update({ available: true } as never)
      .eq("date", date)
      .eq("available", false);

    if (rehabErr) {
      console.error("Error re-enabling slots:", rehabErr);
      return errorResponse(
        "Configuración borrada, pero hubo un error al rehabilitar horarios",
        500
      );
    }

    return successResponse({ date });
  } catch (error) {
    console.error("Error in admin availability DELETE:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al borrar configuración",
      500
    );
  }
}
