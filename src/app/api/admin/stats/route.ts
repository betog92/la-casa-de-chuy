import { requireAdmin } from "@/lib/auth/admin";
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

    // Stats del día (usando función SQL)
    const { data: todayStats, error: rpcStatsErr } = await supabase.rpc(
      "get_reservations_stats",
      {
        p_date: todayStr,
      } as never,
    );

    if (rpcStatsErr) {
      console.error("[admin stats get_reservations_stats]", rpcStatsErr);
      return errorResponse("No se pudieron cargar las estadísticas del día", 500);
    }

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

    // Reservas recientes: por created_at; excluye null (en PG irían primero en DESC);
    // id DESC desempata misma marca de tiempo.
    const { data: recentReservations, error: recentErr } = await supabase
      .from("reservations")
      .select(
        "id, date, start_time, name, email, price, status, payment_status, created_at",
      )
      .not("created_at", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(25);

    if (recentErr) {
      console.error("[admin stats recentReservations]", recentErr);
      return errorResponse("No se pudo cargar las reservas recientes", 500);
    }

    // Ingresos de la última semana (reservas confirmadas, por fecha de cita)
    const { data: weekRevenue, error: weekErr } = await supabase
      .from("reservations")
      .select("price")
      .gte("date", weekAgoStr)
      .lte("date", todayStr)
      .eq("status", "confirmed");

    if (weekErr) {
      console.error("[admin stats weekRevenue]", weekErr);
      return errorResponse("No se pudieron cargar los ingresos de la semana", 500);
    }

    const weekTotal =
      (weekRevenue as { price: number }[] | null)?.reduce(
        (sum, r) => sum + Number(r.price),
        0
      ) ?? 0;

    // "Canceladas hoy" como ACCIÓN del día (cuándo se canceló), no como
    // "citas de hoy en status cancelled". Usamos `cancelled_at` filtrado
    // en zona horaria de Monterrey: [hoy 00:00 MX, mañana 00:00 MX).
    // `formatInTimeZone` con `XXX` produce ISO con offset, robusto ante
    // futuros cambios de zona (Monterrey hoy no observa DST, pero no
    // hardcodeamos `-06:00`).
    const now = new Date();
    const tomorrowMs = now.getTime() + 26 * 60 * 60 * 1000; // margen anti-DST
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

    const { count: cancelledTodayCount, error: cancelledTodayErr } =
      await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled")
        .not("cancelled_at", "is", null)
        .gte("cancelled_at", startOfTodayMx)
        .lt("cancelled_at", startOfTomorrowMx);

    if (cancelledTodayErr) {
      console.error("[admin stats cancelledToday]", cancelledTodayErr);
      // No bloqueamos el dashboard por este contador: caemos al valor
      // del RPC (citas de hoy canceladas) para no romper la página.
    }

    const cancelledReservationsToday =
      typeof cancelledTodayCount === "number"
        ? cancelledTodayCount
        : (stats?.cancelled_reservations ?? 0);

    return successResponse({
      today: {
        totalReservations: stats?.total_reservations ?? 0,
        confirmedReservations: stats?.confirmed_reservations ?? 0,
        cancelledReservations: cancelledReservationsToday,
        completedReservations: stats?.completed_reservations ?? 0,
        revenue: Number(stats?.confirmed_revenue ?? 0),
      },
      weekRevenue: weekTotal,
      recentReservations: recentReservations ?? [],
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar estadísticas",
      500
    );
  }
}
