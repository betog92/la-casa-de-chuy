/**
 * Script de análisis: lee eventos manuales de Google Calendar e imprime estadísticas.
 * No inserta nada en la base de datos.
 *
 * Uso:
 *   node scripts/preview-google-calendar.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
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

const MONTERREY_TZ = "America/Monterrey";

function toZoned(date, tz) {
  return new Date(date.toLocaleString("en-US", { timeZone: tz }));
}

function toDateStr(date) {
  const z = toZoned(date, MONTERREY_TZ);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function main() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const credRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;

  if (!calendarId || !credRaw) {
    console.error("Faltan GOOGLE_CALENDAR_ID o GOOGLE_CALENDAR_CREDENTIALS");
    process.exit(1);
  }

  const credentials = JSON.parse(credRaw);
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

  console.log(`\nConsultando eventos del ${toDateStr(todayMonterrey)} al ${toDateStr(sixMonths)}...\n`);

  const res = await calendar.events.list({
    calendarId,
    timeMin: todayMonterrey.toISOString(),
    timeMax: sixMonths.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  const items = res.data.items ?? [];
  const manuales = items.filter((e) => {
    const s = e.summary ?? "";
    const d = e.description ?? "";
    return !(s.includes("<>") && /Reservaci[oó]n/i.test(s)) && !d.includes("Appointly App");
  });

  console.log(`Total eventos en el calendario: ${items.length}`);
  console.log(`Manuales del staff: ${manuales.length}\n`);

  // ── Estadísticas de descripción ──────────────────────────────────────────
  let conCel = 0;
  let conFace = 0;
  let sinDesc = 0;
  let soloSummary = 0;
  let conTodo = 0; // tiene Cel. y Face./Fb.

  for (const e of manuales) {
    const d = e.description ?? "";
    const tieneCel = /cel\.?[\s:]/i.test(d);
    const tieneFace = /face\.?|fb\.?/i.test(d);
    if (!d.trim()) sinDesc++;
    else if (tieneCel && tieneFace) conTodo++;
    else if (tieneCel) conCel++;
    else if (tieneFace) conFace++;
    else soloSummary++;
  }

  console.log("── Estadísticas de description ──────────────────────────");
  console.log(`  Con Cel. Y Face./Fb.:  ${conTodo}`);
  console.log(`  Solo Cel.:             ${conCel}`);
  console.log(`  Solo Face./Fb.:        ${conFace}`);
  console.log(`  Sin description:       ${sinDesc}`);
  console.log(`  Otro formato:          ${soloSummary}`);
  console.log();

  // ── Eventos de todo el día ───────────────────────────────────────────────
  const allDay = manuales.filter((e) => !e.start?.dateTime);
  const conHora = manuales.filter((e) => !!e.start?.dateTime);
  console.log("── Por tipo de evento ───────────────────────────────────");
  console.log(`  Con hora (importables): ${conHora.length}`);
  console.log(`  Todo el día (skip):     ${allDay.length}`);
  console.log();

  // ── Los 7 de "otro formato" ──────────────────────────────────────────────
  const otroFormato = conHora.filter((e) => {
    const d = e.description ?? "";
    const tieneCel = /cel\.?[\s:]/i.test(d);
    const tieneFace = /face\.?|fb\.?/i.test(d);
    return d.trim() && !tieneCel && !tieneFace;
  });

  console.log(`\n── Eventos con description pero formato desconocido (${otroFormato.length}) ──`);
  console.log("=".repeat(60));
  for (const e of otroFormato) {
    const desc = (e.description ?? "").replace(/\n/g, " | ");
    console.log(`Summary: ${e.summary ?? "Sin título"}`);
    console.log(`Desc:    ${desc}`);
    console.log(`Inicio:  ${e.start?.dateTime}`);
    console.log("-".repeat(60));
  }

  // ── Muestra de 20 sin description para validar parseo de summary ────────
  const sinDescEvents = conHora.filter((e) => !(e.description ?? "").trim());
  // Distribución de summaries en los sin description
  const summaryCount = {};
  for (const e of sinDescEvents) {
    const s = (e.summary ?? "Sin título").trim();
    summaryCount[s] = (summaryCount[s] ?? 0) + 1;
  }
  const sorted = Object.entries(summaryCount).sort((a, b) => b[1] - a[1]);
  console.log(`\n── Distribución de summaries en los sin description (${sinDescEvents.length} total) ──`);
  console.log("=".repeat(60));
  for (const [summary, count] of sorted) {
    console.log(`  ${String(count).padStart(3)}x  "${summary}"`);
  }

  // Análisis de slots de Nancy: pares vs singles
  const nancyEvents = conHora.filter(e => (e.summary ?? "").toLowerCase().trim() === "nancy");
  let nancyPairs = 0;
  let nancySingles = 0;
  for (let i = 0; i < nancyEvents.length; i++) {
    const curr = nancyEvents[i];
    const next = nancyEvents[i + 1];
    const currEnd = new Date(curr.end?.dateTime);
    const nextStart = next ? new Date(next.start?.dateTime) : null;
    const isConsec = nextStart && Math.abs(currEnd - nextStart) <= 60000;
    const nextIsNancy = next && (next.summary ?? "").toLowerCase().trim() === "nancy";
    if (isConsec && nextIsNancy) {
      nancyPairs++;
      i++;
    } else {
      nancySingles++;
    }
  }
  console.log(`\n── Análisis slots Nancy ─────────────────────────────────`);
  console.log(`  Total slots Nancy:          ${nancyEvents.length}`);
  console.log(`  Pares consecutivos (90 min): ${nancyPairs}`);
  console.log(`  Singles (45 min):            ${nancySingles}`);

  // ── Muestra de 10 eventos con hora ──────────────────────────────────────
  console.log("\n── Muestra de 10 eventos con hora ───────────────────────");
  console.log("=".repeat(60));
  for (const e of conHora.slice(0, 10)) {
    const desc = (e.description ?? "").replace(/\n/g, " | ").slice(0, 120);
    console.log(`Summary: ${e.summary ?? "Sin título"}`);
    console.log(`Desc:    ${desc || "(vacía)"}`);
    console.log(`Inicio:  ${e.start?.dateTime}`);
    console.log(`Fin:     ${e.end?.dateTime}`);
    console.log("-".repeat(60));
  }

  // ── Muestra de 5 eventos de todo el día ─────────────────────────────────
  if (allDay.length > 0) {
    console.log("\n── Muestra de eventos de todo el día (no importables) ───");
    console.log("=".repeat(60));
    for (const e of allDay.slice(0, 5)) {
      console.log(`Summary: ${e.summary ?? "Sin título"}`);
      console.log(`Fecha:   ${e.start?.date}`);
      console.log("-".repeat(60));
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
