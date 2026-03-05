/**
 * Script para probar el calendario de renta de vestidos.
 * Lee eventos de GOOGLE_CALENDAR_VESTIDOS_ID e imprime la respuesta en consola.
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/preview-vestidos-calendar.mjs
 *
 * Requiere en .env.local:
 *   GOOGLE_CALENDAR_VESTIDOS_ID=xxx@group.calendar.google.com
 *   GOOGLE_CALENDAR_CREDENTIALS={"type":"service_account",...}
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

try {
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
} catch (err) {
  console.error("No se pudo cargar .env.local:", err.message);
  process.exit(1);
}

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

async function main() {
  const calendarId = process.env.GOOGLE_CALENDAR_VESTIDOS_ID?.trim();
  const credRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;

  if (!calendarId) {
    console.error("Falta GOOGLE_CALENDAR_VESTIDOS_ID en .env.local");
    process.exit(1);
  }
  if (!credRaw) {
    console.error("Falta GOOGLE_CALENDAR_CREDENTIALS en .env.local");
    process.exit(1);
  }

  let credentials;
  try {
    credentials = JSON.parse(credRaw);
  } catch {
    console.error("GOOGLE_CALENDAR_CREDENTIALS no es un JSON válido");
    process.exit(1);
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

  console.log("--- Calendario: Renta Vestidos ---");
  console.log("Calendar ID:", calendarId);
  console.log("Rango: hoy → +6 meses (Monterrey)\n");

  const res = await calendar.events.list({
    calendarId,
    timeMin: todayMonterrey.toISOString(),
    timeMax: sixMonths.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  const items = res.data.items ?? [];

  const events = items
    .filter((e) => !!e.id)
    .map((e) => {
      const isAllDay = !e.start?.dateTime;
      let date = "";
      let startTime = "00:00:00";
      let endTime = "00:00:00";
      let originalStart = "";
      let originalEnd = "";

      if (isAllDay) {
        date = e.start?.date ?? "";
        originalStart = date;
        originalEnd = e.end?.date ?? date;
      } else {
        const startDate = new Date(e.start.dateTime);
        const endDate = new Date(e.end.dateTime);
        date = toDateString(startDate);
        startTime = toTimeString(startDate);
        endTime = toTimeString(endDate);
        originalStart = e.start.dateTime;
        originalEnd = e.end.dateTime;
      }

      return {
        googleEventId: e.id,
        title: (e.summary ?? "").trim() || "Sin título",
        date,
        startTime,
        endTime,
        originalStart,
        originalEnd,
        isAllDay,
      };
    });

  console.log("Respuesta cruda (res.data) - keys:", Object.keys(res.data));
  console.log("Total eventos en la respuesta (items.length):", items.length);
  console.log("\nEventos mapeados (igual que la API):");
  console.log(JSON.stringify(events, null, 2));
  if (events.length > 0) {
    console.log("\nPrimer evento (resumen):");
    console.log(JSON.stringify(events[0], null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.response) console.error("Detalle:", err.response.data);
  process.exit(1);
});
