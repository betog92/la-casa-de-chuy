/**
 * Importa citas manuales del staff desde Google Calendar.
 * Excluye los eventos de Appointly (ya importados por import-appointly-csv.mjs).
 *
 * Lógica:
 *  - Slots consecutivos con mismo summary+description → fusiona en 1 reserva de 90 min
 *  - Extrae nombre de description (face/Facebook/fb) o del summary
 *  - Extrae teléfono de description (cel./Cel seguido de número, o número de 10 dígitos suelto)
 *  - Eventos "nancy"/"Nancy" → name: "Nancy", phone: "N/A"
 *  - Eventos todo el día → se saltean
 *
 * Uso:
 *   node scripts/import-manual-events.mjs            (preview)
 *   node scripts/import-manual-events.mjs --commit   (borra viejas e inserta nuevas)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Cargar .env.local ────────────────────────────────────────────────────────
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

// ── Helpers de fecha/hora ─────────────────────────────────────────────────────
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

// ── Parseo de datos del evento ────────────────────────────────────────────────

/**
 * Extrae nombre de la description.
 * Busca el segmento después de face/Facebook/fb (separado por | o salto)
 */
function parseNameFromDesc(desc) {
  if (!desc) return null;
  // "face Nombre Apellido |..." o "Facebook: Nombre |..." o "Facebook Nombre |..."
  const match = desc.match(/(?:face(?:book)?[\s:.]*)([\w\s\u00C0-\u024F]+?)(?:\s*\||\s*$)/i);
  if (match) {
    const name = match[1].trim();
    // Verificar que no sea solo espacios o muy corto
    if (name.length > 2) return name;
  }
  // "fb. Nombre |..."
  const fbMatch = desc.match(/fb\.?\s*([\w\s\u00C0-\u024F]+?)(?:\s*\||\s*$)/i);
  if (fbMatch) {
    const name = fbMatch[1].trim();
    if (name.length > 2) return name;
  }
  return null;
}

/**
 * Extrae nombre real del cliente de la description.
 * Busca líneas con "sra." o segmentos largos que parezcan nombre completo.
 */
function parseClientNameFromDesc(desc) {
  if (!desc) return null;
  // "sra. Nombre Apellido Apellido |..."
  const sraMatch = desc.match(/sra\.?\s*([\w\s\u00C0-\u024F]+?)(?:\s*\||\s*$)/i);
  if (sraMatch) return sraMatch[1].trim();
  return null;
}

/**
 * Extrae teléfono de la description.
 * Busca "cel. NNNN" o "Cel NNNN" o un número de 10 dígitos suelto.
 */
function parsePhone(desc) {
  if (!desc) return null;
  // "cel. 8136506205" o "Cel 8115279801"
  const celMatch = desc.match(/cel\.?\s*([2-9]\d{9})/i);
  if (celMatch) return celMatch[1];
  // Número de 10 dígitos suelto (separado por | o al final)
  const looseMatch = desc.match(/(?:^|\|)\s*([2-9]\d{9})\s*(?:\||$)/);
  if (looseMatch) return looseMatch[1];
  return null;
}

/**
 * Extrae número de orden del summary para eventos Alberto.
 * Ej: "3972 ALBERTO / ...", "3917 / ALBERTO / ..." → "3972", "3917"
 */
function parseOrderNumberFromSummary(summary) {
  if (!summary || !summary.toUpperCase().includes("ALBERTO")) return null;
  const m = summary.match(/^\s*(\d+)\s*(?:\/\s*)?ALBERTO/i);
  return m ? m[1] : null;
}

/**
 * Extrae los datos después del celular en la description (vestido, sesión, ampliaciones, etc.).
 * La description se divide por | o \n; toma todos los segmentos después del que contiene "cel. NNNN".
 */
function parseNotesAfterPhone(desc) {
  if (!desc) return null;
  const segments = desc.split(/\|\n?|\n/).map((s) => s.trim()).filter(Boolean);
  const celIndex = segments.findIndex((seg) => /cel\.?\s*[2-9]\d{9}/i.test(seg));
  if (celIndex === -1) return null;
  const after = segments.slice(celIndex + 1).filter((s) => s.length > 0);
  return after.length ? after.join(" · ") : null;
}

/**
 * Extrae nombre del summary para eventos sin description.
 * Patrón: "3964 ALBERTO / FB nombre / Nombre Cliente / XV..."
 * Toma el primer segmento con minúsculas después del primero.
 */
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

/**
 * Construye el nombre y teléfono para un evento.
 */
function extractData(event) {
  const summary = (event.summary ?? "").trim();
  const desc = (event.description ?? "").replace(/\n/g, " | ");

  // Caso especial: Nancy
  const summaryLower = summary.toLowerCase();
  if (summaryLower === "nancy") {
    return { name: "Nancy", phone: "N/A", email: "nancy@google.local" };
  }

  const phone = parsePhone(desc) ?? "N/A";
  const email = "importado@google.local";

  // Intentar extraer nombre real del cliente primero
  const clientName = parseClientNameFromDesc(desc);
  if (clientName) return { name: clientName, phone, email };

  // Luego nombre de Facebook
  const fbName = parseNameFromDesc(desc);
  if (fbName) return { name: fbName, phone, email };

  // Si tiene description pero no tiene face/cel, usar primer segmento antes de |
  // pero solo si no parece un prefijo vacío como "Facebook :" o "Face."
  if (desc.trim()) {
    const firstSeg = desc.split("|")[0].trim();
    const isEmptyPrefix = /^(face(?:book)?[\s:.]*|fb\.?\s*)$/i.test(firstSeg);
    if (firstSeg && firstSeg.length > 2 && firstSeg.length < 60 && !isEmptyPrefix) {
      return { name: firstSeg, phone, email };
    }
  }

  // Sin description: extraer del summary
  const nameFromSummary = parseNameFromSummary(summary);
  return { name: nameFromSummary || "Sin nombre", phone, email };
}

// ── Obtener eventos de Google Calendar ────────────────────────────────────────
async function fetchManualEvents() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const credRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!calendarId || !credRaw) throw new Error("Faltan variables de Google Calendar");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credRaw),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const todayMonterrey = toZoned(now);
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

  // Filtrar: solo manuales (sin Appointly), con hora, confirmados
  return items.filter((e) => {
    if (e.status === "cancelled") return false;
    if (!e.start?.dateTime) return false; // saltar todo el día
    const desc = e.description ?? "";
    const summary = e.summary ?? "";
    // Excluir Appointly
    if (desc.includes("Appointly App")) return false;
    if (summary.includes("<>") && /Reservaci[oó]n/i.test(summary)) return false;
    return true;
  });
}

// ── Fusionar slots consecutivos ───────────────────────────────────────────────
/**
 * Agrupa eventos consecutivos con mismo summary+description en una sola reserva.
 * "Consecutivo" = el end del primero coincide con el start del segundo (±1 min).
 */
function mergeConsecutiveSlots(events) {
  if (events.length === 0) return [];

  const merged = [];
  let i = 0;

  while (i < events.length) {
    const current = events[i];
    const next = events[i + 1];

    const currentSummary = (current.summary ?? "").trim();
    const currentDesc = (current.description ?? "").trim();
    const currentEnd = new Date(current.end.dateTime);

    const isSameSummary = next && (next.summary ?? "").trim() === currentSummary;
    const isSameDesc = next && (next.description ?? "").trim() === currentDesc;
    const nextStart = next ? new Date(next.start.dateTime) : null;
    const isConsecutive = nextStart && Math.abs(currentEnd - nextStart) <= 60000; // ±1 min

    if (isSameSummary && isSameDesc && isConsecutive) {
      // Fusionar: usar start del primero y end del segundo
      merged.push({
        ...current,
        end: next.end,
        _merged: true,
      });
      i += 2; // saltar el siguiente
    } else {
      merged.push({ ...current, _merged: false });
      i += 1;
    }
  }

  return merged;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nModo: ${COMMIT ? "COMMIT (modifica la base de datos)" : "PREVIEW (solo lectura)"}\n`);

  console.log("Obteniendo eventos manuales de Google Calendar...");
  const rawEvents = await fetchManualEvents();
  console.log(`Eventos manuales con hora: ${rawEvents.length}`);

  const events = mergeConsecutiveSlots(rawEvents);
  const mergedCount = rawEvents.length - events.length;
  console.log(`Después de fusionar slots dobles: ${events.length} reservas (${mergedCount} slots fusionados)\n`);

  // Construir registros
  const records = events.map((e) => {
    const { name, phone, email } = extractData(e);
    const startDate = new Date(e.start.dateTime);
    const endDate = new Date(e.end.dateTime);
    const summary = (e.summary ?? "").trim();
    const isAlberto = summary.toUpperCase().includes("ALBERTO") && summary.toLowerCase() !== "nancy";
    const order_number = isAlberto ? parseOrderNumberFromSummary(summary) : null;
    const import_notes = isAlberto ? parseNotesAfterPhone(e.description ?? "") : null;
    return {
      google_event_id: e.id,
      name,
      phone,
      email,
      date: toDateStr(startDate),
      start_time: toTimeStr(startDate),
      end_time: toTimeStr(endDate),
      merged: e._merged,
      order_number: order_number ?? undefined,
      import_notes: import_notes ?? undefined,
      isAlberto,
    };
  });

  // Stats
  const conPhone = records.filter((r) => r.phone !== "N/A").length;
  const nancyCount = records.filter((r) => r.name === "Nancy").length;
  const mergedSlots = records.filter((r) => r.merged).length;

  const withOrder = records.filter((r) => r.order_number).length;
  const withNotes = records.filter((r) => r.import_notes).length;
  console.log(`Registros a insertar: ${records.length}`);
  console.log(`  Con teléfono:         ${conPhone}`);
  console.log(`  Sin teléfono (N/A):   ${records.length - conPhone}`);
  console.log(`  Slots de Nancy:       ${nancyCount}`);
  console.log(`  Sesiones fusionadas (90 min): ${mergedSlots}`);
  console.log(`  Alberto con orden:    ${withOrder}`);
  console.log(`  Alberto con notas:    ${withNotes}`);
  const otherCount = records.filter((r) => r.name !== "Nancy" && !r.isAlberto).length;
  console.log(`  Otras manuales (rojo): ${otherCount}\n`);

  // Preview — buscar casos con nombres sospechosos
  const sospechosos = records.filter(r =>
    /^face(?:book)?[\s:.]*$/i.test(r.name) ||
    r.name === "Sin nombre" ||
    r.name.length < 3
  );
  if (sospechosos.length > 0) {
    console.log(`\n⚠ Registros con nombre sospechoso (${sospechosos.length}):`);
    for (const r of sospechosos) {
      console.log(`  "${r.name}" | ${r.date} ${r.start_time} | ID: ${r.google_event_id}`);
    }
  } else {
    console.log("Todos los nombres se ven correctos.");
  }

  // Preview de primeros 10
  console.log("\n── Muestra de los primeros 10 registros ─────────────────");
  console.log("=".repeat(60));
  for (const r of records.slice(0, 10)) {
    console.log(`  Nombre: ${r.name}`);
    console.log(`  Tel:    ${r.phone}`);
    console.log(`  Email:  ${r.email}`);
    if (r.order_number) console.log(`  Orden:  #${r.order_number}`);
    if (r.import_notes) console.log(`  Notas:  ${r.import_notes.slice(0, 70)}${r.import_notes.length > 70 ? "…" : ""}`);
    console.log(`  Fecha:  ${r.date}  ${r.start_time} → ${r.end_time}${r.merged ? " (90 min)" : ""}`);
    console.log("-".repeat(60));
  }

  if (!COMMIT) {
    console.log("\nEjecuta con --commit para aplicar los cambios en Supabase.");
    return;
  }

  // Conectar a Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan variables de Supabase");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Borrar importaciones manuales anteriores (source = 'google_import' que no son de Appointly)
  // Los de Appointly tienen google_event_id que empieza con "#"
  console.log("\nBorrando reservas manuales anteriores...");
  const { data: existingManual } = await supabase
    .from("reservations")
    .select("id")
    .eq("source", "google_import")
    .not("google_event_id", "like", "#%");

  if (existingManual && existingManual.length > 0) {
    const ids = existingManual.map((r) => r.id);
    const { error: deleteError } = await supabase
      .from("reservations")
      .delete()
      .in("id", ids);
    if (deleteError) {
      console.error("Error al borrar:", deleteError.message);
      process.exit(1);
    }
    console.log(`  Borradas: ${ids.length} filas`);
  } else {
    console.log("  No había importaciones manuales previas");
  }

  // Insertar
  console.log(`\nInsertando ${records.length} reservas...`);
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const r of records) {
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
      import_type:
        r.name === "Nancy"
          ? "manual_available"
          : r.isAlberto
            ? "manual_client"
            : "manual_other",
      order_number: r.order_number ?? null,
      import_notes: r.import_notes ?? null,
    });

    if (insertError) {
      if (insertError.message.includes("duplicate")) {
        skipped++;
      } else {
        errors.push({ id: r.google_event_id, error: insertError.message });
      }
    } else {
      inserted++;
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Insertadas: ${inserted}`);
  console.log(`  Duplicadas (omitidas): ${skipped}`);
  console.log(`  Errores:    ${errors.length}`);
  if (errors.length > 0) {
    console.log("\nErrores:");
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.id}: ${e.error}`);
    }
  }
  console.log("\nImportación completada.");
}

main().catch((err) => {
  console.error("Error fatal:", err.message ?? err);
  process.exit(1);
});
