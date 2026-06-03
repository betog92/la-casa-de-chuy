import { readFileSync } from "fs";
import { resolve } from "path";
import { google } from "googleapis";

for (const line of readFileSync(resolve(".env.local"), "utf-8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
}

function toZoned(date) { return new Date(date.toLocaleString("en-US", { timeZone: "America/Monterrey" })); }
function toDateStr(date) {
  const z = toZoned(date);
  return [z.getFullYear(), String(z.getMonth() + 1).padStart(2, "0"), String(z.getDate()).padStart(2, "0")].join("-");
}

function isAppointly(e) {
  const desc = e.description ?? "";
  const summary = e.summary ?? "";
  if (desc.includes("Appointly App")) return true;
  if (summary.includes("<>") && /Reservaci[oó]n/i.test(summary)) return true;
  return false;
}

function isAlveroClientEvent(e) {
  if (e.status === "cancelled") return false;
  if (!e.start?.dateTime) return false;
  if (isAppointly(e)) return false;
  const summary = (e.summary ?? "").trim();
  if (summary.toLowerCase() === "nancy") return false;
  return summary.toUpperCase().includes("ALBERTO");
}

function parseOrder(summary) {
  const m = summary.match(/^\s*(\d+)\s*(?:\/\s*)?ALBERTO/i);
  return m ? m[1] : null;
}

const calendarId = process.env.GOOGLE_CALENDAR_ID;
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});
const calendar = google.calendar({ version: "v3", auth });

const todayStart = toZoned(new Date());
todayStart.setHours(0, 0, 0, 0);
const pastStart = new Date(todayStart);
pastStart.setFullYear(pastStart.getFullYear() - 2);

let pageToken;
const all = [];
do {
  const res = await calendar.events.list({
    calendarId,
    timeMin: pastStart.toISOString(),
    timeMax: todayStart.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
    pageToken,
  });
  all.push(...(res.data.items ?? []));
  pageToken = res.data.nextPageToken;
} while (pageToken);

const alvero = all.filter(isAlveroClientEvent);
const nancy = all.filter((e) => !isAppointly(e) && e.start?.dateTime && (e.summary ?? "").trim().toLowerCase() === "nancy");
const appointly = all.filter(isAppointly);
const otherManual = all.filter((e) => !isAppointly(e) && e.start?.dateTime && !isAlveroClientEvent(e) && (e.summary ?? "").trim().toLowerCase() !== "nancy");

const dates = alvero.map((e) => toDateStr(new Date(e.start.dateTime))).sort();
const withOrder = alvero.filter((e) => parseOrder(e.summary ?? "")).length;
const beforeMay31 = alvero.filter((e) => toDateStr(new Date(e.start.dateTime)) < "2026-05-31").length;

console.log("Google Calendar (GOOGLE_CALENDAR_ID)");
console.log("Rango:", toDateStr(pastStart), "-> antes de", toDateStr(todayStart));
console.log("Total eventos:", all.length);
console.log("");
console.log("Alvero con cliente (ALBERTO en titulo):", alvero.length);
console.log("  Con # orden en titulo:", withOrder);
console.log("  Antes del 31 mayo 2026:", beforeMay31);
if (dates.length) console.log("  Fechas:", dates[0], "..", dates[dates.length - 1]);
console.log("");
console.log("Otros en el pasado: Appointly", appointly.length, "| Nancy", nancy.length, "| manual otras", otherManual.length);
