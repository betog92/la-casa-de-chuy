import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { isCronSecretAuthorized } from "@/utils/cron-auth";
import {
  getAuthUserForSync,
  syncUserToDatabase,
} from "@/lib/supabase/user-sync";
import { isProfileContactComplete } from "@/lib/user-profile-contact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BATCH_LIMIT = 30;

// =====================================================
// /api/cron/repair-incomplete-profiles
// =====================================================
// Repara filas en public.users sin name/phone usando syncUserToDatabase
// (metadata auth, reservas invitado o vinculadas).
//
// Schedule: diario vía cron-job.org (no en vercel.json). Ver DEPLOY.md 7.cinco.
// Auth: CRON_SECRET o admin.
// =====================================================

export async function POST(request: NextRequest) {
  return runCron(request);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  const cronOk = isCronSecretAuthorized(request);
  if (!cronOk) {
    const { isAdmin } = await requireAdmin();
    if (!isAdmin) {
      return unauthorizedResponse("No autorizado");
    }
  }

  try {
    const service = createServiceRoleClient();

    const { data: candidates, error: listError } = await service
      .from("users")
      .select("id, email, name, phone")
      .or("name.is.null,phone.is.null")
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (listError) {
      console.error("[repair-incomplete-profiles] list error:", listError);
      return errorResponse("Error al listar perfiles incompletos", 500);
    }

    const rows = (candidates ?? []) as {
      id: string;
      email: string | null;
      name: string | null;
      phone: string | null;
    }[];

    const incomplete = rows.filter(
      (r) => !isProfileContactComplete({ name: r.name, phone: r.phone }),
    );

    const results: {
      userId: string;
      email: string | null;
      success: boolean;
      skipped?: boolean;
      linkedReservationCount?: number;
      error?: string;
    }[] = [];

    for (const row of incomplete) {
      const { data: authData, error: authError } =
        await service.auth.admin.getUserById(row.id);

      if (authError || !authData?.user?.email) {
        results.push({
          userId: row.id,
          email: row.email,
          success: false,
          error: authError?.message ?? "Sin usuario en auth",
        });
        continue;
      }

      const userForSync = await getAuthUserForSync(service, authData.user);
      const syncResult = await syncUserToDatabase(userForSync, service);

      results.push({
        userId: row.id,
        email: row.email,
        success: syncResult.success,
        skipped: syncResult.skipped,
        linkedReservationCount: syncResult.linkedReservationCount,
        error: syncResult.error,
      });
    }

    const repaired = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    return successResponse({
      scanned: incomplete.length,
      repaired,
      skipped,
      failed,
      results,
    });
  } catch (err) {
    console.error("[repair-incomplete-profiles] unexpected:", err);
    return errorResponse("Error inesperado", 500);
  }
}
