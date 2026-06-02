/**
 * Compara bookings.csv (export viejo Apntly) vs Google Calendar (Appointly).
 *
 * Uso: node scripts/compare-csv-vs-calendar.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const MX_TZ = "America/Monterrey";
const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function toZoned(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: MX_TZ }));
}
function toDateStr(date) {
  const z = toZoned(date);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}
function toTimeStr(date) {
  const z = toZoned(date);
  return [z.getHours(), z.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
}
function slotKey(date, time) {
  return `${date} ${(time ?? "").slice(0, 5)}`;
}
function normName(name) {
  return (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function splitCSVLine(line) {
  const result = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { result.push(cur); cur = ""; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function parseCSV(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? "").trim(); });
    return row;
  });
}

function parseApptTime(str) {
  const m = str.match(/^(\w+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d+)\s+(AM|PM)$/i);
  if (!m) return null;
  const mi = months[m[1].toLowerCase().slice(0, 3)];
  let h = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  if (m[6].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[6].toUpperCase() === "AM" && h === 12) h = 0;
  const date = `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
  const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return { date, time, raw: str };
}

function parseNameFromSummary(summary) {
  const m = summary.match(/<>\s*(.+?)\s*-\s*Reservaci[oó]n/i);
  return m ? m[1].trim() : summary.trim();
}

function isAppointlyEvent(e) {
  if (e.status === "cancelled" || !e.start?.dateTime) return false;
  const desc = e.description ?? "";
  const summary = e.summary ?? "";
  return desc.includes("Appointly App") || (summary.includes("<>") && /Reservaci[oó]n/i.test(summary));
}

// ── CSV ──
const csvPath = resolve(ROOT, "bookings.csv");
if (!existsSync(csvPath)) {
  console.error("No se encontró bookings.csv");
  process.exit(1);
}

const csvRows = parseCSV(csvPath).map((r) => {
  const parsed = parseApptTime(r["Appointment Time"] ?? "");
  return {
    order: r.Order ?? "",
    name: r["Customer Name"] ?? "",
    email: r["Customer Email"] ?? "",
    service: r.Service ?? "",
    apptRaw: r["Appointment Time"] ?? "",
    date: parsed?.date ?? null,
    time: parsed?.time ?? null,
    slot: parsed ? slotKey(parsed.date, parsed.time) : null,
    nameNorm: normName(r["Customer Name"]),
  };
}).filter((r) => r.date && r.time);

// ── Calendar ──
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});
const calendar = google.calendar({ version: "v3", auth });

const csvDates = csvRows.map((r) => r.date).sort();
const fromDate = csvDates[0];
const toDate = csvDates.at(-1);

const { data } = await calendar.events.list({
  calendarId: process.env.GOOGLE_CALENDAR_ID,
  timeMin: new Date(`${fromDate}T00:00:00-06:00`).toISOString(),
  timeMax: new Date(`${toDate}T23:59:59-06:00`).toISOString(),
  singleEvents: true,
  orderBy: "startTime",
  maxResults: 2500,
});

const calRows = (data.items ?? []).filter(isAppointlyEvent).map((e) => {
  const start = new Date(e.start.dateTime);
  const date = toDateStr(start);
  const time = toTimeStr(start);
  const name = parseNameFromSummary(e.summary ?? "");
  return {
    name,
    nameNorm: normName(name),
    date,
    time,
    slot: slotKey(date, time),
    summary: e.summary ?? "",
    bookingId: (e.description ?? "").match(/bookings\/(\d+-\d+)/i)?.[1] ?? null,
  };
});

// ── Comparación ──
const csvBySlot = new Map(csvRows.map((r) => [r.slot, r]));
const calBySlot = new Map(calRows.map((r) => [r.slot, r]));

const exactMatch = [];
const nameMismatch = [];
const inCsvNotCal = [];
const inCalNotCsv = [];

for (const csv of csvRows) {
  const cal = calBySlot.get(csv.slot);
  if (!cal) {
    inCsvNotCal.push(csv);
    continue;
  }
  if (csv.nameNorm === cal.nameNorm || csv.nameNorm.includes(cal.nameNorm) || cal.nameNorm.includes(csv.nameNorm)) {
    exactMatch.push({ csv, cal });
  } else {
    nameMismatch.push({ csv, cal });
  }
}

for (const cal of calRows) {
  if (!csvBySlot.has(cal.slot)) inCalNotCsv.push(cal);
}

// Mismo cliente en CSV pero otra fecha en Calendar
const csvByName = new Map();
for (const r of csvRows) {
  if (!csvByName.has(r.nameNorm)) csvByName.set(r.nameNorm, []);
  csvByName.get(r.nameNorm).push(r);
}

const rescheduled = [];
for (const cal of calRows) {
  const csvForName = csvByName.get(cal.nameNorm) ?? [];
  if (csvForName.length === 0) continue;
  const sameSlot = csvForName.some((c) => c.slot === cal.slot);
  if (!sameSlot) {
    rescheduled.push({
      name: cal.name,
      calendar: `${cal.date} ${cal.time}`,
      csv: csvForName.map((c) => `${c.date} ${c.time} (${c.order})`).join(" | "),
    });
  }
}

// ── Reporte ──
console.log("=== COMPARACIÓN bookings.csv vs GOOGLE CALENDAR (Appointly) ===\n");
console.log(`Rango CSV: ${fromDate} → ${toDate}`);
console.log(`Filas CSV:              ${csvRows.length}`);
console.log(`Eventos Appointly Cal:  ${calRows.length} (mismo rango)\n`);

console.log("── Coincidencias exactas (mismo slot + mismo nombre) ──");
console.log(`  ${exactMatch.length} / ${csvRows.length} filas CSV (${Math.round(exactMatch.length / csvRows.length * 100)}%)\n`);

if (exactMatch.length > 0) {
  console.log("  Muestra (5):");
  for (const { csv, cal } of exactMatch.slice(0, 5)) {
    console.log(`    ✓ ${csv.slot} | ${csv.name} | ${csv.order} | email CSV: ${csv.email}`);
  }
}

console.log("\n── CSV con slot distinto en Calendar (reagendos / citas movidas) ──");
console.log(`  ${inCsvNotCal.length} filas CSV sin ese slot en Calendar\n`);
for (const csv of inCsvNotCal.slice(0, 12)) {
  const calSameName = calRows.filter((c) => c.nameNorm === csv.nameNorm || c.nameNorm.includes(csv.nameNorm));
  const alt = calSameName.length
    ? ` → Calendar tiene: ${calSameName.map((c) => `${c.date} ${c.time}`).join(", ")}`
    : " → no aparece en Calendar (mismo rango)";
  console.log(`    CSV ${csv.slot} | ${csv.name} ${csv.order}${alt}`);
}
if (inCsvNotCal.length > 12) console.log(`    … y ${inCsvNotCal.length - 12} más`);

console.log("\n── En Calendar pero NO en CSV (mismo rango de fechas del CSV) ──");
console.log(`  ${inCalNotCsv.length} eventos\n`);
for (const cal of inCalNotCsv.slice(0, 12)) {
  console.log(`    CAL ${cal.slot} | ${cal.name}`);
}
if (inCalNotCsv.length > 12) console.log(`    … y ${inCalNotCsv.length - 12} más`);

console.log("\n── Mismo nombre: fecha CSV ≠ fecha Calendar ──");
console.log(`  ${rescheduled.length} casos\n`);
for (const r of rescheduled.slice(0, 10)) {
  console.log(`    ${r.name}`);
  console.log(`      CSV:      ${r.csv}`);
  console.log(`      Calendar: ${r.calendar}`);
}
if (rescheduled.length > 10) console.log(`    … y ${rescheduled.length - 10} más`);

console.log("\n── Conflictos de nombre en mismo slot ──");
console.log(`  ${nameMismatch.length} casos`);
for (const { csv, cal } of nameMismatch) {
  console.log(`    ${csv.slot}: CSV="${csv.name}" vs CAL="${cal.name}"`);
}

// Campos CSV que Calendar no trae
console.log("\n── Campos: qué trae cada fuente ──");
console.log("  CSV:     Appointment Time, Order, Customer Name, Customer Email, Service");
console.log("  Calendar: nombre (summary), fecha/hora, booking ID (description)");
console.log("  Calendar NO trae: email, teléfono, número de orden Shopify");
console.log("  → El script import-appointly-from-calendar.mjs cruza teléfono/email con orders_export_1.csv");

// Verificar emails en coincidencias exactas
let emailCheck = 0;
for (const { csv } of exactMatch.slice(0, 20)) {
  if (csv.email && csv.email !== "importado@google.local") emailCheck++;
}
console.log(`\n  De ${Math.min(20, exactMatch.length)} coincidencias, ${emailCheck} tienen email en CSV (Calendar no lo tiene)`);

console.log("\n=== RESUMEN ===");
console.log(`Coinciden (slot+nombre):     ${exactMatch.length}`);
console.log(`CSV sin slot en Calendar:    ${inCsvNotCal.length} (reagendos o cancelados)`);
console.log(`Calendar sin fila en CSV:    ${inCalNotCsv.length} (faltaban en export)`);
console.log(`Mismo cliente, otra fecha:   ${rescheduled.length}`);
