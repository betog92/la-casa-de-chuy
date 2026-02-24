import { google } from "googleapis";
import { toZonedTime } from "date-fns-tz";
import { addMonths, startOfDay, format } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MONTERREY_TZ = "America/Monterrey";

/**
 * Evento de Google Calendar tal como viene de la API,
 * ya convertido a zona horaria de Monterrey.
 */
export interface GoogleCalendarEvent {
  googleEventId: string;
  title: string;
  /** Fecha local en Monterrey (yyyy-MM-dd) */
  date: string;
  /** Hora de inicio local en Monterrey (HH:mm:ss) */
  startTime: string;
  /** Hora de fin local en Monterrey (HH:mm:ss) */
  endTime: string;
  /** Fecha/hora de inicio original de Google (ISO) */
  originalStart: string;
  /** Fecha/hora de fin original de Google (ISO) */
  originalEnd: string;
  /** true si el evento es de todo el día (sin hora) */
  isAllDay: boolean;
}

/**
 * Crea el cliente autenticado de Google Calendar usando el Service Account
 * definido en GOOGLE_CALENDAR_CREDENTIALS (JSON minificado en una sola línea).
 */
function getCalendarClient() {
  const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!raw) {
    throw new Error("Falta la variable de entorno GOOGLE_CALENDAR_CREDENTIALS");
  }

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_CALENDAR_CREDENTIALS no es un JSON válido");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  return google.calendar({ version: "v3", auth });
}

/**
 * Formatea una fecha JS a HH:mm:ss en zona horaria de Monterrey.
 */
function toTimeString(date: Date): string {
  const zoned = toZonedTime(date, MONTERREY_TZ);
  const h = String(zoned.getHours()).padStart(2, "0");
  const m = String(zoned.getMinutes()).padStart(2, "0");
  const s = String(zoned.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Formatea una fecha JS a yyyy-MM-dd en zona horaria de Monterrey.
 */
function toDateString(date: Date): string {
  const zoned = toZonedTime(date, MONTERREY_TZ);
  return format(zoned, "yyyy-MM-dd");
}

/**
 * Obtiene los eventos del calendario de Google en el rango:
 * desde hoy hasta 6 meses adelante (en zona horaria Monterrey).
 *
 * Solo devuelve eventos con hora (no eventos de todo el día),
 * aunque los incluye marcados con isAllDay = true para que el preview
 * los muestre y se pueda decidir qué hacer con ellos.
 */
export async function fetchGoogleCalendarEvents(): Promise<GoogleCalendarEvent[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("Falta la variable de entorno GOOGLE_CALENDAR_ID");
  }

  const calendar = getCalendarClient();

  // Rango: hoy → +6 meses en zona Monterrey
  const nowMonterrey = toZonedTime(new Date(), MONTERREY_TZ);
  const todayStart = startOfDay(nowMonterrey);
  const sixMonthsLater = addMonths(todayStart, 6);

  const response = await calendar.events.list({
    calendarId,
    timeMin: todayStart.toISOString(),
    timeMax: sixMonthsLater.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  const items = response.data.items ?? [];

  return items
    .filter((event) => !!event.id)
    .map((event) => {
      const isAllDay = !event.start?.dateTime;

      let date = "";
      let startTime = "00:00:00";
      let endTime = "00:00:00";
      let originalStart = "";
      let originalEnd = "";

      if (isAllDay) {
        // Evento de todo el día: solo tiene date, sin hora
        date = event.start?.date ?? "";
        originalStart = date;
        originalEnd = event.end?.date ?? date;
      } else {
        const startDate = new Date(event.start!.dateTime!);
        const endDate = new Date(event.end!.dateTime!);
        date = toDateString(startDate);
        startTime = toTimeString(startDate);
        endTime = toTimeString(endDate);
        originalStart = event.start!.dateTime!;
        originalEnd = event.end!.dateTime!;
      }

      return {
        googleEventId: event.id!,
        title: event.summary?.trim() || "Sin título",
        date,
        startTime,
        endTime,
        originalStart,
        originalEnd,
        isAllDay,
      };
    });
}

/**
 * Extrae el nombre del cliente del summary de un evento de Appointly.
 * Formato: "La Casa de Chuy el Rico  <> Nombre Apellido - Reservación"
 */
function parseAppointlyName(summary: string): string {
  const match = summary.match(/<>\s*(.+?)\s*-\s*Reservaci[oó]n/i);
  return match ? match[1].trim() : summary.trim();
}

export interface SyncResult {
  total: number;
  imported: number;
  skipped: number;
  errors: { googleEventId: string; error: string }[];
}

/**
 * Fase 1: Importa solo los eventos de Appointly (description contiene "Appointly App")
 * como reservas en la tabla reservations. Idempotente por google_event_id.
 */
export async function syncAppointlyEvents(): Promise<SyncResult> {
  const events = await fetchGoogleCalendarEvents();

  const appointlyEvents = events.filter(
    (e) => !e.isAllDay
  );

  // Para filtrar por Appointly necesitamos los datos crudos; re-fetch con flag
  // En su lugar, usamos el patrón del título que es único de Appointly
  const filtered = appointlyEvents.filter(
    (e) =>
      e.title.includes("<>") && /Reservaci[oó]n/i.test(e.title)
  );

  const supabase = createServiceRoleClient();
  const result: SyncResult = {
    total: filtered.length,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  for (const event of filtered) {
    try {
      // Verificar si ya existe por google_event_id (idempotencia)
      const { data: existing } = await supabase
        .from("reservations")
        .select("id")
        .eq("google_event_id", event.googleEventId)
        .maybeSingle();

      if (existing) {
        result.skipped++;
        continue;
      }

      const name = parseAppointlyName(event.title);

      // Obtener el siguiente ID de la secuencia exclusiva para importaciones de Google
      const { data: nextId, error: seqError } = await supabase
        .rpc("next_google_import_id");

      if (seqError || !nextId) {
        result.errors.push({
          googleEventId: event.googleEventId,
          error: `Error obteniendo ID de secuencia: ${seqError?.message ?? "sin datos"}`,
        });
        continue;
      }

      const { error } = await supabase.from("reservations").insert({
        id: nextId,
        email: "importado@google.local",
        name,
        phone: "N/A",
        date: event.date,
        start_time: event.startTime,
        end_time: event.endTime,
        price: 0,
        original_price: 0,
        status: "confirmed",
        payment_method: "google_import",
        source: "google_import",
        google_event_id: event.googleEventId,
      });

      if (error) {
        result.errors.push({ googleEventId: event.googleEventId, error: error.message });
      } else {
        result.imported++;
      }
    } catch (err) {
      result.errors.push({
        googleEventId: event.googleEventId,
        error: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return result;
}
