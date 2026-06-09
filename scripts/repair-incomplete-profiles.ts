/**
 * Repara perfiles en public.users sin name/phone (sync desde auth/reservas).
 *
 *   npx tsx scripts/repair-incomplete-profiles.ts           preview
 *   npx tsx scripts/repair-incomplete-profiles.ts --commit  aplicar
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  getAuthUserForSync,
  syncUserToDatabase,
} from "../src/lib/supabase/user-sync";
import { isProfileContactComplete } from "../src/lib/user-profile-contact";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMMIT = process.argv.includes("--commit");
const LIMIT = Number(process.env.REPAIR_PROFILE_LIMIT ?? "100");

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
  let value = trimmed.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: candidates, error } = await sb
    .from("users")
    .select("id, email, name, phone, updated_at")
    .or("name.is.null,phone.is.null")
    .order("updated_at", { ascending: true })
    .limit(LIMIT);

  if (error) {
    console.error("Error listando usuarios:", error.message);
    process.exit(1);
  }

  const incomplete = (candidates ?? []).filter(
    (r) =>
      !isProfileContactComplete({
        name: (r as { name: string | null }).name,
        phone: (r as { phone: string | null }).phone,
      }),
  ) as {
    id: string;
    email: string | null;
    name: string | null;
    phone: string | null;
    updated_at: string;
  }[];

  console.log(
    COMMIT ? "=== MODO COMMIT ===" : "=== PREVIEW (usa --commit para aplicar) ===",
  );
  console.log(`Perfiles incompletos encontrados: ${incomplete.length}\n`);

  if (incomplete.length === 0) {
    console.log("Nada que reparar.");
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const row of incomplete) {
    const { data: authData } = await sb.auth.admin.getUserById(row.id);
    const meta = authData?.user?.user_metadata ?? {};
    console.log(`— ${row.email ?? row.id}`);
    console.log(
      `  actual: name=${row.name ?? "null"} phone=${row.phone ?? "null"}`,
    );
    console.log(
      `  auth metadata: name=${meta.name ?? "—"} phone=${meta.phone ?? "—"}`,
    );

    if (!COMMIT) continue;

    if (!authData?.user?.email) {
      console.log("  SKIP: sin auth.users");
      fail++;
      continue;
    }

    const userForSync = await getAuthUserForSync(sb, authData.user);
    const result = await syncUserToDatabase(userForSync, sb);
    if (result.success) {
      ok++;
      console.log(
        `  OK linked=${result.linkedReservationCount ?? 0} skipped=${result.skipped ?? false}`,
      );
    } else {
      fail++;
      console.log(`  FAIL: ${result.error}`);
    }
  }

  if (COMMIT) {
    console.log(`\nResumen: ${ok} reparados, ${fail} fallidos`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
