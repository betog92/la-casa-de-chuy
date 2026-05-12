import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";

/**
 * GET /api/admin/manual-payments
 *
 * Lista de reservas manuales de cliente (efectivo/transferencia/etc.) que
 * requieren validación de pago por parte del super admin, o ya validadas
 * dentro de una ventana de tiempo para historial.
 *
 * Reglas operativas (alineadas con PATCH /api/admin/reservations/[id]/payment-status):
 *   - `source = 'admin'` (reserva creada desde el panel, no por cliente online).
 *   - `import_type IS NULL` (excluye importaciones históricas que entraron como
 *     manuales pero no deben aparecer en este flujo).
 *   - `payment_status IN ('pending','paid')` según filtro.
 *
 * Query params:
 *   - `status` (csv): 'pending' (default) o 'paid' o ambos.
 *   - `days` (int 1..365): default 30. Ventana temporal:
 *      - Solo **pending**: no filtra por fecha (lista alineada con dashboard).
 *      - Solo **paid** o **pending+paid**: filas `paid` con
 *        `payment_validated_at` dentro de la ventana (igual que `paidInWindow`);
 *        en mezcla, los `pending` entran todos vía `or(...)`.
 *      - Orden mezclado (ambos estados): `updated_at` DESC.
 *   - `all` (1/true): ignora `days`.
 *   - `limit` (int 1..200): default 100.
 *
 * Respuesta:
 *   {
 *     success: true,
 *     rows: ReservationRow[],
 *     pendingTotal: number,  // total global de pendientes (ignora filtros)
 *     paidInWindow: number,  // validados dentro de la ventana
 *     limit: number,
 *   }
 *
 * Auth: cualquier admin puede leer. Validar (marcar pagado) requiere super admin
 *       y se hace contra el endpoint existente
 *       `PATCH /api/admin/reservations/[id]/payment-status`.
 */
export async function GET(request: NextRequest) {
  const { user, isAdmin } = await requireAdmin();
  if (!user) {
    return unauthorizedResponse("Debes iniciar sesión");
  }
  if (!isAdmin) {
    return forbiddenResponse("No tienes permisos de administrador");
  }

  const url = new URL(request.url);

  const statusCsv = (url.searchParams.get("status") ?? "pending").trim();
  const allowedStatuses = new Set(["pending", "paid"]);
  const statuses = statusCsv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowedStatuses.has(s));
  // Orden estable y sin duplicados (p. ej. status=pending,pending).
  const effectiveStatuses =
    statuses.length > 0
      ? [...new Set(statuses)].sort((a, b) => a.localeCompare(b))
      : ["pending"];

  const allParam = url.searchParams.get("all");
  const ignoreWindow = allParam === "1" || allParam === "true";

  let days: number | null = 30;
  if (!ignoreWindow) {
    const raw = url.searchParams.get("days");
    if (raw !== null) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 365) {
        days = parsed;
      }
    }
  } else {
    days = null;
  }

  const limitRaw = url.searchParams.get("limit");
  let limit = 100;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 200) {
      limit = parsed;
    }
  }

  try {
    const supabase = createServiceRoleClient();

    const sinceIso =
      days !== null
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    // Reservas manuales (panel, no importadas, no canceladas; canceladas → /admin/reembolsos).
    // Filtro base alineado con GET /api/admin/stats (pendingManualPayments).
    let rowsQuery = supabase
      .from("reservations")
      .select(
        "id, date, start_time, name, email, phone, price, status, payment_status, payment_method, payment_validated_at, created_at, updated_at",
      )
      .eq("source", "admin")
      .is("import_type", null)
      .neq("status", "cancelled")
      .in("payment_status", effectiveStatuses);

    const onlyPending =
      effectiveStatuses.length === 1 && effectiveStatuses[0] === "pending";
    const onlyPaid =
      effectiveStatuses.length === 1 && effectiveStatuses[0] === "paid";

    if (sinceIso) {
      if (onlyPending) {
        // Sin filtro de fecha: igual criterio que pendingTotal / dashboard.
      } else if (onlyPaid) {
        // Alineado con paidInWindow: ventana por fecha de validación, no updated_at.
        rowsQuery = rowsQuery.gte("payment_validated_at", sinceIso);
      } else {
        // pending + paid: todos los pendientes + validados en la ventana (misma fecha que paidInWindow)
        const iso = sinceIso.replace(/"/g, '\\"');
        rowsQuery = rowsQuery.or(
          `payment_status.eq.pending,and(payment_status.eq.paid,payment_validated_at.gte."${iso}")`,
        );
      }
    }

    // Orden: solo pendientes → los más antiguos primero (evita que updated_at DESC
    // empuje pendientes viejos fuera del LIMIT). Solo validados → por validación.
    // Ambos estados → actividad reciente como compromiso.
    if (onlyPending) {
      rowsQuery = rowsQuery
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
    } else if (onlyPaid) {
      rowsQuery = rowsQuery
        .order("payment_validated_at", {
          ascending: false,
        })
        .order("id", { ascending: false });
    } else {
      rowsQuery = rowsQuery
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false });
    }
    rowsQuery = rowsQuery.limit(limit);

    // Contador global de pendientes (sin filtros de ventana ni estado),
    // pero excluyendo canceladas por la misma razón. Sirve para la
    // tarjeta-atajo del dashboard y la card "Pendientes (global)".
    const pendingTotalQuery = supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("source", "admin")
      .is("import_type", null)
      .neq("status", "cancelled")
      .eq("payment_status", "pending");

    // Contador de validados dentro de la ventana (por fecha de
    // validación, no de registro). Sirve para la card "Validados en
    // ventana" como auditoría de actividad reciente del super admin.
    let paidInWindowQuery = supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("source", "admin")
      .is("import_type", null)
      .neq("status", "cancelled")
      .eq("payment_status", "paid");
    if (sinceIso) {
      paidInWindowQuery = paidInWindowQuery.gte(
        "payment_validated_at",
        sinceIso,
      );
    }

    // Paralelizamos: las 3 consultas son independientes.
    const [rowsResult, pendingTotalResult, paidInWindowResult] =
      await Promise.all([rowsQuery, pendingTotalQuery, paidInWindowQuery]);

    if (rowsResult.error) {
      console.error("[admin manual-payments rows]", rowsResult.error);
      return errorResponse("No se pudieron cargar los pagos manuales", 500);
    }
    if (pendingTotalResult.error) {
      console.error(
        "[admin manual-payments pendingTotal]",
        pendingTotalResult.error,
      );
    }
    if (paidInWindowResult.error) {
      console.error(
        "[admin manual-payments paidInWindow]",
        paidInWindowResult.error,
      );
    }

    return successResponse({
      rows: rowsResult.data ?? [],
      pendingTotal:
        typeof pendingTotalResult.count === "number"
          ? pendingTotalResult.count
          : 0,
      paidInWindow:
        typeof paidInWindowResult.count === "number"
          ? paidInWindowResult.count
          : 0,
      limit,
    });
  } catch (error) {
    console.error("Error fetching manual payments:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar pagos manuales",
      500,
    );
  }
}
