import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { isCronSecretAuthorized } from "@/utils/cron-auth";
import { getMonterreyTodayDateString } from "@/lib/reservations/session-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// =====================================================
// /api/cron/complete-past-sessions
// =====================================================
// Marca como `completed` las reservas `confirmed` cuya fecha de sesión
// ya pasó (zona America/Monterrey). Excluye bloques admin manual_available.
//
// Schedule: cron-job.org una vez al día — ver DEPLOY.md sección 7.cuatro.
// Llamadas autorizadas con `Authorization: Bearer <CRON_SECRET>` (o admin).
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
    const supabase = createServiceRoleClient();
    const todayStr = getMonterreyTodayDateString();

    const { data, error } = await supabase
      .from("reservations")
      .update({ status: "completed" } as never)
      .eq("status", "confirmed")
      .lt("date", todayStr)
      .or("import_type.is.null,import_type.neq.manual_available")
      .select("id");

    if (error) {
      console.error("[complete-past-sessions] update error:", error);
      return errorResponse("Error al completar sesiones pasadas", 500);
    }

    const updatedIds = (data ?? []) as { id: number }[];
    return successResponse({
      today: todayStr,
      completedCount: updatedIds.length,
      reservationIds: updatedIds.map((r) => r.id),
    });
  } catch (err) {
    console.error("[complete-past-sessions] unexpected:", err);
    return errorResponse("Error inesperado", 500);
  }
}
