import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import {
  calculateLoyaltyLevel,
  loyaltyLevelRank,
  type LoyaltyLevel,
} from "@/utils/loyalty";

/**
 * Resumen de un cliente o fotógrafo para el listado de admin.
 * "Cliente" puede ser un usuario con cuenta o un invitado agrupado por email.
 */
export interface CustomerSummary {
  /** user.id si tiene cuenta. null para invitados (clave es email). */
  userId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  hasAccount: boolean;
  isPhotographer: boolean;
  studioName: string | null;
  /** ISO de creación de la cuenta o de la primera reserva si es invitado. */
  createdAt: string | null;

  // Métricas de cliente (reservas confirmadas/completadas hechas por él)
  reservationCount: number;
  totalSpent: number;
  lastReservationDate: string | null;

  // Beneficios actuales (solo aplica si tiene user_id)
  loyaltyLevel: LoyaltyLevel;
  loyaltyPoints: number;
  credits: number;

  // Métricas de fotógrafo (sesiones que le transfirieron y consolidó)
  receivedSessionsCount: number;
}

interface ReservationLite {
  id: number;
  user_id: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  price: number | null;
  date: string;
  status: "confirmed" | "cancelled" | "completed";
}

interface UserLite {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  is_admin: boolean;
  is_photographer: boolean;
  studio_name: string | null;
  created_at: string;
}

interface PointsAggRow {
  user_id: string;
  points: number;
}

interface CreditsAggRow {
  user_id: string;
  amount: number;
}

interface BenefitTransferLite {
  to_user_id: string | null;
  status: string;
}

const SORT_FIELDS = new Set([
  "spent",
  "reservations",
  "recent",
  "name",
  "level",
  "points",
  "credits",
]);

/**
 * Listado de clientes y fotógrafos con métricas agregadas.
 *
 * Query params:
 * - search: nombre, email, teléfono, studio (case-insensitive, "contiene")
 * - type: 'all' | 'customer' | 'photographer' (default 'all')
 * - sort: 'spent' | 'reservations' | 'recent' | 'name' | 'level' | 'points' | 'credits'
 * - direction: 'asc' | 'desc' (default depende del sort)
 * - limit: 1..200 (default 50)
 * - offset: 0..N (default 0)
 *
 * Respuesta:
 * - customers: CustomerSummary[]
 * - total: total después de filtros (antes de paginar)
 * - stats: { totalCustomers, totalPhotographers, totalSpent }
 */
export async function GET(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const type = (searchParams.get("type") || "all") as
      | "all"
      | "customer"
      | "photographer";
    const sortRaw = searchParams.get("sort") || "spent";
    const sort = SORT_FIELDS.has(sortRaw) ? sortRaw : "spent";
    const direction =
      searchParams.get("direction") === "asc" ? "asc" : "desc";
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50),
      200
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get("offset") || "0", 10) || 0
    );

    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);

    // Cargar todo en paralelo. Volúmenes esperados (<10k filas) lo permiten.
    const [
      usersRes,
      reservationsRes,
      pointsRes,
      creditsRes,
      transfersRes,
    ] = await Promise.all([
      supabase
        .from("users")
        .select(
          "id, email, name, phone, is_admin, is_photographer, studio_name, created_at"
        )
        .limit(20000),
      supabase
        .from("reservations")
        .select("id, user_id, email, name, phone, price, date, status")
        .in("status", ["confirmed", "completed"])
        .limit(50000),
      supabase
        .from("loyalty_points")
        .select("user_id, points")
        .eq("used", false)
        .eq("revoked", false)
        // Las Monedas Chuy no caducan (NULL = perpetuas).
        // Mantenemos compatibilidad con registros viejos que aún tengan fecha.
        .or(`expires_at.is.null,expires_at.gte.${today}`)
        .limit(50000),
      supabase
        .from("credits")
        .select("user_id, amount")
        .eq("used", false)
        .eq("revoked", false)
        .gte("expires_at", today)
        .limit(50000),
      supabase
        .from("benefit_transfers")
        .select("to_user_id, status")
        .in("status", ["auto_credited", "claimed"])
        .limit(50000),
    ]);

    if (usersRes.error) {
      console.error("Error cargando users:", usersRes.error);
      return errorResponse("Error al cargar usuarios", 500);
    }
    if (reservationsRes.error) {
      console.error("Error cargando reservations:", reservationsRes.error);
      return errorResponse("Error al cargar reservas", 500);
    }
    // IMPORTANTE: si fallan beneficios/transferencias, NO devolvemos saldos en 0
    // (eso engañaría al admin). Mejor cortar y mostrar error.
    if (pointsRes.error) {
      console.error("Error cargando loyalty_points:", pointsRes.error);
      return errorResponse("Error al cargar Monedas Chuy", 500);
    }
    if (creditsRes.error) {
      console.error("Error cargando credits:", creditsRes.error);
      return errorResponse("Error al cargar créditos", 500);
    }
    if (transfersRes.error) {
      console.error("Error cargando benefit_transfers:", transfersRes.error);
      return errorResponse("Error al cargar transferencias", 500);
    }

    const users = (usersRes.data || []) as UserLite[];
    const reservations = (reservationsRes.data || []) as ReservationLite[];
    const points = (pointsRes.data || []) as PointsAggRow[];
    const credits = (creditsRes.data || []) as CreditsAggRow[];
    const transfers = (transfersRes.data || []) as BenefitTransferLite[];

    // Mapas de agregación O(1)
    const pointsByUser = new Map<string, number>();
    for (const r of points) {
      if (!r.user_id) continue;
      pointsByUser.set(
        r.user_id,
        (pointsByUser.get(r.user_id) || 0) + (Number(r.points) || 0)
      );
    }
    const creditsByUser = new Map<string, number>();
    for (const r of credits) {
      if (!r.user_id) continue;
      creditsByUser.set(
        r.user_id,
        (creditsByUser.get(r.user_id) || 0) + (Number(r.amount) || 0)
      );
    }
    const receivedByUser = new Map<string, number>();
    for (const t of transfers) {
      if (!t.to_user_id) continue;
      receivedByUser.set(
        t.to_user_id,
        (receivedByUser.get(t.to_user_id) || 0) + 1
      );
    }

    // Agregar reservas: por user_id si existe, por email si es invitado
    interface Agg {
      count: number;
      total: number;
      lastDate: string | null;
      // Snapshots tomados de la reserva más reciente para invitados sin cuenta
      name: string | null;
      phone: string | null;
      firstDate: string | null;
    }

    const byUser = new Map<string, Agg>();
    const byGuestEmail = new Map<string, Agg>();

    const updateAgg = (
      map: Map<string, Agg>,
      key: string,
      r: ReservationLite
    ) => {
      const existing = map.get(key);
      const price = Number(r.price) || 0;
      if (!existing) {
        map.set(key, {
          count: 1,
          total: price,
          lastDate: r.date,
          firstDate: r.date,
          name: r.name,
          phone: r.phone,
        });
        return;
      }
      existing.count += 1;
      existing.total += price;
      if (!existing.lastDate || r.date > existing.lastDate) {
        existing.lastDate = r.date;
        // Si la reserva más reciente trae nombre/teléfono y no teníamos, úsalo
        if (!existing.name && r.name) existing.name = r.name;
        if (!existing.phone && r.phone) existing.phone = r.phone;
      }
      if (!existing.firstDate || r.date < existing.firstDate) {
        existing.firstDate = r.date;
      }
    };

    for (const r of reservations) {
      if (r.user_id) {
        updateAgg(byUser, r.user_id, r);
      } else if (r.email) {
        const k = r.email.trim().toLowerCase();
        if (k) updateAgg(byGuestEmail, k, r);
      }
    }

    // Construir filas finales
    const rows: CustomerSummary[] = [];
    const accountedEmails = new Set<string>();

    for (const u of users) {
      // Excluir admins puros (sin reservas y no fotógrafo)
      const userKey = u.id;
      const agg = byUser.get(userKey);
      const received = receivedByUser.get(userKey) || 0;
      const isPhoto = !!u.is_photographer;

      // Si es admin y no tiene reservas ni recibió transferencias ni es fotógrafo, omitir
      if (u.is_admin && !agg && received === 0 && !isPhoto) continue;

      const reservationCount = agg?.count || 0;
      const totalSpent = agg?.total || 0;
      const level = calculateLoyaltyLevel(reservationCount);
      const emailKey = u.email.trim().toLowerCase();
      accountedEmails.add(emailKey);

      rows.push({
        userId: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        hasAccount: true,
        isPhotographer: isPhoto,
        studioName: u.studio_name,
        createdAt: u.created_at,
        reservationCount,
        totalSpent,
        lastReservationDate: agg?.lastDate || null,
        loyaltyLevel: level,
        loyaltyPoints: pointsByUser.get(userKey) || 0,
        credits: creditsByUser.get(userKey) || 0,
        receivedSessionsCount: received,
      });
    }

    // Invitados: emails con reservas que NO están ya cubiertos por un usuario con cuenta
    for (const [email, agg] of byGuestEmail) {
      if (accountedEmails.has(email)) continue;
      const reservationCount = agg.count;
      const level = calculateLoyaltyLevel(reservationCount);

      rows.push({
        userId: null,
        email,
        name: agg.name,
        phone: agg.phone,
        hasAccount: false,
        isPhotographer: false,
        studioName: null,
        createdAt: agg.firstDate,
        reservationCount,
        totalSpent: agg.total,
        lastReservationDate: agg.lastDate,
        loyaltyLevel: level,
        loyaltyPoints: 0,
        credits: 0,
        receivedSessionsCount: 0,
      });
    }

    // Stats globales (antes de filtrar por type/search)
    const stats = {
      totalCustomers: rows.filter((r) => !r.isPhotographer).length,
      totalPhotographers: rows.filter((r) => r.isPhotographer).length,
      totalSpent: rows.reduce((s, r) => s + r.totalSpent, 0),
    };

    // Filtrar por tipo
    let filtered = rows;
    if (type === "customer") {
      filtered = filtered.filter((r) => !r.isPhotographer);
    } else if (type === "photographer") {
      filtered = filtered.filter((r) => r.isPhotographer);
    }

    // Búsqueda
    if (search) {
      filtered = filtered.filter((r) => {
        return (
          (r.name || "").toLowerCase().includes(search) ||
          r.email.toLowerCase().includes(search) ||
          (r.phone || "").toLowerCase().includes(search) ||
          (r.studioName || "").toLowerCase().includes(search)
        );
      });
    }

    // Orden
    const dir = direction === "asc" ? 1 : -1;
    const cmpString = (a: string | null, b: string | null) => {
      const av = (a || "").toLowerCase();
      const bv = (b || "").toLowerCase();
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    };
    filtered.sort((a, b) => {
      switch (sort) {
        case "name":
          return dir * cmpString(a.name || a.email, b.name || b.email);
        case "reservations":
          return dir * (a.reservationCount - b.reservationCount);
        case "recent": {
          const av = a.lastReservationDate || "";
          const bv = b.lastReservationDate || "";
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        }
        case "level":
          return (
            dir *
            (loyaltyLevelRank(a.loyaltyLevel) -
              loyaltyLevelRank(b.loyaltyLevel))
          );
        case "points":
          return dir * (a.loyaltyPoints - b.loyaltyPoints);
        case "credits":
          return dir * (a.credits - b.credits);
        case "spent":
        default:
          return dir * (a.totalSpent - b.totalSpent);
      }
    });

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return successResponse({
      customers: paginated,
      total,
      limit,
      offset,
      stats,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar clientes";
    console.error("Error inesperado en /api/admin/customers:", error);
    return errorResponse(errorMessage, 500);
  }
}
