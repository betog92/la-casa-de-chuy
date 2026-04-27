import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import { calculateLoyaltyLevel, type LoyaltyLevel } from "@/utils/loyalty";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =====================================================
// Tipos de respuesta
// =====================================================

// Las Monedas Chuy no caducan, así que solo hay 3 tipos de movimiento.
export type LoyaltyMovementType =
  | "earned" // ganadas, disponibles
  | "used" // ya consumidas
  | "revoked"; // revocadas (cancelación)

export type CreditMovementType =
  | "earned"
  | "used"
  | "revoked"
  | "expired";

export interface LoyaltyMovement {
  id: string;
  type: LoyaltyMovementType;
  points: number;
  reservationId: number | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreditMovement {
  id: string;
  type: CreditMovementType;
  amount: number;
  source: string;
  reservationId: number | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface CustomerReservationLite {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed";
  price: number;
  originalPrice: number;
  rescheduleCount: number;
  paymentMethod: string | null;
  paymentStatus: "pending" | "paid" | "not_applicable" | null;
  // Descuentos aplicados (para mostrar en celdas de columnas)
  loyaltyDiscount: number;
  loyaltyPointsUsed: number;
  creditsUsed: number;
  referralDiscount: number;
  lastMinuteDiscount: number;
  discountCode: string | null;
  discountCodeDiscount: number;
  // Fotógrafo asignado a la sesión (texto libre, ya existía)
  photographerStudio: string | null;
  sessionType: "xv_anos" | "boda" | "casual" | null;
}

export interface CustomerTransferLite {
  id: string;
  reservationId: number;
  reservationDate: string | null;
  reservationStartTime: string | null;
  fromEmail: string;
  fromUserId: string | null;
  toEmail: string;
  toUserId: string | null;
  toStudioName: string | null;
  status:
    | "pending"
    | "cancelled"
    | "auto_credited"
    | "pending_claim"
    | "claimed"
    | "reverted";
  transferredPoints: number;
  createdAt: string;
  materializedAt: string | null;
  claimedAt: string | null;
  cancelledAt: string | null;
}

export interface CustomerDetailResponse {
  profile: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    isPhotographer: boolean;
    studioName: string | null;
    isAdmin: boolean;
    createdAt: string;
  };
  summary: {
    reservationCount: number;
    totalSpent: number;
    loyaltyLevel: LoyaltyLevel;
    loyaltyPointsAvailable: number;
    creditsAvailable: number;
    receivedSessionsCount: number;
    /** Última reserva (cualquier status) en formato YYYY-MM-DD. */
    lastReservationDate: string | null;
  };
  reservations: CustomerReservationLite[];
  loyaltyMovements: LoyaltyMovement[];
  creditMovements: CreditMovement[];
  outgoingTransfers: CustomerTransferLite[];
  incomingTransfers: CustomerTransferLite[];
  /** Resultados de chequeos de consistencia para el banner "todo cuadra". */
  consistency: {
    ok: boolean;
    issues: string[];
  };
}

// =====================================================
// Handler
// =====================================================

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  const { id } = await context.params;
  if (!UUID_REGEX.test(id)) {
    return validationErrorResponse(
      "ID de usuario inválido (se esperaba un UUID)"
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);

    // 1) Cargar usuario
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select(
        "id, email, name, phone, is_admin, is_photographer, studio_name, created_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (userErr) {
      console.error("Error cargando user:", userErr);
      return errorResponse("Error al cargar usuario", 500);
    }
    if (!userRow) {
      return notFoundResponse("Usuario no encontrado");
    }
    const u = userRow as {
      id: string;
      email: string;
      name: string | null;
      phone: string | null;
      is_admin: boolean;
      is_photographer: boolean;
      studio_name: string | null;
      created_at: string;
    };

    // 2) Cargar el resto en paralelo
    const [
      reservationsRes,
      loyaltyRes,
      creditsRes,
      outgoingRes,
      incomingRes,
    ] = await Promise.all([
      supabase
        .from("reservations")
        .select(
          "id, date, start_time, end_time, status, price, original_price, reschedule_count, payment_method, payment_status, loyalty_discount, loyalty_points_used, credits_used, referral_discount, last_minute_discount, discount_code, discount_code_discount, photographer_studio, session_type"
        )
        .eq("user_id", id)
        .order("date", { ascending: false })
        .limit(2000),
      supabase
        .from("loyalty_points")
        .select(
          "id, points, reservation_id, used, revoked, revoked_at, created_at"
        )
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("credits")
        .select(
          "id, amount, source, reservation_id, used, revoked, revoked_at, expires_at, created_at"
        )
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("benefit_transfers")
        .select(
          "id, reservation_id, from_user_id, from_email, to_user_id, to_email, to_studio_name, status, transferred_points, created_at, materialized_at, claimed_at, cancelled_at"
        )
        .eq("from_user_id", id)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("benefit_transfers")
        .select(
          "id, reservation_id, from_user_id, from_email, to_user_id, to_email, to_studio_name, status, transferred_points, created_at, materialized_at, claimed_at, cancelled_at"
        )
        .eq("to_user_id", id)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    if (reservationsRes.error) {
      console.error("Error cargando reservations:", reservationsRes.error);
      return errorResponse("Error al cargar reservas", 500);
    }
    // IMPORTANTE: si fallan loyalty/credits/transfers, NO seguimos con datos parciales.
    // Mostrar 0 cuando hay error real produciría saldos engañosos al admin.
    if (loyaltyRes.error) {
      console.error("Error cargando loyalty_points:", loyaltyRes.error);
      return errorResponse("Error al cargar Monedas Chuy", 500);
    }
    if (creditsRes.error) {
      console.error("Error cargando credits:", creditsRes.error);
      return errorResponse("Error al cargar créditos", 500);
    }
    if (outgoingRes.error) {
      console.error("Error cargando outgoing transfers:", outgoingRes.error);
      return errorResponse("Error al cargar transferencias salientes", 500);
    }
    if (incomingRes.error) {
      console.error("Error cargando incoming transfers:", incomingRes.error);
      return errorResponse("Error al cargar transferencias entrantes", 500);
    }

    // Mapear reservas
    const reservations: CustomerReservationLite[] = (
      (reservationsRes.data || []) as Array<{
        id: number;
        date: string;
        start_time: string;
        end_time: string;
        status: "confirmed" | "cancelled" | "completed";
        price: number;
        original_price: number;
        reschedule_count: number;
        payment_method: string | null;
        payment_status: "pending" | "paid" | "not_applicable" | null;
        loyalty_discount: number | null;
        loyalty_points_used: number | null;
        credits_used: number | null;
        referral_discount: number | null;
        last_minute_discount: number | null;
        discount_code: string | null;
        discount_code_discount: number | null;
        photographer_studio: string | null;
        session_type: "xv_anos" | "boda" | "casual" | null;
      }>
    ).map((r) => ({
      id: r.id,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      price: Number(r.price) || 0,
      originalPrice: Number(r.original_price) || 0,
      rescheduleCount: r.reschedule_count || 0,
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      loyaltyDiscount: Number(r.loyalty_discount) || 0,
      loyaltyPointsUsed: Number(r.loyalty_points_used) || 0,
      creditsUsed: Number(r.credits_used) || 0,
      referralDiscount: Number(r.referral_discount) || 0,
      lastMinuteDiscount: Number(r.last_minute_discount) || 0,
      discountCode: r.discount_code,
      discountCodeDiscount: Number(r.discount_code_discount) || 0,
      photographerStudio: r.photographer_studio,
      sessionType: r.session_type,
    }));

    // Las Monedas Chuy no caducan: solo se clasifican por estado.
    const classifyLoyalty = (row: {
      used?: boolean | null;
      revoked?: boolean | null;
    }): LoyaltyMovementType => {
      if (row.revoked) return "revoked";
      if (row.used) return "used";
      return "earned";
    };

    // Los créditos SÍ caducan: política intacta.
    const classifyCredit = (row: {
      used?: boolean | null;
      revoked?: boolean | null;
      expires_at: string;
    }): CreditMovementType => {
      if (row.revoked) return "revoked";
      if (row.used) return "used";
      if (row.expires_at < today) return "expired";
      return "earned";
    };

    const loyaltyMovements: LoyaltyMovement[] = (
      (loyaltyRes.data || []) as Array<{
        id: string;
        points: number;
        reservation_id: number | null;
        used: boolean | null;
        revoked: boolean | null;
        revoked_at: string | null;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      type: classifyLoyalty(r),
      points: r.points,
      reservationId: r.reservation_id,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    }));

    const creditMovements: CreditMovement[] = (
      (creditsRes.data || []) as Array<{
        id: string;
        amount: number;
        source: string;
        reservation_id: number | null;
        used: boolean | null;
        revoked: boolean | null;
        revoked_at: string | null;
        expires_at: string;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      type: classifyCredit(r),
      amount: Number(r.amount) || 0,
      source: r.source,
      reservationId: r.reservation_id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
    }));

    type RawTransfer = {
      id: string;
      reservation_id: number;
      from_user_id: string | null;
      from_email: string;
      to_user_id: string | null;
      to_email: string;
      to_studio_name: string | null;
      status:
        | "pending"
        | "cancelled"
        | "auto_credited"
        | "pending_claim"
        | "claimed"
        | "reverted";
      transferred_points: number;
      created_at: string;
      materialized_at: string | null;
      claimed_at: string | null;
      cancelled_at: string | null;
    };

    // Mapa rápido de fecha de cada reserva mencionada en transferencias
    const reservationDateMap = new Map<
      number,
      { date: string; startTime: string }
    >();
    for (const r of reservations) {
      reservationDateMap.set(r.id, { date: r.date, startTime: r.startTime });
    }
    // Si la transferencia entrante apunta a una reserva que NO está en este usuario,
    // hacemos un lookup rápido para no perder info en el detalle.
    const allTransferReservationIds = new Set<number>();
    for (const t of (outgoingRes.data || []) as RawTransfer[]) {
      if (!reservationDateMap.has(t.reservation_id))
        allTransferReservationIds.add(t.reservation_id);
    }
    for (const t of (incomingRes.data || []) as RawTransfer[]) {
      if (!reservationDateMap.has(t.reservation_id))
        allTransferReservationIds.add(t.reservation_id);
    }
    if (allTransferReservationIds.size > 0) {
      const { data: extraReservs } = await supabase
        .from("reservations")
        .select("id, date, start_time")
        .in("id", Array.from(allTransferReservationIds));
      for (const r of (extraReservs || []) as Array<{
        id: number;
        date: string;
        start_time: string;
      }>) {
        reservationDateMap.set(r.id, {
          date: r.date,
          startTime: r.start_time,
        });
      }
    }

    const mapTransfer = (t: RawTransfer): CustomerTransferLite => {
      const meta = reservationDateMap.get(t.reservation_id);
      return {
        id: t.id,
        reservationId: t.reservation_id,
        reservationDate: meta?.date || null,
        reservationStartTime: meta?.startTime || null,
        fromEmail: t.from_email,
        fromUserId: t.from_user_id,
        toEmail: t.to_email,
        toUserId: t.to_user_id,
        toStudioName: t.to_studio_name,
        status: t.status,
        transferredPoints: Number(t.transferred_points) || 0,
        createdAt: t.created_at,
        materializedAt: t.materialized_at,
        claimedAt: t.claimed_at,
        cancelledAt: t.cancelled_at,
      };
    };

    const outgoingTransfers = ((outgoingRes.data || []) as RawTransfer[]).map(
      mapTransfer
    );
    const incomingTransfers = ((incomingRes.data || []) as RawTransfer[]).map(
      mapTransfer
    );

    // Resumen
    const confirmedReservations = reservations.filter(
      (r) => r.status === "confirmed" || r.status === "completed"
    );
    const reservationCount = confirmedReservations.length;
    const totalSpent = confirmedReservations.reduce(
      (s, r) => s + (Number(r.price) || 0),
      0
    );
    const loyaltyPointsAvailable = loyaltyMovements
      .filter((m) => m.type === "earned")
      .reduce((s, m) => s + m.points, 0);
    const creditsAvailable = creditMovements
      .filter((m) => m.type === "earned")
      .reduce((s, m) => s + m.amount, 0);
    const receivedSessionsCount = incomingTransfers.filter(
      (t) => t.status === "auto_credited" || t.status === "claimed"
    ).length;
    // YYYY-MM-DD permite comparación lexicográfica directa, así evitamos sort O(n log n).
    let lastReservationDate: string | null = null;
    for (const r of reservations) {
      if (!lastReservationDate || r.date > lastReservationDate) {
        lastReservationDate = r.date;
      }
    }

    // Chequeos de consistencia
    const issues: string[] = [];
    // 1) Si una reserva confirmada/completada usó puntos, debería existir un loyalty_points
    //    con `used=true` y `reservation_id` apuntando a esa reserva.
    for (const r of confirmedReservations) {
      if (r.loyaltyPointsUsed > 0) {
        const used = loyaltyMovements
          .filter((m) => m.type === "used" && m.reservationId === r.id)
          .reduce((s, m) => s + m.points, 0);
        if (used !== r.loyaltyPointsUsed) {
          issues.push(
            `Reserva #${r.id}: la reserva indica ${r.loyaltyPointsUsed} Monedas Chuy usadas pero los movimientos suman ${used}.`
          );
        }
      }
    }
    // 2) Si una reserva está cancelada y otorgó puntos, deberían estar revocados.
    const cancelledReservationIds = new Set(
      reservations.filter((r) => r.status === "cancelled").map((r) => r.id)
    );
    for (const m of loyaltyMovements) {
      if (
        m.reservationId &&
        cancelledReservationIds.has(m.reservationId) &&
        m.type === "earned"
      ) {
        issues.push(
          `Monedas Chuy vigentes asociadas a reserva cancelada #${m.reservationId}: deberían estar revocadas.`
        );
      }
    }

    // Inferimos el tipo del literal para que satisfaga el constraint
    // `Record<string, unknown>` de successResponse (un interface explícito
    // tipado no lo hace estructuralmente).
    return successResponse({
      profile: {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        isPhotographer: !!u.is_photographer,
        studioName: u.studio_name,
        isAdmin: !!u.is_admin,
        createdAt: u.created_at,
      },
      summary: {
        reservationCount,
        totalSpent,
        loyaltyLevel: calculateLoyaltyLevel(reservationCount),
        loyaltyPointsAvailable,
        creditsAvailable,
        receivedSessionsCount,
        lastReservationDate,
      },
      reservations,
      loyaltyMovements,
      creditMovements,
      outgoingTransfers,
      incomingTransfers,
      consistency: {
        ok: issues.length === 0,
        issues,
      },
    } satisfies CustomerDetailResponse);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar detalle";
    console.error("Error inesperado en /api/admin/customers/[id]:", error);
    return errorResponse(errorMessage, 500);
  }
}
