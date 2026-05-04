import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
  conflictResponse,
  forbiddenResponse,
} from "@/utils/api-response";
import { verifyGuestToken } from "@/lib/auth/guest-tokens";
import { requireAdmin } from "@/lib/auth/admin";
import { getMonterreyToday } from "@/utils/business-days";
import { parse, startOfDay, isBefore } from "date-fns";
import type { Database } from "@/types/database.types";
import {
  revokeLoyaltyForTransfer,
  restoreLoyaltyForTransfer,
} from "@/utils/transfer-materialization";

// =====================================================
// /api/reservations/[id]/transfer-monedas
// =====================================================
// Permite al cliente regalarle las Monedas Chuy ganadas
// por una reserva al fotógrafo/estudio que lo trajo.
// La transferencia se materializa después de que pasa la
// fecha de la sesión (ver /api/cron/materialize-transfers).
//
// Solo Monedas Chuy son transferibles. Los créditos NO.
// =====================================================

interface ReservationRow {
  id: number;
  user_id: string | null;
  status: string;
  date: string;
  email: string | null;
  name: string | null;
}

type AuthOk = {
  ok: true;
  fromUserId: string;
  via: "user" | "guest" | "admin";
};
type AuthErr = { ok: false; response: ReturnType<typeof errorResponse> };

/**
 * Resuelve la autorización para operar la transferencia de una reserva.
 * Acepta:
 *   - usuario logueado dueño de la reserva (auth.uid === reservation.user_id)
 *   - admin (con sesión válida)
 *   - token JWT de invitado (en body) cuyo email coincide con el de la reserva
 *
 * IMPORTANTE: la reserva debe tener user_id (las reservas sin user_id no
 * acreditan Monedas, así que no hay nada que regalar).
 */
async function authorize(
  reservation: ReservationRow,
  guestToken: string | undefined,
): Promise<AuthOk | AuthErr> {
  if (!reservation.user_id) {
    return {
      ok: false,
      response: errorResponse(
        "Esta reserva no acumuló Monedas Chuy porque se hizo como invitado.",
        400,
      ),
    };
  }

  // 1) Sesión activa (dueño o admin)
  const cookieStore = await cookies();
  const authClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (user?.id) {
    if (user.id === reservation.user_id) {
      return { ok: true, fromUserId: reservation.user_id, via: "user" };
    }
    const adminCheck = await requireAdmin();
    if (adminCheck.isAdmin) {
      return { ok: true, fromUserId: reservation.user_id, via: "admin" };
    }
    return {
      ok: false,
      response: forbiddenResponse(
        "No tienes permisos para gestionar las Monedas Chuy de esta reserva.",
      ),
    };
  }

  // 2) Token de invitado
  if (guestToken) {
    const tokenResult = await verifyGuestToken(guestToken);
    if (!tokenResult.valid || !tokenResult.payload) {
      return {
        ok: false,
        response: unauthorizedResponse(
          tokenResult.error || "Token inválido o expirado",
        ),
      };
    }
    const tokenEmail = (tokenResult.payload.email || "").toLowerCase().trim();
    const reservationEmail = (reservation.email || "").toLowerCase().trim();
    if (
      tokenEmail !== reservationEmail ||
      tokenResult.payload.reservationId !== String(reservation.id)
    ) {
      return {
        ok: false,
        response: forbiddenResponse(
          "El token no corresponde a esta reserva.",
        ),
      };
    }
    return { ok: true, fromUserId: reservation.user_id, via: "guest" };
  }

  return {
    ok: false,
    response: unauthorizedResponse(
      "Inicia sesión o proporciona un token de gestión de la reserva.",
    ),
  };
}

/**
 * Calcula cuántas Monedas Chuy quedan disponibles para regalar en una reserva.
 * Suma las filas de loyalty_points con reservation_id == reservationId, no
 * revocadas y no usadas (las consumidas para pagar otra reserva no se cuentan).
 */
async function getEarnedPointsForReservation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  reservationId: number,
): Promise<{ ok: true; points: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("loyalty_points")
    .select("points, used, revoked")
    .eq("reservation_id", reservationId);
  if (error) {
    console.error("Error consultando puntos de la reserva:", error);
    return { ok: false, error: "No se pudo verificar las Monedas Chuy" };
  }
  type Row = { points: number | null; used: boolean | null; revoked: boolean | null };
  const rows = (data as Row[] | null) || [];
  // Solo cuentan las Monedas otorgadas por esta reserva (used=false, revoked=false).
  // Las que tengan used=true son fragmentos de "consumo" creados al gastar Monedas
  // de otra reserva (ver /api/reservations/create) y no se transfieren.
  const earned = rows
    .filter((r) => r.revoked !== true && r.used !== true)
    .reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  return { ok: true, points: Math.max(0, Math.floor(earned)) };
}

async function loadReservation(
  reservationId: number,
): Promise<{ supabase: ReturnType<typeof createServiceRoleClient>; reservation: ReservationRow } | { error: ReturnType<typeof errorResponse> }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, user_id, status, date, email, name")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) {
    console.error("Error cargando reserva:", error);
    return { error: errorResponse("Error al cargar la reserva", 500) };
  }
  if (!data) {
    return { error: notFoundResponse("Reserva") };
  }
  return { supabase, reservation: data as ReservationRow };
}

function parseReservationId(rawId: string): number | null {
  const n = parseInt(rawId, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// =====================================================
// GET: estado actual de la transferencia (si hay)
// =====================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const reservationId = parseReservationId(rawId);
    if (reservationId === null) {
      return validationErrorResponse("ID de reserva inválido");
    }

    const guestToken = request.nextUrl.searchParams.get("token") || undefined;

    const loaded = await loadReservation(reservationId);
    if ("error" in loaded) return loaded.error;
    const { supabase, reservation } = loaded;

    const auth = await authorize(reservation, guestToken);
    if (!auth.ok) return auth.response;

    const [{ data: transfers, error: transfersError }, earnedRes] =
      await Promise.all([
        supabase
          .from("benefit_transfers")
          .select(
            "id, status, transferred_points, to_email, to_studio_name, created_at, materialized_at, claimed_at, cancelled_at, reverted_at",
          )
          .eq("reservation_id", reservationId)
          .order("created_at", { ascending: false }),
        getEarnedPointsForReservation(supabase, reservationId),
      ]);

    if (transfersError) {
      console.error("Error cargando transferencias:", transfersError);
      return errorResponse("Error al cargar transferencias", 500);
    }
    if (!earnedRes.ok) {
      return errorResponse(earnedRes.error, 500);
    }

    type Row = {
      id: string;
      status: string;
      transferred_points: number | null;
      to_email: string;
      to_studio_name: string | null;
      created_at: string;
      materialized_at: string | null;
      claimed_at: string | null;
      cancelled_at: string | null;
      reverted_at: string | null;
    };
    const rows = (transfers as Row[] | null) || [];
    // La activa es cualquiera que no esté en estado terminal (cancelled/reverted)
    const active = rows.find(
      (r) => r.status !== "cancelled" && r.status !== "reverted",
    );

    return successResponse({
      earnedPoints: earnedRes.points,
      activeTransfer: active
        ? {
            id: active.id,
            status: active.status,
            transferredPoints: active.transferred_points || 0,
            toEmail: active.to_email,
            toStudioName: active.to_studio_name,
            createdAt: active.created_at,
            materializedAt: active.materialized_at,
            claimedAt: active.claimed_at,
          }
        : null,
      history: rows.map((r) => ({
        id: r.id,
        status: r.status,
        transferredPoints: r.transferred_points || 0,
        toEmail: r.to_email,
        toStudioName: r.to_studio_name,
        createdAt: r.created_at,
        materializedAt: r.materialized_at,
        claimedAt: r.claimed_at,
        cancelledAt: r.cancelled_at,
        revertedAt: r.reverted_at,
      })),
    });
  } catch (err) {
    console.error("Error inesperado en GET transfer-monedas:", err);
    return errorResponse("Error inesperado", 500);
  }
}

// =====================================================
// POST: crear transferencia pending
// =====================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const reservationId = parseReservationId(rawId);
    if (reservationId === null) {
      return validationErrorResponse("ID de reserva inválido");
    }

    const body = (await request.json().catch(() => ({}))) as {
      to_email?: unknown;
      to_studio_name?: unknown;
      token?: unknown;
    };

    const toEmailRaw = typeof body.to_email === "string" ? body.to_email : "";
    const toEmail = toEmailRaw.toLowerCase().trim();
    if (!toEmail) {
      return validationErrorResponse(
        "Falta el correo del fotógrafo o estudio.",
      );
    }
    // RFC simplificado: validación liviana suficiente para emails normales
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail) || toEmail.length > 254) {
      return validationErrorResponse("El correo no parece válido.");
    }

    const toStudioRaw =
      typeof body.to_studio_name === "string" ? body.to_studio_name : null;
    const toStudio = toStudioRaw
      ? toStudioRaw.trim().slice(0, 200) || null
      : null;

    const guestToken = typeof body.token === "string" ? body.token : undefined;

    const loaded = await loadReservation(reservationId);
    if ("error" in loaded) return loaded.error;
    const { supabase, reservation } = loaded;

    const auth = await authorize(reservation, guestToken);
    if (!auth.ok) return auth.response;

    // Solo el cliente (o invitado con token) puede crear transferencias;
    // el staff usa la vista de solo lectura en la UI.
    if (auth.via === "admin") {
      return forbiddenResponse(
        "Los administradores no pueden crear transferencias de Monedas Chuy desde esta API.",
      );
    }

    // Validaciones de la reserva
    if (reservation.status !== "confirmed") {
      return errorResponse(
        "Solo puedes regalar Monedas Chuy de reservas confirmadas.",
        400,
      );
    }
    // Fecha de sesión debe ser FUTURA (>= hoy en zona Monterrey).
    // Una vez que pasa la sesión, el cron las materializa o quedan con el cliente.
    const today = getMonterreyToday();
    const reservationDate = startOfDay(
      parse(reservation.date, "yyyy-MM-dd", new Date()),
    );
    if (isBefore(reservationDate, today)) {
      return errorResponse(
        "Ya pasó la fecha de la sesión. Esta reserva ya no puede regalar Monedas Chuy.",
        400,
      );
    }

    // La reserva debe tener email registrado (NOT NULL en benefit_transfers.from_email).
    // Defensa: en producción siempre lo tienen, pero por consistencia.
    const fromEmail = (reservation.email || "").toLowerCase().trim();
    if (!fromEmail) {
      return errorResponse(
        "La reserva no tiene correo registrado. Contacta a soporte.",
        400,
      );
    }

    // El email del fotógrafo no puede ser el del propio cliente
    if (toEmail === fromEmail) {
      return validationErrorResponse(
        "No puedes regalarte Monedas Chuy a ti mismo.",
      );
    }

    // Verificar que no haya una transferencia activa antes de revocar
    // (evita revocar por nada si ya hay una y luego chocar con el unique).
    const { data: existing, error: existingError } = await supabase
      .from("benefit_transfers")
      .select("id, status")
      .eq("reservation_id", reservationId)
      .in("status", [
        "pending",
        "auto_credited",
        "pending_claim",
        "claimed",
      ]);
    if (existingError) {
      console.error("Error verificando transferencias previas:", existingError);
      return errorResponse("Error al verificar transferencias previas", 500);
    }
    if (existing && existing.length > 0) {
      return conflictResponse(
        "Ya regalaste las Monedas Chuy de esta reserva.",
      );
    }

    // Earmark: revocamos atómicamente las Monedas del cliente (sólo
    // las ganadas por ESTA reserva, used=false, revoked=false). Así
    // dejan de aparecer en su saldo y no las puede gastar en otra
    // reserva mientras espera la fecha de la sesión. Si todo falla
    // después de esto, restauramos las filas para no dejar al cliente
    // sin sus Monedas.
    const nowIso = new Date().toISOString();
    const revokeRes = await revokeLoyaltyForTransfer(
      supabase,
      reservationId,
      auth.fromUserId,
      nowIso,
    );
    if (!revokeRes.ok) {
      console.error(
        "Error revocando Monedas para transferencia:",
        revokeRes.error,
      );
      return errorResponse(
        "No se pudo reservar las Monedas Chuy. Intenta de nuevo.",
        500,
      );
    }
    if (revokeRes.totalPoints <= 0) {
      return errorResponse(
        "Esta reserva no tiene Monedas Chuy disponibles para regalar.",
        400,
      );
    }

    // Insert de la transferencia. Si falla, restauramos las filas.
    const { data: inserted, error: insertError } = await supabase
      .from("benefit_transfers")
      .insert({
        reservation_id: reservationId,
        from_user_id: auth.fromUserId,
        from_email: fromEmail,
        to_email: toEmail,
        to_studio_name: toStudio,
        status: "pending",
        transferred_points: revokeRes.totalPoints,
        revoked_loyalty_point_ids: revokeRes.revokedIds,
      } as never)
      .select(
        "id, status, transferred_points, to_email, to_studio_name, created_at",
      )
      .single();

    if (insertError) {
      console.error("Error creando transferencia:", insertError);
      // Rollback: restauramos las Monedas del cliente.
      const restored = await restoreLoyaltyForTransfer(
        supabase,
        revokeRes.revokedIds,
      );
      if (!restored.ok) {
        console.error(
          "[CRÍTICO] No se pudieron restaurar las Monedas tras fallo de insert:",
          restored.error,
          "ids:",
          revokeRes.revokedIds,
        );
      }
      // 23505 = unique violation (índice idx_benefit_transfers_unique_pending)
      if (insertError.code === "23505") {
        return conflictResponse(
          "Ya regalaste las Monedas Chuy de esta reserva.",
        );
      }
      return errorResponse("No se pudo crear la transferencia.", 500);
    }

    type InsertedRow = {
      id: string;
      status: string;
      transferred_points: number;
      to_email: string;
      to_studio_name: string | null;
      created_at: string;
    };
    const row = inserted as InsertedRow;

    return successResponse(
      {
        transfer: {
          id: row.id,
          status: row.status,
          transferredPoints: row.transferred_points,
          toEmail: row.to_email,
          toStudioName: row.to_studio_name,
          createdAt: row.created_at,
        },
      },
      201,
    );
  } catch (err) {
    console.error("Error inesperado en POST transfer-monedas:", err);
    return errorResponse("Error inesperado", 500);
  }
}

// =====================================================
// DELETE: cancelar transferencia pending
// =====================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const reservationId = parseReservationId(rawId);
    if (reservationId === null) {
      return validationErrorResponse("ID de reserva inválido");
    }

    // Token puede venir en query (DELETE no debería tener body en algunos clientes)
    const tokenFromQuery = request.nextUrl.searchParams.get("token");
    let guestToken = tokenFromQuery || undefined;
    if (!guestToken) {
      const body = (await request.json().catch(() => ({}))) as {
        token?: unknown;
      };
      if (typeof body.token === "string") guestToken = body.token;
    }

    const loaded = await loadReservation(reservationId);
    if ("error" in loaded) return loaded.error;
    const { supabase, reservation } = loaded;

    const auth = await authorize(reservation, guestToken);
    if (!auth.ok) return auth.response;

    if (auth.via === "admin") {
      return forbiddenResponse(
        "Los administradores no pueden cancelar transferencias de Monedas Chuy desde esta API.",
      );
    }

    // Cancelación atómica del pending: si ganamos el lock (status era
    // 'pending' al momento del UPDATE) restauramos las Monedas. Si el
    // cron ya materializó (status != 'pending'), no toca nada y
    // respondemos 404 para que el cliente recargue.
    const { data: cancelledRows, error: updateError } = await supabase
      .from("benefit_transfers")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      } as never)
      .eq("reservation_id", reservationId)
      .eq("status", "pending")
      .select("id, revoked_loyalty_point_ids");

    if (updateError) {
      console.error("Error cancelando transferencia:", updateError);
      return errorResponse("No se pudo cancelar la transferencia.", 500);
    }

    const cancelled = (cancelledRows as
      | { id: string; revoked_loyalty_point_ids: string[] | null }[]
      | null) || [];

    if (cancelled.length === 0) {
      return notFoundResponse("Transferencia pendiente");
    }

    // Restauramos las Monedas del cliente (devolución exacta de las
    // filas que se revocaron al crear el pending).
    const ids = cancelled[0].revoked_loyalty_point_ids || [];
    const restored = await restoreLoyaltyForTransfer(supabase, ids);
    if (!restored.ok) {
      console.error(
        "[CRÍTICO] No se pudieron restaurar las Monedas tras cancelar transferencia:",
        restored.error,
        "ids:",
        ids,
      );
      // Aun así devolvemos éxito en la cancelación: la fila ya está
      // 'cancelled'. El cliente puede contactar soporte para reclamar.
      return successResponse({
        message:
          "Transferencia cancelada, pero hubo un problema restaurando tus Monedas. Contacta a soporte.",
      });
    }

    return successResponse({ message: "Transferencia cancelada" });
  } catch (err) {
    console.error("Error inesperado en DELETE transfer-monedas:", err);
    return errorResponse("Error inesperado", 500);
  }
}
