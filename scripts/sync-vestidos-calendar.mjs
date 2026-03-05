/**
 * Sincroniza el calendario de renta de vestidos desde Google a nuestra BD (vestido_calendar_events).
 * Similar a import-appointly / import-manual: se ejecuta cuando quieras actualizar la copia local.
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/sync-vestidos-calendar.mjs            (solo preview: imprime qué se escribiría)
 *   node scripts/sync-vestidos-calendar.mjs --commit   (escribe en la BD)
 *
 * Requiere en .env.local:
 *   GOOGLE_CALENDAR_VESTIDOS_ID=xxx@group.calendar.google.com
 *   GOOGLE_CALENDAR_CREDENTIALS={"type":"service_account",...}
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const envPath = resolve(ROOT, ".env.local");
if (!existsSync(envPath)) {
  console.error("No se encontró .env.local en la raíz del proyecto.");
  process.exit(1);
}
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const COMMIT = process.argv.includes("--commit");
const MONTERREY_TZ = "America/Monterrey";

function toZoned(date, tz) {
  return new Date(date.toLocaleString("en-US", { timeZone: tz }));
}

function toTimeString(date) {
  const z = toZoned(date, MONTERREY_TZ);
  const h = String(z.getHours()).padStart(2, "0");
  const m = String(z.getMinutes()).padStart(2, "0");
  const s = String(z.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function toDateString(date) {
  const z = toZoned(date, MONTERREY_TZ);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function fetchFromGoogle() {
  const calendarId = process.env.GOOGLE_CALENDAR_VESTIDOS_ID?.trim();
  const credRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;

  if (!calendarId) {
    throw new Error("Falta GOOGLE_CALENDAR_VESTIDOS_ID en .env.local");
  }
  if (!credRaw) {
    throw new Error("Falta GOOGLE_CALENDAR_CREDENTIALS en .env.local");
  }

  let credentials;
  try {
    credentials = JSON.parse(credRaw);
  } catch {
    throw new Error("GOOGLE_CALENDAR_CREDENTIALS no es un JSON válido");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const todayMonterrey = toZoned(now, MONTERREY_TZ);
  todayMonterrey.setHours(0, 0, 0, 0);
  const sixMonths = new Date(todayMonterrey);
  sixMonths.setMonth(sixMonths.getMonth() + 6);

  const res = await calendar.events.list({
    calendarId,
    timeMin: todayMonterrey.toISOString(),
    timeMax: sixMonths.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  const items = res.data.items ?? [];
  return items
    .filter((e) => !!e.id)
    .map((e) => {
      const isAllDay = !e.start?.dateTime;
      let date = "";
      let originalStart = "";
      let originalEnd = "";

      if (isAllDay) {
        date = e.start?.date ?? "";
        originalStart = date;
        originalEnd = e.end?.date ?? date;
      } else {
        const startDate = new Date(e.start.dateTime);
        date = toDateString(startDate);
        originalStart = e.start.dateTime;
        originalEnd = e.end.dateTime;
      }

      return {
        google_event_id: e.id,
        title: (e.summary ?? "").trim() || "Sin título",
        date,
        original_start: originalStart,
        original_end: originalEnd,
        is_all_day: isAllDay,
      };
    });
}

async function main() {
  console.log("--- Sincronizar calendario de renta de vestidos ---");
  console.log("Modo:", COMMIT ? "COMMIT (escribir en BD)" : "preview (solo mostrar)");
  console.log("");

  const rows = await fetchFromGoogle();
  console.log("Eventos obtenidos de Google:", rows.length);

  if (rows.length === 0) {
    console.log("No hay eventos en el rango (hoy → +6 meses). Nada que sincronizar.");
    if (COMMIT) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { error } = await supabase.from("vestido_calendar_events").delete().neq("google_event_id", "");
        if (error) console.error("Error al vaciar tabla:", error.message);
        else console.log("Tabla vestido_calendar_events vaciada (0 eventos en Google).");
      }
    }
    return;
  }

  if (!COMMIT) {
    console.log("\nPreview (primeros 3):");
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    console.log("\nEjecuta con --commit para escribir en la BD.");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { error: deleteError } = await supabase.from("vestido_calendar_events").delete().neq("google_event_id", "");

  if (deleteError) {
    console.error("Error al vaciar tabla:", deleteError.message);
    process.exit(1);
  }

  const { error: insertError } = await supabase.from("vestido_calendar_events").insert(rows);

  if (insertError) {
    console.error("Error al insertar:", insertError.message);
    process.exit(1);
  }

  console.log("OK. vestido_calendar_events actualizada con", rows.length, "eventos.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.response) console.error("Detalle:", err.response.data);
  process.exit(1);
});
