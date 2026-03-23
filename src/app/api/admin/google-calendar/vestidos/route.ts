import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import { randomUUID } from "crypto";

type VestidoEventInsert = Database["public"]["Tables"]["vestido_calendar_events"]["Insert"];

/**
 * Formatea una fecha ISO a HH:mm:ss (solo para eventos con hora).
 */
function isoToTimeString(iso: string): string {
  try {
    const d = new Date(iso);
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  } catch {
    return "00:00:00";
  }
}

/**
 * GET /api/admin/google-calendar/vestidos
 *
 * Lee eventos desde nuestra BD (vestido_calendar_events), no de Google.
 * Los títulos editados vienen de vestido_calendar_notes (title_override).
 * Para actualizar la copia local, ejecutar: node scripts/sync-vestidos-calendar.mjs --commit
 */
export async function GET() {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  const supabase = createServiceRoleClient();

  const [eventsResult, notesResult] = await Promise.all([
    supabase
      .from("vestido_calendar_events")
      .select("google_event_id, title, date, original_start, original_end, is_all_day")
      .order("date", { ascending: true }),
    supabase.from("vestido_calendar_notes").select("google_event_id, title_override"),
  ]);

  const eventsError = eventsResult.error;
  const eventsRows = eventsResult.data ?? null;
  if (eventsError || !eventsRows?.length) {
    if (eventsError) console.error("Error al cargar vestido_calendar_events:", eventsError);
    return successResponse({ events: [] });
  }

  const overrides: Record<string, string> = {};
  const notesRows = notesResult.data as { google_event_id: string; title_override: string | null }[] | null;
  if (notesRows) {
    for (const row of notesRows) {
      if (row.title_override?.trim()) {
        overrides[row.google_event_id] = row.title_override.trim();
      }
    }
  }

  const events = eventsRows.map((r) => {
    const row = r as {
      google_event_id: string;
      title: string;
      date: string;
      original_start: string;
      original_end: string;
      is_all_day: boolean;
    };
    const isAllDay = row.is_all_day ?? !row.original_start?.includes("T");
    return {
      googleEventId: row.google_event_id,
      title: row.title,
      title_override: overrides[row.google_event_id] ?? null,
      date: row.date,
      startTime: isAllDay ? "00:00:00" : isoToTimeString(row.original_start),
      endTime: isAllDay ? "00:00:00" : isoToTimeString(row.original_end),
      originalStart: row.original_start,
      originalEnd: row.original_end,
      isAllDay,
    };
  });

  return successResponse({ events });
}

/**
 * POST /api/admin/google-calendar/vestidos
 *
 * Crea un evento de renta de vestidos desde la app (cuadro azul).
 * Solo admite isAllDay: true (todo el día).
 * google_event_id = "app-{uuid}" para no colisionar con eventos sincronizados de Google.
 */
export async function POST(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const body = await request.json();
    const { date, title, isAllDay } = body as {
      date?: string;
      title?: string;
      isAllDay?: boolean;
    };

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return validationErrorResponse("Fecha inválida (use YYYY-MM-DD)");
    }
    const titleTrim = title?.toString()?.trim() ?? "";
    if (!titleTrim) {
      return validationErrorResponse("El título es requerido");
    }
    // Solo eventos de todo el día (evita ambigüedad de zona horaria con horas locales vs UTC).
    if (isAllDay !== true) {
      return validationErrorResponse(
        "Solo se admiten eventos de todo el día (envíe isAllDay: true)"
      );
    }

    const original_start = date;
    const original_end = date;

    const google_event_id = `app-${randomUUID()}`;
    const supabase = createServiceRoleClient();
    const row: VestidoEventInsert = {
      google_event_id,
      title: titleTrim,
      date,
      original_start,
      original_end,
      is_all_day: true,
    };
    const { error } = await supabase.from("vestido_calendar_events").insert(row as never);

    if (error) {
      console.error("Error al crear evento vestido:", error);
      return errorResponse("Error al crear el evento", 500);
    }

    return successResponse({
      success: true,
      google_event_id,
      message: "Evento creado",
    });
  } catch {
    return errorResponse("Error al procesar la solicitud", 500);
  }
}
