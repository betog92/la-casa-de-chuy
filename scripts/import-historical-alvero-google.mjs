/**
 * Importa historial de citas Alvero (manual_client) desde Google Calendar.
 * Solo eventos pasados con numero de orden (titulo o descripcion), fusionando slots 90 min.
 * No modifica Google Calendar. No borra reservas existentes en Supabase.
 *
 * Uso (desde la raiz del proyecto):
 *   node scripts/import-historical-alvero-google.mjs           (preview + CSV)
 *   node scripts/import-historical-alvero-google.mjs --commit  (insertar)
 *
 * Requiere en .env.local:
 *   GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_CREDENTIALS
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HISTORY_MONTHS = 24;
const ARCHIVE_DIR = resolve(ROOT, "scripts/_archivo-historial-importaciones");
const COMMIT = process.argv.includes("--commit");
const MONTERREY_TZ = "America/Monterrey";

const envPath = resolve(ROOT, ".env.local");
if (!existsSync(envPath)) {
  console.error("No se encontro .env.local en la raiz del proyecto.");
  process.exit(1);
}
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

function toZoned(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: MONTERREY_TZ }));
}

function toDateStr(date) {
  const z = toZoned(date);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeStr(date) {
  const z = toZoned(date);
  return [z.getHours(), z.getMinutes(), z.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function getTodayStr() {
  return toDateStr(new Date());
}

function isAppointlyEvent(e) {
  const desc = e.description ?? "";
  const summary = e.summary ?? "";
  if (desc.includes("Appointly App")) return true;
  if (summary.includes("<>") && /Reservaci[oó]n/i.test(summary)) return true;
  return false;
}

function isAlveroSummary(summary) {
  const s = (summary ?? "").trim();
  if (s.toLowerCase() === "nancy") return false;
  return s.toUpperCase().includes("ALBERTO");
}

function parseOrderFromSummary(summary) {
  if (!summary || !summary.toUpperCase().includes("ALBERTO")) return null;
  const patterns = [
    /^\s*#?\s*(\d{3,5})\s*(?:\/\s*)?ALBERTO/i,
    /\b#\s*(\d{3,5})\s+ALBERTO/i,
    /\bALBERTO\s*#\s*(\d{3,5})\b/i,
    /\bAlberto\s*#\s*(\d{3,5})\b/i,
    /\bALBERTO\s+(\d{3,5})\b/i,
    /\b(\d{3,5})\s+ALBERTO\b/i,
  ];
  for (const re of patterns) {
    const m = summary.match(re);
    if (m) return m[1];
  }
  return null;
}

function parseOrderFromDescription(desc) {
  if (!desc) return null;
  const d = desc.replace(/\n/g, " | ");
  const patterns = [
    /(?:orden|order|pedido)\s*[:#]?\s*(\d{3,5})\b/i,
    /\b#\s*(\d{3,5})\b/,
    /\b(\d{3,5})\s*\/\s*ALBERTO/i,
    /\bALBERTO[^\d]{0,30}(\d{3,5})\b/i,
  ];
  for (const re of patterns) {
    const m = d.match(re);
    if (m) return m[1];
  }
  return null;
}

function getOrderNumber(summary, description) {
  return parseOrderFromSummary(summary) || parseOrderFromDescription(description);
}

function parseNameFromDesc(desc) {
  if (!desc) return null;
  const match = desc.match(/(?:face(?:book)?[\s:.]*)([\w\s\u00C0-\u024F]+?)(?:\s*\||\s*$)/i);
  if (match && match[1].trim().length > 2) return match[1].trim();
  const fbMatch = desc.match(/fb\.?\s*([\w\s\u00C0-\u024F]+?)(?:\s*\||\s*$)/i);
  if (fbMatch && fbMatch[1].trim().length > 2) return fbMatch[1].trim();
  return null;
}

function parseClientNameFromDesc(desc) {
  if (!desc) return null;
  const sraMatch = desc.match(/sra\.?\s*([\w\s\u00C0-\u024F]+?)(?:\s*\||\s*$)/i);
  if (sraMatch) return sraMatch[1].trim();
  return null;
}

function parsePhone(desc) {
  if (!desc) return null;
  const celMatch = desc.match(/cel\.?\s*([2-9]\d{9})/i);
  if (celMatch) return celMatch[1];
  const looseMatch = desc.match(/(?:^|\|)\s*([2-9]\d{9})\s*(?:\||$)/);
  if (looseMatch) return looseMatch[1];
  return null;
}

function parseNotesAfterPhone(desc) {
  if (!desc) return null;
  const segments = desc.split(/\|\n?|\n/).map((s) => s.trim()).filter(Boolean);
  const celIndex = segments.findIndex((seg) => /cel\.?\s*[2-9]\d{9}/i.test(seg));
  if (celIndex === -1) return null;
  const after = segments.slice(celIndex + 1).filter((s) => s.length > 0);
  return after.length ? after.join(" · ") : null;
}

function parseNameFromSummary(summary) {
  const parts = summary.split("/").map((p) => p.trim()).filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (/[a-záéíóúüñ]/i.test(p) && p.length > 2 && !/^xv|^ses/i.test(p)) {
      return p;
    }
  }
  return summary.trim();
}

function extractData(event) {
  const summary = (event.summary ?? "").trim();
  const desc = (event.description ?? "").replace(/\n/g, " | ");
  const phone = parsePhone(desc) ?? "N/A";
  const email = "importado@google.local";

  const clientName = parseClientNameFromDesc(desc);
  if (clientName) return { name: clientName, phone, email };

  const fbName = parseNameFromDesc(desc);
  if (fbName) return { name: fbName, phone, email };

  if (desc.trim()) {
    const firstSeg = desc.split("|")[0].trim();
    const isEmptyPrefix = /^(face(?:book)?[\s:.]*|fb\.?\s*)$/i.test(firstSeg);
    if (firstSeg && firstSeg.length > 2 && firstSeg.length < 60 && !isEmptyPrefix) {
      return { name: firstSeg, phone, email };
    }
  }

  const nameFromSummary = parseNameFromSummary(summary);
  return { name: nameFromSummary || "Sin nombre", phone, email };
}

function mergeConsecutiveSlots(events) {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime()
  );

  const merged = [];
  let i = 0;

  while (i < sorted.length) {
    let block = { ...sorted[i], _merged: false };
    let j = i + 1;

    while (j < sorted.length) {
      const next = sorted[j];
      const blockEnd = new Date(block.end.dateTime);
      const nextStart = new Date(next.start.dateTime);
      const isConsecutive = Math.abs(blockEnd.getTime() - nextStart.getTime()) <= 60000;
      if (!isConsecutive) break;

      const blockSummary = (block.summary ?? "").trim();
      const blockDesc = (block.description ?? "").trim();
      const nextSummary = (next.summary ?? "").trim();
      const nextDesc = (next.description ?? "").trim();
      const sameMeta = blockSummary === nextSummary && blockDesc === nextDesc;

      const orderBlock = getOrderNumber(blockSummary, block.description ?? "");
      const orderNext = getOrderNumber(nextSummary, next.description ?? "");
      const sameOrder = orderBlock && orderNext && orderBlock === orderNext;

      if (sameMeta || sameOrder) {
        block = { ...block, end: next.end, _merged: true };
        j += 1;
      } else {
        break;
      }
    }

    merged.push(block);
    i = j;
  }

  return merged;
}

async function fetchPastGoogleEvents() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const credRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!calendarId || !credRaw) throw new Error("Faltan GOOGLE_CALENDAR_ID o GOOGLE_CALENDAR_CREDENTIALS");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credRaw),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const calendar = google.calendar({ version: "v3", auth });

  const todayStart = toZoned(new Date());
  todayStart.setHours(0, 0, 0, 0);
  const pastStart = new Date(todayStart);
  pastStart.setMonth(pastStart.getMonth() - HISTORY_MONTHS);

  const all = [];
  let pageToken;
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

  return all.filter((e) => {
    if (e.status === "cancelled") return false;
    if (!e.start?.dateTime) return false;
    if (isAppointlyEvent(e)) return false;
    if (!isAlveroSummary(e.summary ?? "")) return false;
    return true;
  });
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

async function loadExistingGoogleEventIds(supabase) {
  const ids = new Set();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("reservations")
      .select("google_event_id")
      .not("google_event_id", "is", null)
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.google_event_id) ids.add(row.google_event_id);
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return ids;
}

async function main() {
  console.log(`\nImport historial Alvero — ${COMMIT ? "COMMIT" : "PREVIEW"}\n`);

  console.log("Leyendo Google Calendar (ultimos", HISTORY_MONTHS, "meses, hasta ayer)...");
  const rawEvents = await fetchPastGoogleEvents();
  console.log("Eventos Alvero en Google (pasado):", rawEvents.length);

  const mergedEvents = mergeConsecutiveSlots(rawEvents);
  console.log(
    "Tras fusionar slots:",
    mergedEvents.length,
    "(",
    rawEvents.length - mergedEvents.length,
    "slots fusionados )"
  );

  const todayStr = getTodayStr();
  const allRecords = mergedEvents.map((e) => {
    const { name, phone, email } = extractData(e);
    const startDate = new Date(e.start.dateTime);
    const endDate = new Date(e.end.dateTime);
    const summary = (e.summary ?? "").trim();
    const order_number = getOrderNumber(summary, e.description ?? "");
    const date = toDateStr(startDate);
    return {
      google_event_id: e.id,
      name,
      phone,
      email,
      date,
      start_time: toTimeStr(startDate),
      end_time: toTimeStr(endDate),
      merged: e._merged ? "yes" : "no",
      order_number: order_number ?? "",
      import_notes: parseNotesAfterPhone(e.description ?? "") ?? "",
      status: date < todayStr ? "completed" : "confirmed",
      import_type: "manual_client",
    };
  });

  const records = allRecords.filter((r) => r.order_number !== "");
  const skippedNoOrder = allRecords.length - records.length;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan variables de Supabase");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("Comprobando google_event_id ya en BD...");
  const existingIds = await loadExistingGoogleEventIds(supabase);

  const toInsert = records.filter((r) => !existingIds.has(r.google_event_id));
  const skippedExisting = records.length - toInsert.length;

  console.log("\n--- Resumen ---");
  console.log("Con numero de orden:", records.length);
  console.log("Sin numero (omitidas):", skippedNoOrder);
  console.log("Ya en BD (omitidas):", skippedExisting);
  console.log("A insertar:", toInsert.length);
  console.log("Sesiones fusionadas 90 min:", toInsert.filter((r) => r.merged === "yes").length);

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = resolve(ARCHIVE_DIR, `import-historical-alvero-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(toInsert, null, 2), "utf-8");
  writeFileSync(`${base}.csv`, toCsv(toInsert), "utf-8");
  console.log("\nRespaldo (filas a insertar):");
  console.log(" ", `${base}.json`);
  console.log(" ", `${base}.csv`);

  const sospechosos = toInsert.filter(
    (r) =>
      /^face(?:book)?[\s:.]*$/i.test(r.name) ||
      r.name === "Sin nombre" ||
      r.name.length < 3
  );
  if (sospechosos.length > 0) {
    console.log(`\nNombres sospechosos (${sospechosos.length}):`);
    for (const r of sospechosos.slice(0, 15)) {
      console.log(`  "${r.name}" | ${r.date} | #${r.order_number}`);
    }
  }

  console.log("\nMuestra (10 primeras a insertar):");
  for (const r of toInsert.slice(0, 10)) {
    console.log(
      `  #${r.order_number} ${r.name} | ${r.date} ${r.start_time}-${r.end_time} | ${r.status}${r.merged === "yes" ? " (90m)" : ""}`
    );
  }

  if (!COMMIT) {
    console.log("\nEjecuta con --commit para insertar en Supabase.");
    return;
  }

  if (toInsert.length === 0) {
    console.log("\nNada que insertar.");
    return;
  }

  console.log(`\nInsertando ${toInsert.length} reservas...`);
  let inserted = 0;
  let errors = [];

  for (const r of toInsert) {
    const { data: nextId, error: idError } = await supabase.rpc("next_google_import_id");
    if (idError || nextId == null) {
      errors.push({ id: r.google_event_id, error: idError?.message ?? "sin ID" });
      continue;
    }

    const { error: insertError } = await supabase.from("reservations").insert({
      id: nextId,
      email: r.email,
      name: r.name,
      phone: r.phone,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      price: 0,
      original_price: 0,
      status: r.status,
      payment_method: "google_import",
      source: "google_import",
      google_event_id: r.google_event_id,
      import_type: "manual_client",
      order_number: r.order_number,
      import_notes: r.import_notes || null,
    });

    if (insertError) {
      errors.push({ id: r.google_event_id, error: insertError.message });
    } else {
      inserted++;
      if (inserted % 100 === 0) console.log(`  ${inserted}/${toInsert.length}...`);
    }
  }

  const { count: histCount } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("import_type", "manual_client")
    .lt("date", "2026-05-31");

  console.log("\n--- Resultado ---");
  console.log("Insertadas:", inserted);
  console.log("Errores:", errors.length);
  console.log("manual_client con date < 2026-05-31:", histCount ?? "?");
  if (errors.length > 0) {
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.id}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Error fatal:", err.message ?? err);
  process.exit(1);
});
