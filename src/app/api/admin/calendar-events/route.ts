import { NextRequest } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";

/**
 * GET: Obtiene reservas para el calendario en un rango de fechas.
 * Usado por el calendario del admin.
 * Query: start (yyyy-MM-dd), end (yyyy-MM-dd)
 */
export async function GET(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return errorResponse("Se requieren start y end (yyyy-MM-dd)", 400);
    }

    // Validar formato de fechas y rango
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return errorResponse("Formato de fechas inválido (use yyyy-MM-dd)", 400);
    }
    if (startDate > endDate) {
      return errorResponse("La fecha de inicio debe ser anterior o igual a la de fin", 400);
    }
    const maxRangeDays = 365;
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > maxRangeDays) {
      return errorResponse("El rango de fechas no puede exceder 1 año", 400);
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("reservations")
      .select("id, date, start_time, end_time, name, email, price, status")
      .gte("date", start)
      .lte("date", end)
      .eq("status", "confirmed")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching calendar events:", error);
      return errorResponse("Error al cargar eventos", 500);
    }

    // Formatear para react-big-calendar: { start, end, title, resource: { id } }
    // Título muestra solo hora inicial (ej. "1:45 pm Nancy Garcia")
    const formatTime = (t: string) => {
      const s = String(t || "0").trim();
      const [h, m] = s.split(":").map((x) => Number(x) || 0);
      const h12 = h % 12 || 12;
      const ampm = h < 12 ? "am" : "pm";
      return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    type Row = { id: number; date: string; start_time: string; end_time: string; name: string };
    const MONTERREY_TZ = "America/Monterrey";
    const toTimePart = (t: string) => {
      const s = String(t || "0").trim();
      const parts = s.split(":").slice(0, 3);
      const h = Math.max(0, Math.min(23, Number(parts[0]) || 0));
      const m = Math.max(0, Math.min(59, Number(parts[1]) || 0));
      const sec = Math.max(0, Math.min(59, Number(parts[2]) || 0));
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    };
    const events = (data ?? []).map((r: Row) => {
      const startStr = `${r.date}T${toTimePart(r.start_time)}`;
      const endStr = `${r.date}T${toTimePart(r.end_time)}`;
      const startDate = fromZonedTime(startStr, MONTERREY_TZ);
      const endDate = fromZonedTime(endStr, MONTERREY_TZ);
      const name = (r.name || "").trim() || "Sin nombre";
      const title = `${formatTime(r.start_time)} - #${r.id} ${name}`;
      return {
        id: r.id,
        title,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        resource: { reservationId: r.id },
      };
    });

    return successResponse({ events });
  } catch (error) {
    console.error("Error in calendar-events:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar eventos",
      500
    );
  }
}
