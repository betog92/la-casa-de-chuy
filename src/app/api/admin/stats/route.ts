import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { format, subDays } from "date-fns";
import { getMonterreyToday } from "@/utils/business-days";

/**
 * Obtiene estadísticas para el dashboard de admin.
 */
export async function GET() {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const supabase = createServiceRoleClient();
    const today = getMonterreyToday();
    const todayStr = format(today, "yyyy-MM-dd");
    const weekAgo = subDays(today, 7);
    const weekAgoStr = format(weekAgo, "yyyy-MM-dd");

    // Stats del día (usando función SQL)
    const { data: todayStats } = await supabase.rpc("get_reservations_stats", {
      p_date: todayStr,
    } as never);

    type StatsRow = {
      total_reservations: number;
      confirmed_reservations: number;
      cancelled_reservations: number;
      completed_reservations: number;
      total_revenue: number;
      confirmed_revenue: number;
    };
    const statsArray = (todayStats ?? []) as StatsRow[];
    const stats = statsArray[0];

    // Próximas reservas confirmadas (hoy en adelante)
    const { data: upcoming } = await supabase
      .from("reservations")
      .select("id, date, start_time, name, email, price, status")
      .gte("date", todayStr)
      .eq("status", "confirmed")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(10);

    // Ingresos de la última semana (reservas confirmadas)
    const { data: weekRevenue } = await supabase
      .from("reservations")
      .select("price")
      .gte("date", weekAgoStr)
      .lte("date", todayStr)
      .eq("status", "confirmed");

    const weekTotal =
      (weekRevenue as { price: number }[] | null)?.reduce(
        (sum, r) => sum + Number(r.price),
        0
      ) ?? 0;

    return successResponse({
      today: {
        totalReservations: stats?.total_reservations ?? 0,
        confirmedReservations: stats?.confirmed_reservations ?? 0,
        cancelledReservations: stats?.cancelled_reservations ?? 0,
        completedReservations: stats?.completed_reservations ?? 0,
        revenue: Number(stats?.confirmed_revenue ?? 0),
      },
      weekRevenue: weekTotal,
      upcoming: upcoming ?? [],
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar estadísticas",
      500
    );
  }
}
