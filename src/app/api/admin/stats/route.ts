import { requireSuperAdmin } from "@/lib/auth/admin";
import { filterNativeReservations } from "@/lib/admin/reservation-filters";
import {
  aggregateRevenueBreakdown,
  type RevenueRow,
} from "@/lib/admin/revenue-stats";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";
import { subDays } from "date-fns";
import { getMonterreyDayBounds } from "@/utils/business-days";

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
    const { startIso: startOfTodayMx, endIso: startOfTomorrowMx } =
      getMonterreyDayBounds();
    const { startIso: startOfWeekAgoMx } = getMonterreyDayBounds(subDays(new Date(), 7));

    const [
      { data: revenueTodayRows, error: revenueTodayErr },
      { data: weekRevenueRows, error: weekErr },
      { data: pendingManualRows, error: pendingManualErr },
    ] = await Promise.all([
      // Ingresos: ventas nativas confirmadas registradas hoy (created_at, zona MX)
      filterNativeReservations(
        supabase
          .from("reservations")
          .select("price, source, import_type, payment_status")
          .eq("status", "confirmed")
          .not("created_at", "is", null)
          .gte("created_at", startOfTodayMx)
          .lt("created_at", startOfTomorrowMx),
      ),
      filterNativeReservations(
        supabase
          .from("reservations")
          .select("price, source, import_type, payment_status")
          .eq("status", "confirmed")
          .not("created_at", "is", null)
          .gte("created_at", startOfWeekAgoMx)
          .lt("created_at", startOfTomorrowMx),
      ),
      supabase
        .from("reservations")
        .select("price")
        .eq("source", "admin")
        .is("import_type", null)
        .neq("status", "cancelled")
        .eq("payment_status", "pending"),
    ]);

    if (revenueTodayErr) {
      console.error("[admin stats revenueToday]", revenueTodayErr);
      return errorResponse("No se pudieron cargar los ingresos del día", 500);
    }
    if (weekErr) {
      console.error("[admin stats weekRevenue]", weekErr);
      return errorResponse("No se pudieron cargar los ingresos de la semana", 500);
    }

    const revenueToday = aggregateRevenueBreakdown(
      (revenueTodayRows ?? []) as RevenueRow[],
    );
    const weekRevenue = aggregateRevenueBreakdown(
      (weekRevenueRows ?? []) as RevenueRow[],
    );

    if (pendingManualErr) {
      console.error("[admin stats pendingManualPayments]", pendingManualErr);
    }

    const pendingRows = (pendingManualRows ?? []) as { price: number }[];
    const pendingManualPayments = pendingRows.length;
    const pendingManualPaymentsAmount = pendingRows.reduce(
      (sum, row) => sum + (Number(row.price) || 0),
      0,
    );

    return successResponse({
      today: {
        revenue: {
          web: revenueToday.web,
          manual: revenueToday.manual,
          total: revenueToday.total,
          webCount: revenueToday.webCount,
          manualCount: revenueToday.manualCount,
        },
        alveroSessions: revenueToday.alveroSessions,
      },
      week: {
        revenue: {
          web: weekRevenue.web,
          manual: weekRevenue.manual,
          total: weekRevenue.total,
          webCount: weekRevenue.webCount,
          manualCount: weekRevenue.manualCount,
        },
        alveroSessions: weekRevenue.alveroSessions,
      },
      pendingManualPayments,
      pendingManualPaymentsAmount,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar estadísticas",
      500,
    );
  }
}
