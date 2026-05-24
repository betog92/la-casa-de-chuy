import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TIER_ELIGIBLE_RESERVATION_STATUSES } from "@/lib/reservations/session-lifecycle";

type LoyaltySupabase = SupabaseClient<Database>;

const RESERVATION_ID_CHUNK = 500;

export type LoyaltyTierEarnedRow = {
  user_id: string | null;
  reservation_id: number | null;
};

export type ConfirmedReservationOwner = {
  id: number;
  user_id: string | null;
};

async function countConfirmedReservationsForUser(
  supabase: LoyaltySupabase,
  userId: string,
  reservationIds: number[],
): Promise<number> {
  if (reservationIds.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < reservationIds.length; i += RESERVATION_ID_CHUNK) {
    const chunk = reservationIds.slice(i, i + RESERVATION_ID_CHUNK);
    const { count, error } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .in("id", chunk)
      .eq("user_id", userId)
      .in("status", [...TIER_ELIGIBLE_RESERVATION_STATUSES]);

    if (error) {
      console.error(
        "[countLoyaltyTierReservations] reservations chunk:",
        error,
      );
      continue;
    }
    total += count ?? 0;
  }
  return total;
}

/**
 * Cuenta reservas confirmadas que alguna vez otorgaron Monedas Chuy al pagar con cuenta.
 * No incluye reservas invitado vinculadas sin loyalty_points.
 * Regalar/transferir monedas revoca el saldo pero no resta progreso de nivel.
 * Incluye `completed` (sesión ya pasada). Cancelaciones quedan fuera.
 */
export async function countLoyaltyTierReservations(
  supabase: LoyaltySupabase,
  userId: string,
): Promise<number> {
  const { data: earnedRows, error: lpError } = await supabase
    .from("loyalty_points")
    .select("reservation_id")
    .eq("user_id", userId)
    .gt("points", 0)
    .not("reservation_id", "is", null);

  if (lpError) {
    console.error("[countLoyaltyTierReservations] loyalty_points:", lpError);
    return 0;
  }
  if (!earnedRows?.length) return 0;

  const rows = earnedRows as { reservation_id: number | null }[];
  const reservationIds = [
    ...new Set(
      rows
        .map((r) => r.reservation_id)
        .filter((id): id is number => id != null),
    ),
  ];
  if (reservationIds.length === 0) return 0;

  return countConfirmedReservationsForUser(
    supabase,
    userId,
    reservationIds,
  );
}

/**
 * Agrega conteos por usuario a partir de filas earned y reservas elegibles (confirmed/completed).
 * Verifica que `loyalty_points.user_id` coincida con el dueño de la reserva.
 */
export function aggregateLoyaltyTierCounts(
  earnedRows: LoyaltyTierEarnedRow[],
  confirmedReservations: Iterable<ConfirmedReservationOwner>,
): Map<string, number> {
  const ownerByReservationId = new Map<number, string>();
  for (const r of confirmedReservations) {
    if (r.user_id) ownerByReservationId.set(r.id, r.user_id);
  }

  const perUser = new Map<string, Set<number>>();

  for (const row of earnedRows) {
    const uid = row.user_id;
    const rid = row.reservation_id;
    if (!uid || rid == null) continue;
    const ownerId = ownerByReservationId.get(rid);
    if (!ownerId || ownerId !== uid) continue;
    let set = perUser.get(uid);
    if (!set) {
      set = new Set();
      perUser.set(uid, set);
    }
    set.add(rid);
  }

  const result = new Map<string, number>();
  for (const [uid, set] of perUser) {
    result.set(uid, set.size);
  }
  return result;
}

const USER_ID_CHUNK = 200;

/**
 * Mapa userId → número de reservas elegibles para nivel (batch).
 */
export async function buildLoyaltyTierCountMap(
  supabase: LoyaltySupabase,
  userIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) return result;

  const allEarned: LoyaltyTierEarnedRow[] = [];

  for (let i = 0; i < userIds.length; i += USER_ID_CHUNK) {
    const chunk = userIds.slice(i, i + USER_ID_CHUNK);
    const { data, error } = await supabase
      .from("loyalty_points")
      .select("user_id, reservation_id")
      .in("user_id", chunk)
      .gt("points", 0)
      .not("reservation_id", "is", null);

    if (error) {
      console.error("[buildLoyaltyTierCountMap] loyalty_points:", error);
      continue;
    }
    if (data?.length) {
      allEarned.push(...(data as LoyaltyTierEarnedRow[]));
    }
  }

  if (allEarned.length === 0) return result;

  const reservationIds = [
    ...new Set(
      allEarned
        .map((r) => r.reservation_id)
        .filter((id): id is number => id != null),
    ),
  ];
  if (reservationIds.length === 0) return result;

  const confirmedReservations: ConfirmedReservationOwner[] = [];
  for (let i = 0; i < reservationIds.length; i += RESERVATION_ID_CHUNK) {
    const idChunk = reservationIds.slice(i, i + RESERVATION_ID_CHUNK);
    const { data: resRows, error: resError } = await supabase
      .from("reservations")
      .select("id, user_id")
      .in("id", idChunk)
      .in("status", [...TIER_ELIGIBLE_RESERVATION_STATUSES]);

    if (resError) {
      console.error("[buildLoyaltyTierCountMap] reservations:", resError);
      continue;
    }
    for (const r of (resRows ?? []) as ConfirmedReservationOwner[]) {
      if (r.id != null) confirmedReservations.push(r);
    }
  }

  return aggregateLoyaltyTierCounts(allEarned, confirmedReservations);
}
