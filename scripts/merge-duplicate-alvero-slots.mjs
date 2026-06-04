/**
 * Fusiona en BD citas manual_client con mismo #orden, mismo día y horarios consecutivos
 * (dos bloques de 45 min que quedaron como dos filas tras el import).
 *
 *   node scripts/merge-duplicate-alvero-slots.mjs           preview + respaldo JSON
 *   node scripts/merge-duplicate-alvero-slots.mjs --commit  aplicar
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ARCHIVE_DIR = resolve(ROOT, "scripts/_archivo-historial-importaciones");
const COMMIT = process.argv.includes("--commit");
const MAX_GAP_MINUTES = 2;

const envPath = resolve(ROOT, ".env.local");
if (!existsSync(envPath)) {
  console.error("No se encontro .env.local");
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

function timeToMinutes(t) {
  const parts = String(t || "0").split(":").map((x) => Number(x) || 0);
  return parts[0] * 60 + parts[1];
}

function isConsecutiveSlot(endTime, startTime) {
  const gap = timeToMinutes(startTime) - timeToMinutes(endTime);
  return gap >= 0 && gap <= MAX_GAP_MINUTES;
}

function pickBetterName(a, b) {
  const na = (a || "").trim();
  const nb = (b || "").trim();
  if (na.length >= nb.length && na !== "Sin nombre") return na;
  if (nb.length > na.length && nb !== "Sin nombre") return nb;
  return na || nb;
}

async function loadManualClientRows(supabase) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, date, start_time, end_time, name, order_number, google_event_id, import_notes, status"
      )
      .eq("import_type", "manual_client")
      .not("order_number", "is", null)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return rows.filter((r) => String(r.order_number || "").trim() !== "");
}

function findMergeGroups(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.date}|${String(r.order_number).trim()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  const actions = [];

  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    group.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

    let i = 0;
    while (i < group.length) {
      const keep = { ...group[i] };
      const toDelete = [];
      let j = i + 1;

      while (j < group.length && isConsecutiveSlot(keep.end_time, group[j].start_time)) {
        const next = group[j];
        if (timeToMinutes(next.end_time) > timeToMinutes(keep.end_time)) {
          keep.end_time = next.end_time;
        }
        keep.name = pickBetterName(keep.name, next.name);
        if (next.import_notes) {
          keep.import_notes = [keep.import_notes, next.import_notes]
            .filter(Boolean)
            .join(" · ");
        }
        toDelete.push(next);
        j += 1;
      }

      if (toDelete.length > 0) {
        actions.push({
          keep_id: group[i].id,
          date: group[i].date,
          order_number: group[i].order_number,
          name: keep.name,
          start_time: group[i].start_time,
          end_time: keep.end_time,
          delete_ids: toDelete.map((d) => d.id),
          deleted_rows: toDelete,
        });
      }

      i = j;
    }
  }

  return actions;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`\nFusionar slots Alvero duplicados — ${COMMIT ? "COMMIT" : "PREVIEW"}\n`);

  const rows = await loadManualClientRows(supabase);
  console.log("manual_client con order_number:", rows.length);

  const actions = findMergeGroups(rows);
  const deleteCount = actions.reduce((n, a) => n + a.delete_ids.length, 0);

  console.log("Grupos a fusionar:", actions.length);
  console.log("Filas a borrar (segundos bloques):", deleteCount);
  console.log("Filas que quedan (actualizadas):", actions.length);

  console.log("\nMuestra (15):");
  for (const a of actions.slice(0, 15)) {
    console.log(
      `  #${a.order_number} ${a.name} | ${a.date} ${a.start_time} → ${a.end_time} | keep ${a.keep_id} | delete ${a.delete_ids.join(",")}`
    );
  }

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = resolve(ARCHIVE_DIR, `merge-duplicate-alvero-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(actions, null, 2), "utf-8");
  console.log("\nRespaldo:", backupPath);

  if (!COMMIT) {
    console.log("\nEjecuta con --commit para aplicar.");
    return;
  }

  if (actions.length === 0) {
    console.log("\nNada que fusionar.");
    return;
  }

  let updated = 0;
  let deleted = 0;
  const errors = [];

  for (const a of actions) {
    const keepRow = rows.find((r) => r.id === a.keep_id);
    const mergedNotes = [
      keepRow?.import_notes,
      ...a.deleted_rows.map((d) => d.import_notes),
    ]
      .filter(Boolean)
      .join(" · ");

    const { error: updErr } = await supabase
      .from("reservations")
      .update({
        end_time: a.end_time,
        name: a.name,
        ...(mergedNotes ? { import_notes: mergedNotes } : {}),
      })
      .eq("id", a.keep_id);

    if (updErr) {
      errors.push({ id: a.keep_id, step: "update", error: updErr.message });
      continue;
    }
    updated++;

    const { error: delErr } = await supabase
      .from("reservations")
      .delete()
      .in("id", a.delete_ids);

    if (delErr) {
      errors.push({ id: a.keep_id, step: "delete", error: delErr.message });
    } else {
      deleted += a.delete_ids.length;
    }
  }

  console.log("\n--- Resultado ---");
  console.log("Actualizadas:", updated);
  console.log("Borradas:", deleted);
  console.log("Errores:", errors.length);
  if (errors.length) {
    for (const e of errors.slice(0, 10)) console.log(" ", e);
  }
}

main().catch((err) => {
  console.error("Error fatal:", err.message ?? err);
  process.exit(1);
});
