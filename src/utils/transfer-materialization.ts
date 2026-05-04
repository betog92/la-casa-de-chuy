import { createServiceRoleClient } from "@/lib/supabase/server";

// =====================================================
// Helpers de transferencias de Monedas Chuy
// =====================================================
// Modelo "earmark al crear pending":
//
//   POST /transfer-monedas
//     - Revoca atómicamente las loyalty_points del cliente
//       para esa reserva y guarda sus IDs en
//       benefit_transfers.revoked_loyalty_point_ids.
//     - El cliente deja de ver esas Monedas en su saldo
//       inmediatamente, así que no las puede gastar en otra
//       reserva mientras espera la fecha de la sesión.
//
//   DELETE /transfer-monedas (cancela pending)
//     - Restaura exactamente esas filas (revoked=false).
//
//   Cron / Claim (materialización)
//     - Como las Monedas YA están revocadas, solo cambia el
//       status y acredita al fotógrafo. Ya no recalcula ni
//       toca loyalty_points del cliente.
// =====================================================

type SupabaseAdmin = ReturnType<typeof createServiceRoleClient>;

interface RevokedRow {
  id: string;
  points: number;
}

/**
 * Revoca atómicamente las Monedas Chuy ganadas por el cliente en una
 * reserva (used=false, revoked=false) y devuelve los IDs revocados +
 * la suma de puntos. Llamado por POST /transfer-monedas para
 * "reservar" las Monedas a nombre del fotógrafo.
 *
 * Importante: solo revoca filas con user_id=fromUserId y la reserva
 * dada. No toca filas "used=true" (que son consumos contra otras
 * reservas) ni filas ya revocadas.
 */
export async function revokeLoyaltyForTransfer(
  supabase: SupabaseAdmin,
  reservationId: number,
  fromUserId: string,
  nowIso: string,
): Promise<
  | { ok: true; revokedIds: string[]; totalPoints: number }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("loyalty_points")
    .update({
      revoked: true,
      revoked_at: nowIso,
    } as never)
    .eq("reservation_id", reservationId)
    .eq("user_id", fromUserId)
    .eq("revoked", false)
    .eq("used", false)
    .select("id, points");

  if (error) return { ok: false, error: error.message };

  const rows = (data as RevokedRow[] | null) || [];
  const totalPoints = rows.reduce(
    (sum, r) => sum + (Number(r.points) || 0),
    0,
  );
  return {
    ok: true,
    revokedIds: rows.map((r) => r.id),
    totalPoints: Math.max(0, Math.floor(totalPoints)),
  };
}

/**
 * Restaura filas de loyalty_points previamente revocadas por el flujo
 * de transferencia (revoked=false, revoked_at=null). Llamado por
 * DELETE /transfer-monedas cuando el cliente cancela el pending.
 *
 * No filtra por estado actual: si las filas ya están revocadas por
 * otro motivo (p.ej. cancelación de la reserva en paralelo), las
 * "des-revocaría". Por eso el caller debe asegurarse de invocar este
 * helper solo cuando ganó el lock atómico del UPDATE pending→cancelled.
 */
export async function restoreLoyaltyForTransfer(
  supabase: SupabaseAdmin,
  ids: readonly string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!ids || ids.length === 0) return { ok: true };
  const { error } = await supabase
    .from("loyalty_points")
    .update({
      revoked: false,
      revoked_at: null,
    } as never)
    .in("id", ids as string[]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface MaterializeTransferInput {
  /** Service role client (bypassa RLS). */
  supabase: SupabaseAdmin;
  /** ID de la transferencia (PK uuid de benefit_transfers). */
  transferId: string;
  /** Usuario destinatario (fotógrafo) ya logueado/encontrado. */
  toUserId: string;
  /** Puntos a acreditar (snapshot guardado al crear el pending). */
  pointsToCredit: number;
  /**
   * Estado al que queremos llevar la transferencia:
   *   - "auto_credited" cuando lo dispara el cron.
   *   - "claimed" cuando lo dispara el magic link.
   */
  targetStatus: "auto_credited" | "claimed";
  /** Estado origen requerido (típicamente "pending" o "pending_claim"). */
  fromStatus: "pending" | "pending_claim";
}

export interface MaterializeTransferOk {
  ok: true;
  /** Puntos realmente acreditados al fotógrafo. */
  pointsTransferred: number;
}

export interface MaterializeTransferErr {
  ok: false;
  /**
   * Tipos de fallo:
   *   - "race": otra ejecución ya tomó la transferencia (status cambió).
   *   - "no_points": el snapshot de puntos era 0 — la transferencia se
   *     marca como "reverted".
   *   - "error": fallo técnico (db, etc).
   */
  reason: "race" | "no_points" | "error";
  error?: string;
}

/**
 * Materializa una transferencia: cambia el status atómicamente y
 * acredita al fotógrafo con el snapshot ya pre-revocado.
 *
 * Como las Monedas del cliente fueron revocadas al crear el pending,
 * aquí ya no se tocan: solo se inserta una nueva fila a nombre del
 * fotógrafo (expires_at=NULL, no caduca).
 *
 * Flujo (con rollback):
 *   1. UPDATE benefit_transfers a targetStatus (atómico, eq fromStatus).
 *      Si no toma 1 fila → otra request ganó la carrera → race.
 *   2. INSERT loyalty_points para el fotógrafo.
 *      Si falla: revertir transfer a fromStatus (las Monedas del
 *      cliente siguen revocadas, así que no hay desbalance).
 *
 * IMPORTANTE: el caller debe llamar este helper SOLO después de
 * verificar que la reserva está en estado válido (confirmed/completed)
 * y que la fecha de la sesión ya pasó (en el cron).
 */
export async function materializeTransfer(
  input: MaterializeTransferInput,
): Promise<MaterializeTransferOk | MaterializeTransferErr> {
  const {
    supabase,
    transferId,
    toUserId,
    pointsToCredit,
    targetStatus,
    fromStatus,
  } = input;

  // Defensa: snapshot vacío → marcamos reverted sin acreditar.
  if (!Number.isFinite(pointsToCredit) || pointsToCredit <= 0) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("benefit_transfers")
      .update({
        status: "reverted",
        reverted_at: nowIso,
        transferred_points: 0,
      } as never)
      .eq("id", transferId)
      .eq("status", fromStatus);
    return { ok: false, reason: "no_points" };
  }

  const realPoints = Math.floor(pointsToCredit);
  const nowIso = new Date().toISOString();

  // 1. Update atómico de la transferencia (claim del lock).
  const { data: claimedRows, error: updateError } = await supabase
    .from("benefit_transfers")
    .update({
      status: targetStatus,
      to_user_id: toUserId,
      ...(targetStatus === "auto_credited"
        ? { materialized_at: nowIso }
        : { claimed_at: nowIso }),
    } as never)
    .eq("id", transferId)
    .eq("status", fromStatus)
    .select("id");

  if (updateError) {
    return { ok: false, reason: "error", error: updateError.message };
  }
  if (!claimedRows || (claimedRows as { id: string }[]).length === 0) {
    return { ok: false, reason: "race" };
  }

  // 2. Acreditar al fotógrafo (NO caduca).
  const { error: creditError } = await supabase
    .from("loyalty_points")
    .insert({
      user_id: toUserId,
      points: realPoints,
      expires_at: null,
      reservation_id: null,
      used: false,
      revoked: false,
    } as never);

  if (creditError) {
    // Revertir el status: las Monedas del cliente siguen revocadas
    // (earmark del pending), así que la transferencia puede reintentarse.
    const { error: revertStatusError } = await supabase
      .from("benefit_transfers")
      .update({
        status: fromStatus,
        to_user_id: null,
        materialized_at: null,
        claimed_at: null,
      } as never)
      .eq("id", transferId)
      .eq("status", targetStatus);
    if (revertStatusError) {
      console.error(
        "[CRÍTICO] No se pudo revertir status tras fallo de crédito:",
        revertStatusError,
        "transferId:",
        transferId,
      );
    }
    return { ok: false, reason: "error", error: creditError.message };
  }

  return { ok: true, pointsTransferred: realPoints };
}
