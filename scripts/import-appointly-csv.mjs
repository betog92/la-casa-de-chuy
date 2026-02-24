/**
 * Importa citas de Appointly desde los CSVs exportados.
 *
 * Fuentes:
 *   - bookings.csv     → fecha/hora, nombre, email, número de orden
 *   - orders_export_1.csv → teléfono (Billing Phone), cruzado por número de orden
 *
 * Uso:
 *   node scripts/import-appointly-csv.mjs            (preview, no modifica nada)
 *   node scripts/import-appointly-csv.mjs --commit    (borra las viejas e inserta las nuevas)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Cargar .env.local ────────────────────────────────────────────────────────
const envLines = readFileSync(resolve(ROOT, ".env.local"), "utf-8").split("\n");
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

// ── Parsear CSV simple (maneja comillas dobles) ──────────────────────────────
function parseCSV(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Parsear "Feb 21, 2026 3:30 PM" → { date, startTime, endTime } ───────────
function parseAppointmentTime(str) {
  // Formato: "Feb 21, 2026 3:30 PM"
  const match = str.match(
    /^(\w+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d+)\s+(AM|PM)$/i
  );
  if (!match) return null;

  const [, monthStr, day, year, hourStr, minStr, ampm] = match;

  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const monthIdx = months[monthStr.toLowerCase().slice(0, 3)];
  if (monthIdx === undefined) return null;

  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;

  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${year}-${pad(monthIdx + 1)}-${pad(parseInt(day, 10))}`;
  const startTime = `${pad(hour)}:${pad(min)}:00`;

  // Slot fijo de 45 minutos
  const totalMin = hour * 60 + min + 45;
  const endHour = Math.floor(totalMin / 60);
  const endMin = totalMin % 60;
  const endTime = `${pad(endHour)}:${pad(endMin)}:00`;

  return { date: dateStr, startTime, endTime };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nModo: ${COMMIT ? "COMMIT (modifica la base de datos)" : "PREVIEW (solo lectura)"}\n`);

  // 1. Leer bookings.csv
  const bookings = parseCSV(resolve(ROOT, "bookings.csv"));
  console.log(`bookings.csv: ${bookings.length} filas leídas`);

  // 2. Leer orders_export_1.csv y construir mapa orden → teléfono
  const orders = parseCSV(resolve(ROOT, "orders_export_1.csv"));
  console.log(`orders_export_1.csv: ${orders.length} filas leídas`);

  const phoneByOrder = {};
  for (const order of orders) {
    const name = (order["Name"] ?? "").trim();
    const phone = (order["Billing Phone"] ?? order["Phone"] ?? "").trim();
    if (name && phone) {
      phoneByOrder[name] = phone;
    }
  }
  console.log(`Teléfonos indexados: ${Object.keys(phoneByOrder).length}\n`);

  // 3. Construir registros a insertar
  const records = [];
  let parseErrors = 0;
  let noPhone = 0;
  const seenOrders = {}; // para detectar duplicados y asignar sufijo -b, -c...

  for (const booking of bookings) {
    const rawOrderNum = booking["Order"]?.trim();
    const parsed = parseAppointmentTime(booking["Appointment Time"]?.trim() ?? "");

    if (!parsed) {
      console.warn(`  [WARN] No se pudo parsear la fecha: "${booking["Appointment Time"]}"`);
      parseErrors++;
      continue;
    }

    // Si el número de orden ya apareció, agregar sufijo -b, -c, etc.
    let orderNum = rawOrderNum;
    if (seenOrders[rawOrderNum] !== undefined) {
      const suffix = String.fromCharCode(98 + seenOrders[rawOrderNum]); // 98 = 'b'
      orderNum = `${rawOrderNum}-${suffix}`;
      seenOrders[rawOrderNum]++;
    } else {
      seenOrders[rawOrderNum] = 0;
    }

    const phone = phoneByOrder[rawOrderNum] ?? null;
    if (!phone) noPhone++;

    records.push({
      google_event_id: orderNum,
      email: booking["Customer Email"]?.trim() || "importado@google.local",
      name: booking["Customer Name"]?.trim() || "Sin nombre",
      phone: phone || "N/A",
      date: parsed.date,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
    });
  }

  console.log(`Registros listos para insertar: ${records.length}`);
  console.log(`  Sin teléfono (usará "N/A"): ${noPhone}`);
  console.log(`  Errores de parseo de fecha:  ${parseErrors}\n`);

  // 4. Preview de los primeros 5
  console.log("Muestra de los primeros 5 registros:");
  console.log("=".repeat(60));
  for (const r of records.slice(0, 5)) {
    console.log(`  Orden:  ${r.google_event_id}`);
    console.log(`  Nombre: ${r.name}`);
    console.log(`  Email:  ${r.email}`);
    console.log(`  Tel:    ${r.phone}`);
    console.log(`  Fecha:  ${r.date}  ${r.start_time} → ${r.end_time}`);
    console.log("-".repeat(60));
  }

  if (!COMMIT) {
    console.log("\nEjecuta con --commit para aplicar los cambios en Supabase.");
    return;
  }

  // 5. Conectar a Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // 6. Borrar importaciones anteriores
  console.log("\nBorrando reservas anteriores con source = 'google_import'...");
  const { error: deleteError, count } = await supabase
    .from("reservations")
    .delete({ count: "exact" })
    .eq("source", "google_import");

  if (deleteError) {
    console.error("Error al borrar:", deleteError.message);
    process.exit(1);
  }
  console.log(`  Borradas: ${count ?? "?"} filas`);

  // 7. Reiniciar la secuencia a 10001
  console.log("Reiniciando secuencia reservations_google_import_id_seq...");
  const { error: seqError } = await supabase.rpc("reset_google_import_seq");
  if (seqError) {
    // La función requiere permisos de superusuario; si falla, ejecutar manualmente en Supabase:
    // ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;
    console.warn(`  Advertencia al reiniciar secuencia: ${seqError.message}`);
    console.warn("  ⚠ Ejecuta en Supabase SQL Editor:");
    console.warn("    ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;");
    console.warn("  Continuando de todas formas...");
  } else {
    console.log("  Secuencia reiniciada a 10001");
  }

  // 8. Insertar registros
  console.log(`\nInsertando ${records.length} reservas...`);
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const r of records) {
    // Obtener siguiente ID de la secuencia
    const { data: nextId, error: idError } = await supabase.rpc("next_google_import_id");
    if (idError || !nextId) {
      errors.push({ order: r.google_event_id, error: idError?.message ?? "sin ID" });
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
    });

    if (insertError) {
      errors.push({ order: r.google_event_id, error: insertError.message });
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Insertadas: ${inserted}`);
  console.log(`  Errores:    ${errors.length}`);
  if (errors.length > 0) {
    console.log("\nErrores detallados:");
    for (const e of errors) {
      console.log(`  ${e.order}: ${e.error}`);
    }
  }
  console.log("\nImportación completada.");
}

main().catch((err) => {
  console.error("Error fatal:", err.message ?? err);
  process.exit(1);
});
