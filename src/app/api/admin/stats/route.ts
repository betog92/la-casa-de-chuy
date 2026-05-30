import { requireAdmin } from "@/lib/auth/admin";
import { filterNativeReservations } from "@/lib/admin/reservation-filters";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getMonterreyToday } from "@/utils/business-days";

const MX_TZ = "America/Monterrey";

type TodayRow = { status: string; price: number };

function aggregateTodayStats(rows: TodayRow[]) {
  return {
    total_reservations: rows.length,
    confirmed_reservations: rows.filter((r) => r.status === "confirmed").length,
    cancelled_reservations: rows.filter((r) => r.status === "cancelled").length,
    completed_reservations: rows.filter((r) => r.status === "completed").length,
    confirmed_revenue: rows
      .filter((r) => r.status === "confirmed")
      .reduce((sum, r) => sum + Number(r.price), 0),
  };
}

/**
 * Obtiene estadísticas para el dashboard de admin.
 */
export async function GET() {
  const { user, isAdmin } = await requireAdmin();
  if (!user) {
    return unauthorizedResponse("Debes iniciar sesión");
  }
  if (!isAdmin) {
    return forbiddenResponse("No tienes permisos de administrador");
  }

  try {
    const supabase = createServiceRoleClient();
    const today = getMonterreyToday();
    const todayStr = format(today, "yyyy-MM-dd");
    const weekAgo = subDays(today, 7);
    const weekAgoStr = format(weekAgo, "yyyy-MM-dd");

    const now = new Date();
    const tomorrowMs = now.getTime() + 26 * 60 * 60 * 1000;
    const startOfTodayMx = formatInTimeZone(
      now,
      MX_TZ,
      "yyyy-MM-dd'T'00:00:00XXX",
    );
    const startOfTomorrowMx = formatInTimeZone(
      new Date(tomorrowMs),
      MX_TZ,
      "yyyy-MM-dd'T'00:00:00XXX",
    );

    const [
      { data: todayRows, error: todayErr },
      { data: recentReservations, error: recentErr },
      { data: weekRevenue, error: weekErr },
      { count: cancelledTodayCount, error: cancelledTodayErr },
      { count: pendingManualPaymentsCount, error: pendingManualErr },
    ] = await Promise.all([
      filterNativeReservations(
        supabase.from("reservations").select("status, price").eq("date", todayStr),
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
          .gte("date", weekAgoStr)
          .lte("date", todayStr)
          .eq("status", "confirmed"),
      ),
      filterNativeReservations(
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

    if (todayErr) {
      console.error("[admin stats todayRows]", todayErr);
      return errorResponse("No se pudieron cargar las estadísticas del día", 500);
    }
    if (recentErr) {
      console.error("[admin stats recentReservations]", recentErr);
      return errorResponse("No se pudo cargar las reservas recientes", 500);
    }
    if (weekErr) {
      console.error("[admin stats weekRevenue]", weekErr);
      return errorResponse("No se pudieron cargar los ingresos de la semana", 500);
    }

    const stats = aggregateTodayStats((todayRows ?? []) as TodayRow[]);

    const weekTotal =
      (weekRevenue as { price: number }[] | null)?.reduce(
        (sum, r) => sum + Number(r.price),
        0,
      ) ?? 0;

    if (cancelledTodayErr) {
      console.error("[admin stats cancelledToday]", cancelledTodayErr);
    }

    const cancelledReservationsToday =
      typeof cancelledTodayCount === "number"
        ? cancelledTodayCount
        : stats.cancelled_reservations;

    if (pendingManualErr) {
      console.error("[admin stats pendingManualPayments]", pendingManualErr);
    }

    const pendingManualPayments =
      typeof pendingManualPaymentsCount === "number"
        ? pendingManualPaymentsCount
        : 0;

    return successResponse({
      today: {
        totalReservations: stats.total_reservations,
        confirmedReservations: stats.confirmed_reservations,
        cancelledReservations: cancelledReservationsToday,
        completedReservations: stats.completed_reservations,
        revenue: Number(stats.confirmed_revenue),
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
