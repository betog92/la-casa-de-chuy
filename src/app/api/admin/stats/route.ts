import { requireSuperAdmin } from "@/lib/auth/admin";
import {
  excludeManualAvailableSlots,
  filterNativeReservations,
} from "@/lib/admin/reservation-filters";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";
import { subDays } from "date-fns";
import { getMonterreyDayBounds } from "@/utils/business-days";

type SessionRow = { status: string };

function countConfirmedSessions(rows: SessionRow[]) {
  return rows.filter((r) => r.status === "confirmed").length;
}

function sumConfirmedRevenue(rows: { price: number }[]) {
  return rows.reduce((sum, r) => sum + Number(r.price), 0);
}

/**
 * Obtiene estadísticas para el dashboard de admin.
 */
export async function GET() {
  const { user, isSuperAdmin } = await requireSuperAdmin();
  if (!user) {
    return unauthorizedResponse("Debes iniciar sesión");
  }
  if (!isSuperAdmin) {
    return forbiddenResponse("Solo super administradores (familia) pueden ver el dashboard");
  }

  try {
    const supabase = createServiceRoleClient();
    const { dateStr: todayStr, startIso: startOfTodayMx, endIso: startOfTomorrowMx } =
      getMonterreyDayBounds();
    const { startIso: startOfWeekAgoMx } = getMonterreyDayBounds(subDays(new Date(), 7));

    const [
      { data: sessionsTodayRows, error: sessionsTodayErr },
      { data: revenueTodayRows, error: revenueTodayErr },
      { data: recentReservations, error: recentErr },
      { data: weekRevenueRows, error: weekErr },
      { count: cancelledTodayCount, error: cancelledTodayErr },
      { count: pendingManualPaymentsCount, error: pendingManualErr },
    ] = await Promise.all([
      // Citas con sesión hoy (incluye importadas; excluye slots Nancy)
      excludeManualAvailableSlots(
        supabase.from("reservations").select("status").eq("date", todayStr),
      ),
      // Ingresos: ventas nativas confirmadas registradas hoy (created_at, zona MX)
      filterNativeReservations(
        supabase
          .from("reservations")
          .select("price")
          .eq("status", "confirmed")
          .not("created_at", "is", null)
          .gte("created_at", startOfTodayMx)
          .lt("created_at", startOfTomorrowMx),
      ),
      filterNativeReservations(
        supabase
          .from("reservations")
          .select("id, date, start_time, name, email, price, status, created_at")
          .not("created_at", "is", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(25),
      ),
      filterNativeReservations(
        supabase
          .from("reservations")
          .select("price")
          .eq("status", "confirmed")
          .not("created_at", "is", null)
          .gte("created_at", startOfWeekAgoMx)
          .lt("created_at", startOfTomorrowMx),
      ),
      excludeManualAvailableSlots(
        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("status", "cancelled")
          .not("cancelled_at", "is", null)
          .gte("cancelled_at", startOfTodayMx)
          .lt("cancelled_at", startOfTomorrowMx),
      ),
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("source", "admin")
        .is("import_type", null)
        .neq("status", "cancelled")
        .eq("payment_status", "pending"),
    ]);

    if (sessionsTodayErr) {
      console.error("[admin stats sessionsToday]", sessionsTodayErr);
      return errorResponse("No se pudieron cargar las estadísticas del día", 500);
    }
    if (revenueTodayErr) {
      console.error("[admin stats revenueToday]", revenueTodayErr);
      return errorResponse("No se pudieron cargar los ingresos del día", 500);
    }
    if (recentErr) {
      console.error("[admin stats recentReservations]", recentErr);
      return errorResponse("No se pudo cargar las reservas recientes", 500);
    }
    if (weekErr) {
      console.error("[admin stats weekRevenue]", weekErr);
      return errorResponse("No se pudieron cargar los ingresos de la semana", 500);
    }

    const confirmedSessionsToday = countConfirmedSessions(
      (sessionsTodayRows ?? []) as SessionRow[],
    );
    const revenueToday = sumConfirmedRevenue(
      (revenueTodayRows ?? []) as { price: number }[],
    );
    const weekTotal = sumConfirmedRevenue(
      (weekRevenueRows ?? []) as { price: number }[],
    );

    if (cancelledTodayErr) {
      console.error("[admin stats cancelledToday]", cancelledTodayErr);
    }

    const cancelledReservationsToday =
      typeof cancelledTodayCount === "number" ? cancelledTodayCount : 0;

    if (pendingManualErr) {
      console.error("[admin stats pendingManualPayments]", pendingManualErr);
    }

    const pendingManualPayments =
      typeof pendingManualPaymentsCount === "number"
        ? pendingManualPaymentsCount
        : 0;

    return successResponse({
      today: {
        totalReservations: (sessionsTodayRows ?? []).length,
        confirmedReservations: confirmedSessionsToday,
        cancelledReservations: cancelledReservationsToday,
        completedReservations: 0,
        revenue: revenueToday,
      },
      weekRevenue: weekTotal,
      pendingManualPayments,
      recentReservations: recentReservations ?? [],
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar estadísticas",
      500,
    );
  }
}
