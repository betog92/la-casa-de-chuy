import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
const ROOT = process.cwd();
const CUTOFF = "2026-05-31";
const ARCHIVE = resolve(ROOT, "scripts/_archivo-historial-importaciones");
const COMMIT = process.env.COMMIT === "1";
for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf-8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const isDel = (r) => r.source === "google_import" && r.date < CUTOFF && r.import_type !== "manual_client";
let offset = 0;
const rows = [];
for (;;) {
  const { data, error } = await sb.from("reservations").select("id, date, start_time, end_time, name, email, phone, status, source, import_type, order_number, google_event_id, price, payment_status, created_at, updated_at").eq("source", "google_import").lt("date", CUTOFF).range(offset, offset + 499);
  if (error) throw error;
  rows.push(...(data ?? []).filter(isDel));
  if (!data || data.length < 500) break;
  offset += 500;
}
const { count: keep } = await sb.from("reservations").select("id", { count: "exact", head: true }).eq("source", "google_import").lt("date", CUTOFF).eq("import_type", "manual_client");
const byType = {};
for (const r of rows) byType[r.import_type ?? "(null)"] = (byType[r.import_type ?? "(null)"] ?? 0) + 1;
console.log("A borrar:", rows.length, byType);
console.log("Conservar manual_client:", keep);
mkdirSync(ARCHIVE, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const base = resolve(ARCHIVE, `import-history-delete-before-${CUTOFF}-${stamp}`);
writeFileSync(base + ".json", JSON.stringify(rows, null, 2));
if (rows.length) {
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  writeFileSync(base + ".csv", [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"));
}
console.log("Respaldo:", base + ".json");
if (!COMMIT) { console.log("COMMIT=1 para borrar"); process.exit(0); }
for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100).map((r) => r.id);
  const { error } = await sb.from("reservations").delete().in("id", chunk);
  if (error) throw error;
  console.log("Borradas", Math.min(i + 100, rows.length), "/", rows.length);
}
const { count: left } = await sb.from("reservations").select("id", { count: "exact", head: true }).eq("source", "google_import").lt("date", CUTOFF).neq("import_type", "manual_client");
const { count: keep2 } = await sb.from("reservations").select("id", { count: "exact", head: true }).eq("source", "google_import").lt("date", CUTOFF).eq("import_type", "manual_client");
console.log("Post-delete (neq manual_client):", left, "| manual_client historial:", keep2);
