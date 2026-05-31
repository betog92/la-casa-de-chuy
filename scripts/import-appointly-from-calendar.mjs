/**
 * Importa citas Appointly desde Google Calendar (sin CSV de Apntly).
 *
 * Identifica eventos Appointly por:
 *   - description contiene "Appointly App", o
 *   - summary con patrón "<> Nombre - Reservación"
 *
 * Por defecto solo inserta huecos (slot libre en BD). No borra citas existentes
 * ni reservas web (#1, #2, #3…).
 *
 * Uso:
 *   node scripts/import-appointly-from-calendar.mjs
 *   node scripts/import-appointly-from-calendar.mjs --commit
 *   node scripts/import-appointly-from-calendar.mjs --from=2026-02-01 --to=2026-08-31
 *   node scripts/import-appointly-from-calendar.mjs --replace-appointly --commit
 *
 * Por defecto solo citas desde 2026-05-30 (lanzamiento); anteriores se ignoran.
 */

/** Citas antes del lanzamiento no se importan. */
const DEFAULT_FROM_DATE = "2026-05-30";

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const envPath = resolve(ROOT, ".env.local");
if (!existsSync(envPath)) {
  console.error("No se encontró .env.local");
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

const COMMIT = process.argv.includes("--commit");
const REPLACE_APPOINTLY = process.argv.includes("--replace-appointly");
const MONTERREY_TZ = "America/Monterrey";

function argDate(flag) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg?.slice(flag.length + 3) ?? null;
}

function toZoned(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: MONTERREY_TZ }));
}

function toDateStr(date) {
  const z = toZoned(date);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

function toTimeStr(date) {
  const z = toZoned(date);
  return [z.getHours(), z.getMinutes(), z.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function slotKey(date, time) {
  return `${date} ${time.slice(0, 5)}`;
}

function isAppointlyEvent(event) {
  if (event.status === "cancelled") return false;
  if (!event.start?.dateTime) return false;
  const desc = event.description ?? "";
  const summary = event.summary ?? "";
  if (desc.includes("Appointly App")) return true;
  return summary.includes("<>") && /Reservaci[oó]n/i.test(summary);
}

function parseNameFromSummary(summary) {
  const m = summary.match(/<>\s*(.+?)\s*-\s*Reservaci[oó]n/i);
  if (m) return m[1].trim();
  return summary.replace(/\s+/g, " ").trim() || "Sin nombre";
}

function parseBookingId(description) {
  const m = (description ?? "").match(/bookings\/(\d+-\d+)/i);
  return m?.[1] ?? null;
}

function buildGoogleEventId(event) {
  const bookingId = parseBookingId(event.description ?? "");
  if (bookingId) return `apntly-${bookingId}`;
  return `gcal-${event.id}`;
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += ch;
  }
  result.push(current);
  return result;
}

function parseCSV(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

function normName(name) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normPhone(raw) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function parseCreatedAt(str) {
  if (!str) return 0;
  const t = Date.parse(str);
  return Number.isNaN(t) ? 0 : t;
}

const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

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
  return { date, time };
}

/** Índice Shopify: por orden (#6521 → 6521) y por nombre (más reciente gana). */
function loadShopifyIndex() {
  const ordersPath = resolve(ROOT, "orders_export_1.csv");
  if (!existsSync(ordersPath)) {
    return { byOrder: new Map(), byName: new Map() };
  }

  const orders = parseCSV(ordersPath);
  const byOrder = new Map();
  const byName = new Map();

  for (const order of orders) {
    const orderNum = (order.Name ?? "").trim().replace(/^#/, "");
    const billingName = (order["Billing Name"] ?? order["Shipping Name"] ?? "").trim();
    const email = (order.Email ?? "").trim().toLowerCase();
    const phone = normPhone(order["Billing Phone"] ?? order.Phone ?? order["Shipping Phone"]);
    const createdAt = parseCreatedAt(order["Created at"]);

    const contact = {
      orderNum,
      name: billingName,
      email: email || "importado@google.local",
      phone: phone ?? "N/A",
      createdAt,
    };

    if (orderNum) byOrder.set(orderNum, contact);

    const nameKey = normName(billingName);
    if (!nameKey) continue;
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(contact);
  }

  for (const list of byName.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }

  return { byOrder, byName };
}

/** bookings.csv viejo: email + orden por nombre y por slot (cuando coincide con Calendar). */
function loadBookingsCsvIndex() {
  const bookingsPath = resolve(ROOT, "bookings.csv");
  const bySlot = new Map();
  const byName = new Map();

  if (!existsSync(bookingsPath)) return { bySlot, byName };

  for (const row of parseCSV(bookingsPath)) {
    const parsed = parseApptTime(row["Appointment Time"] ?? "");
    const name = (row["Customer Name"] ?? "").trim();
    const email = (row["Customer Email"] ?? "").trim().toLowerCase();
    const order = (row.Order ?? "").trim().replace(/^#/, "");
    if (!name) continue;

    const entry = { name, email, orderNum: order };
    const nameKey = normName(name);
    if (!byName.has(nameKey)) byName.set(nameKey, entry);

    if (parsed) {
      bySlot.set(slotKey(parsed.date, `${parsed.time}:00`), entry);
    }
  }

  return { bySlot, byName };
}

function nameTokens(name) {
  return normName(name).split(" ").filter((t) => t.length > 1);
}

function nameMatchScore(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let shared = 0;
  for (const t of ta) if (setB.has(t)) shared++;
  if (shared < 2) return 0;
  return shared / Math.max(ta.length, tb.length);
}

function lookupShopifyByName(name, shopify) {
  const key = normName(name);
  const exact = shopify.byName.get(key);
  if (exact?.length) return { contact: exact[0], match: "shopify_name_exact" };

  let best = null;
  let bestScore = 0;
  for (const [candidateKey, list] of shopify.byName) {
    const score = nameMatchScore(key, candidateKey);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      best = list[0];
    }
  }
  if (best) return { contact: best, match: "shopify_name_fuzzy" };
  return null;
}

/**
 * Cruce de contacto (misma lógica que CSV + Shopify):
 * 1. bookings.csv por slot exacto → email + orden → teléfono Shopify
 * 2. bookings.csv por nombre → email + orden → teléfono Shopify
 * 3. Shopify por nombre (exacto, luego fuzzy)
 */
function lookupContact(name, date, startTime, bookings, shopify) {
  const slot = slotKey(date, startTime);

  const fromSlot = bookings.bySlot.get(slot);
  if (fromSlot && normName(fromSlot.name) === normName(name)) {
    const shop = fromSlot.orderNum ? shopify.byOrder.get(fromSlot.orderNum) : null;
    return {
      email: fromSlot.email || shop?.email || "importado@google.local",
      phone: shop?.phone ?? "N/A",
      orderNum: fromSlot.orderNum || shop?.orderNum || null,
      match: "bookings_csv_slot",
    };
  }

  const fromName = bookings.byName.get(normName(name));
  if (fromName) {
    const shop = fromName.orderNum ? shopify.byOrder.get(fromName.orderNum) : null;
    return {
      email: fromName.email || shop?.email || "importado@google.local",
      phone: shop?.phone ?? "N/A",
      orderNum: fromName.orderNum || shop?.orderNum || null,
      match: fromName.orderNum && shop ? "bookings_csv_order" : "bookings_csv_name",
    };
  }

  const shopMatch = lookupShopifyByName(name, shopify);
  if (shopMatch) {
    return {
      email: shopMatch.contact.email,
      phone: shopMatch.contact.phone,
      orderNum: shopMatch.contact.orderNum || null,
      match: shopMatch.match,
    };
  }

  return {
    email: "importado@google.local",
    phone: "N/A",
    orderNum: null,
    match: "none",
  };
}

async function fetchAppointlyEvents(fromDate, toDate) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const credRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!calendarId || !credRaw) throw new Error("Faltan GOOGLE_CALENDAR_ID o GOOGLE_CALENDAR_CREDENTIALS");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credRaw),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = new Date(`${fromDate}T00:00:00-06:00`);
  const timeMax = new Date(`${toDate}T23:59:59-06:00`);

  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  return (res.data.items ?? []).filter(isAppointlyEvent);
}

async function main() {
  const defaultTo = new Date();
  defaultTo.setMonth(defaultTo.getMonth() + 6);
  const fromDate = argDate("from") ?? DEFAULT_FROM_DATE;
  const toDate = argDate("to") ?? toDateStr(defaultTo);

  console.log(`\nModo: ${COMMIT ? "COMMIT" : "PREVIEW"}`);
  console.log(`Rango: ${fromDate} → ${toDate}`);
  console.log(`Estrategia: ${REPLACE_APPOINTLY ? "reemplazar appointly existentes" : "solo huecos libres"}\n`);

  const shopify = loadShopifyIndex();
  const bookings = loadBookingsCsvIndex();
  console.log(`Shopify orders indexados: ${shopify.byOrder.size} órdenes, ${shopify.byName.size} nombres`);
  console.log(`bookings.csv indexado: ${bookings.byName.size} nombres, ${bookings.bySlot.size} slots\n`);

  console.log("Leyendo Google Calendar...");
  const events = await fetchAppointlyEvents(fromDate, toDate);
  console.log(`Eventos Appointly en Calendar: ${events.length}\n`);

  const matchStats = {};
  const records = events.map((e) => {
    const start = new Date(e.start.dateTime);
    const end = new Date(e.end.dateTime);
    const name = parseNameFromSummary(e.summary ?? "");
    const date = toDateStr(start);
    const start_time = toTimeStr(start);
    const contact = lookupContact(name, date, start_time, bookings, shopify);
    matchStats[contact.match] = (matchStats[contact.match] ?? 0) + 1;
    return {
      google_event_id: buildGoogleEventId(e),
      gcal_id: e.id,
      name,
      phone: contact.phone,
      email: contact.email,
      orderNum: contact.orderNum,
      contactMatch: contact.match,
      date,
      start_time,
      end_time: toTimeStr(end),
      booking_id: parseBookingId(e.description ?? ""),
    };
  });

  console.log("── Cruce contacto (Calendar + bookings.csv + Shopify) ──");
  for (const [k, v] of Object.entries(matchStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  const withPhone = records.filter((r) => r.phone !== "N/A").length;
  const withEmail = records.filter((r) => r.email !== "importado@google.local").length;
  console.log(`  Con teléfono: ${withPhone}/${records.length}`);
  console.log(`  Con email real: ${withEmail}/${records.length}\n`);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan variables de Supabase");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  if (COMMIT && REPLACE_APPOINTLY) {
    console.log("Borrando importaciones appointly anteriores...");
    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("source", "google_import")
      .eq("import_type", "appointly");
    if (error) {
      console.error("Error al borrar:", error.message);
      process.exit(1);
    }
  }

  const { data: existing } = await supabase
    .from("reservations")
    .select("id,name,source,date,start_time,status,google_event_id")
    .gte("date", fromDate)
    .lte("date", toDate)
    .neq("status", "cancelled");

  const byEventId = new Map();
  const bySlot = new Map();
  for (const r of existing ?? []) {
    if (r.google_event_id) byEventId.set(r.google_event_id, r);
    bySlot.set(slotKey(r.date, r.start_time), r);
  }

  const toInsert = [];
  const skipped = { duplicateId: 0, slotTaken: 0 };
  const conflicts = [];

  for (const r of records) {
    if (byEventId.has(r.google_event_id)) {
      skipped.duplicateId++;
      continue;
    }

    const slot = bySlot.get(slotKey(r.date, r.start_time));
    if (slot) {
      skipped.slotTaken++;
      if (slot.name !== r.name) {
        conflicts.push({
          slot: slotKey(r.date, r.start_time),
          calendar: r.name,
          db: `#${slot.id} ${slot.name} (${slot.source})`,
        });
      }
      continue;
    }

    toInsert.push(r);
  }

  console.log(`A insertar: ${toInsert.length}`);
  console.log(`  Omitidas (google_event_id ya existe): ${skipped.duplicateId}`);
  console.log(`  Omitidas (slot ocupado): ${skipped.slotTaken}`);

  if (conflicts.length > 0) {
    console.log(`\n⚠ Conflictos nombre distinto (${conflicts.length}):`);
    for (const c of conflicts.slice(0, 15)) {
      console.log(`  ${c.slot}: Calendar="${c.calendar}" vs BD=${c.db}`);
    }
    if (conflicts.length > 15) console.log(`  … y ${conflicts.length - 15} más`);
  }

  console.log("\n── Muestra (primeros 8 a insertar) ──");
  for (const r of toInsert.slice(0, 8)) {
    console.log(
      `  ${r.date} ${r.start_time.slice(0, 5)} | ${r.name} | tel:${r.phone} | ${r.email} | ${r.contactMatch}${r.orderNum ? ` #${r.orderNum}` : ""}`,
    );
  }

  if (!COMMIT) {
    console.log("\nEjecuta con --commit para insertar.");
    return;
  }

  let inserted = 0;
  const errors = [];

  for (const r of toInsert) {
    const { data: nextId, error: idError } = await supabase.rpc("next_google_import_id");
    if (idError || !nextId) {
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
      status: "confirmed",
      payment_method: "google_import",
      source: "google_import",
      google_event_id: r.google_event_id,
      import_type: "appointly",
      order_number: r.orderNum ?? null,
    });

    if (insertError) {
      errors.push({ id: r.google_event_id, error: insertError.message });
    } else {
      inserted++;
      bySlot.set(slotKey(r.date, r.start_time), { id: nextId, name: r.name });
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Insertadas: ${inserted}`);
  console.log(`  Errores:    ${errors.length}`);
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
