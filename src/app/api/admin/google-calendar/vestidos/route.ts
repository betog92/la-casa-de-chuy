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
import { VESTIDO_DESCRIPTION_MAX_CHARS, vestidoDescriptionTooLong } from "@/lib/vestido-calendar-limits";

type VestidoEventInsert = Database["public"]["Tables"]["vestido_calendar_events"]["Insert"];

/** Nota embebida desde Supabase (objeto o array de 0–1 filas). */
function pickEmbeddedNote(raw: unknown): {
  title_override: string | null;
  description_override: string | null;
} | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as { title_override?: string | null; description_override?: string | null } | undefined;
    if (!first) return null;
    return {
      title_override: first.title_override ?? null,
      description_override: first.description_override ?? null,
    };
  }
  const o = raw as { title_override?: string | null; description_override?: string | null };
  return {
    title_override: o.title_override ?? null,
    description_override: o.description_override ?? null,
  };
}

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
 * Títulos y descripciones editados en la app vienen de vestido_calendar_notes (title_override, description_override).
 * Para actualizar la copia local, ejecutar: node scripts/sync-vestidos-calendar.mjs --commit
 *
 * Depuración: en .env.local pon DEBUG_VESTIDOS_EVENTS=1 y reinicia el servidor;
 * en la terminal verás cada evento (puede incluir datos personales de clientes: no subir logs a sitios públicos).
 */
export async function GET() {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  const supabase = createServiceRoleClient();

  const { data: eventsRows, error: queryError } = await supabase
    .from("vestido_calendar_events")
    .select(
      `
      google_event_id,
      title,
      description,
      date,
      original_start,
      original_end,
      is_all_day,
      vestido_calendar_notes (
        title_override,
        description_override
      )
    `
    )
    .order("date", { ascending: true });

  if (queryError) {
    console.error("Error al cargar vestido_calendar_events (con notas):", queryError);
    return errorResponse("Error al cargar eventos de vestidos", 500);
  }

  if (!eventsRows?.length) {
    return successResponse({ events: [] });
  }

  const events = eventsRows.map((r) => {
    const row = r as {
      google_event_id: string;
      title: string;
      description: string | null;
      date: string;
      original_start: string;
      original_end: string;
      is_all_day: boolean;
      vestido_calendar_notes: unknown;
    };
    const note = pickEmbeddedNote(row.vestido_calendar_notes);
    const titleOT = note?.title_override?.trim() ? note.title_override.trim() : null;
    const descOT =
      note?.description_override != null && note.description_override.trim() !== ""
        ? note.description_override.trim()
        : null;
    const isAllDay = row.is_all_day ?? !row.original_start?.includes("T");
    return {
      googleEventId: row.google_event_id,
      title: row.title,
      title_override: titleOT,
      description: row.description ?? null,
      description_override: descOT,
      date: row.date,
      startTime: isAllDay ? "00:00:00" : isoToTimeString(row.original_start),
      endTime: isAllDay ? "00:00:00" : isoToTimeString(row.original_end),
      originalStart: row.original_start,
      originalEnd: row.original_end,
      isAllDay,
    };
  });

  if (process.env.DEBUG_VESTIDOS_EVENTS === "1") {
    console.log(
      "[DEBUG_VESTIDOS_EVENTS] GET /api/admin/google-calendar/vestidos —",
      events.length,
      "evento(s)"
    );
    for (const ev of events) {
      console.log(JSON.stringify(ev, null, 2));
      console.log("---");
    }
  }

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
    const { date, title, description, isAllDay } = body as {
      date?: string;
      title?: string;
      description?: string | null;
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

    const descriptionForRow: string | null =
      description === undefined
        ? null
        : typeof description === "string"
          ? description.trim() || null
          : null;

    if (descriptionForRow && vestidoDescriptionTooLong(descriptionForRow)) {
      return validationErrorResponse(
        `La descripción no puede superar ${VESTIDO_DESCRIPTION_MAX_CHARS} caracteres`
      );
    }

    const google_event_id = `app-${randomUUID()}`;
    const supabase = createServiceRoleClient();
    const row: VestidoEventInsert = {
      google_event_id,
      title: titleTrim,
      description: descriptionForRow,
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
