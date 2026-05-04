import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getMonterreyToday } from "@/utils/business-days";
import { format, parse, startOfDay, isBefore } from "date-fns";
import { randomUUID } from "node:crypto";
import { sendTransferReceived, sendTransferClaim } from "@/lib/email";
import { materializeTransfer } from "@/utils/transfer-materialization";
import { isCronSecretAuthorized } from "@/utils/cron-auth";

// =====================================================
// /api/cron/materialize-transfers
// =====================================================
// Horario en vercel.json: `0 14 * * *` (UTC) ≈ 08:00 America/Monterrey
// cuando México está en UTC−6 — “mañana” respecto al día de sesión
// alinea con getMonterreyToday() usado abajo.
//
// Cron job diario que materializa transferencias de Monedas Chuy
// cuya fecha de sesión ya pasó:
//
//   pending → auto_credited (si el to_email tiene cuenta) o
//             pending_claim (si no tiene cuenta; magic link)
//
// Acceso: Vercel Cron envía `Authorization: Bearer` + CRON_SECRET; en local
// puedes usar `x-cron-secret`; o admin con sesión.
// Idempotente: solo toca filas en status='pending'; ya tomadas pasan
// a auto_credited/pending_claim y no se reprocesan.
// =====================================================

interface PendingTransfer {
  id: string;
  reservation_id: number;
  from_user_id: string | null;
  from_email: string;
  to_email: string;
  to_studio_name: string | null;
  transferred_points: number | null;
}

interface ReservationLite {
  id: number;
  date: string;
  status: string;
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    // Auth: Vercel Cron (Bearer), x-cron-secret (local), o admin con sesión
    if (!isCronSecretAuthorized(request)) {
      const { isAdmin } = await requireAdmin();
      if (!isAdmin) {
        return unauthorizedResponse(
          "Solo accesible con cron secret o sesión de admin",
        );
      }
    }

    const supabase = createServiceRoleClient();
    const today = getMonterreyToday();
    const todayIso = format(today, "yyyy-MM-dd");

    // Cargar transferencias pending. Filtramos por fecha de la reserva ya pasada.
    // Necesitamos join con reservations para conocer la fecha y status.
    const { data: pendingRows, error: pendingError } = await supabase
      .from("benefit_transfers")
      .select(
        "id, reservation_id, from_user_id, from_email, to_email, to_studio_name, transferred_points",
      )
      .eq("status", "pending");
    if (pendingError) {
      console.error(
        "[cron materialize] Error cargando pendientes:",
        pendingError,
      );
      return errorResponse("Error al cargar transferencias pendientes", 500);
    }

    const pendings = (pendingRows as PendingTransfer[] | null) || [];
    if (pendings.length === 0) {
      return successResponse({
        message: "Sin transferencias pendientes",
        processed: 0,
        results: [],
      });
    }

    const reservationIds = Array.from(
      new Set(pendings.map((p) => p.reservation_id)),
    );

    const { data: reservationsRaw, error: reservationsError } = await supabase
      .from("reservations")
      .select("id, date, status")
      .in("id", reservationIds);
    if (reservationsError) {
      console.error(
        "[cron materialize] Error cargando reservas:",
        reservationsError,
      );
      return errorResponse("Error al cargar reservas asociadas", 500);
    }

    const reservationsById = new Map<number, ReservationLite>();
    for (const r of (reservationsRaw as ReservationLite[] | null) || []) {
      reservationsById.set(r.id, r);
    }

    type Result = {
      transferId: string;
      reservationId: number;
      action:
        | "skipped_future"
        | "skipped_cancelled"
        | "skipped_no_points"
        | "auto_credited"
        | "pending_claim"
        | "error";
      error?: string;
    };
    const results: Result[] = [];

    for (const t of pendings) {
      const r = reservationsById.get(t.reservation_id);
      if (!r) {
        results.push({
          transferId: t.id,
          reservationId: t.reservation_id,
          action: "error",
          error: "Reserva no encontrada",
        });
        continue;
      }
      // Si la reserva fue cancelada, hubo carrera con cancel/route.ts.
      // Saltamos: el cancel ya debería haber pasado la transferencia a 'cancelled'.
      if (r.status !== "confirmed" && r.status !== "completed") {
        // La reserva ya no aplica: cerrar la transferencia pending para que
        // no quede colgada si hubo inconsistencia (p. ej. cancelación manual
        // en DB sin pasar por /cancel). Si /cancel ya la marcó cancelled,
        // este UPDATE no toca filas (eq status pending).
        await supabase
          .from("benefit_transfers")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
          } as never)
          .eq("id", t.id)
          .eq("status", "pending");
        results.push({
          transferId: t.id,
          reservationId: t.reservation_id,
          action: "skipped_cancelled",
        });
        continue;
      }
      const sessionDate = startOfDay(parse(r.date, "yyyy-MM-dd", new Date()));
      // Materializamos solo si la fecha de la sesión YA PASÓ (sessionDate < today).
      if (!isBefore(sessionDate, today)) {
        results.push({
          transferId: t.id,
          reservationId: t.reservation_id,
          action: "skipped_future",
        });
        continue;
      }

      // Defensa: una transferencia sin from_user_id no debería existir
      // (POST lo exige). Si ocurriera, marcar reverted para no reintentar.
      if (!t.from_user_id) {
        await supabase
          .from("benefit_transfers")
          .update({
            status: "reverted",
            reverted_at: new Date().toISOString(),
          } as never)
          .eq("id", t.id)
          .eq("status", "pending");
        results.push({
          transferId: t.id,
          reservationId: t.reservation_id,
          action: "error",
          error: "from_user_id ausente",
        });
        continue;
      }

      // ¿El to_email ya tiene cuenta?
      const toEmail = (t.to_email || "").toLowerCase().trim();
      const { data: toUserRow } = await supabase
        .from("users")
        .select("id, name, is_photographer")
        .eq("email", toEmail)
        .maybeSingle();
      const toUser = toUserRow as
        | { id: string; name: string | null; is_photographer: boolean | null }
        | null;

      // Cargar nombre del cliente para los correos
      let fromName: string | null = null;
      if (t.from_user_id) {
        const { data: fromUser } = await supabase
          .from("users")
          .select("name")
          .eq("id", t.from_user_id)
          .maybeSingle();
        if (fromUser) {
          fromName = (fromUser as { name: string | null }).name?.trim() || null;
        }
      }

      const nowIso = new Date().toISOString();

      // Snapshot de puntos a transferir (guardado al crear el pending,
      // ya con las Monedas del cliente pre-revocadas).
      const snapshotPoints = Math.max(
        0,
        Math.floor(Number(t.transferred_points) || 0),
      );

      if (toUser) {
        // El fotógrafo ya tiene cuenta → acreditamos directo.
        const result = await materializeTransfer({
          supabase,
          transferId: t.id,
          toUserId: toUser.id,
          pointsToCredit: snapshotPoints,
          targetStatus: "auto_credited",
          fromStatus: "pending",
        });

        if (!result.ok) {
          if (result.reason === "race") continue;
          if (result.reason === "no_points") {
            results.push({
              transferId: t.id,
              reservationId: t.reservation_id,
              action: "skipped_no_points",
            });
            continue;
          }
          console.error(
            `[cron materialize] Error materializando ${t.id} (${toEmail}):`,
            result.error,
          );
          results.push({
            transferId: t.id,
            reservationId: t.reservation_id,
            action: "error",
            error: result.error,
          });
          continue;
        }

        const realPoints = result.pointsTransferred;

        // Marcar usuario como fotógrafo (si no lo era ya)
        if (toUser.is_photographer !== true) {
          await supabase
            .from("users")
            .update({ is_photographer: true } as never)
            .eq("id", toUser.id);
        }

        // Email de notificación (no bloqueante)
        sendTransferReceived({
          to: toEmail,
          recipientName: toUser.name?.trim() || null,
          fromName,
          points: realPoints,
          studioName: t.to_studio_name,
        })
          .then((r2) => {
            if (!r2.ok) {
              console.error(
                "[cron materialize] Error email auto_credited:",
                r2.error,
              );
            }
          })
          .catch((e) =>
            console.error(
              "[cron materialize] Error inesperado email auto_credited:",
              e,
            ),
          );

        results.push({
          transferId: t.id,
          reservationId: t.reservation_id,
          action: "auto_credited",
        });
      } else {
        // No tiene cuenta → magic link. Las Monedas siguen revocadas
        // (earmark del pending), no se acreditan hasta que el fotógrafo
        // se registre y reclame. El monto del email es el snapshot.
        if (snapshotPoints <= 0) {
          await supabase
            .from("benefit_transfers")
            .update({
              status: "reverted",
              reverted_at: nowIso,
              transferred_points: 0,
            } as never)
            .eq("id", t.id)
            .eq("status", "pending");
          results.push({
            transferId: t.id,
            reservationId: t.reservation_id,
            action: "skipped_no_points",
          });
          continue;
        }

        const claimToken = randomUUID();
        const { data: updatedRows, error: updateError } = await supabase
          .from("benefit_transfers")
          .update({
            status: "pending_claim",
            claim_token: claimToken,
            claim_token_sent_at: nowIso,
            materialized_at: nowIso,
          } as never)
          .eq("id", t.id)
          .eq("status", "pending")
          .select("id");
        if (updateError) {
          console.error(
            `[cron materialize] Error marcando pending_claim:`,
            updateError,
          );
          results.push({
            transferId: t.id,
            reservationId: t.reservation_id,
            action: "error",
            error: updateError.message,
          });
          continue;
        }
        if (!updatedRows || updatedRows.length === 0) {
          continue; // race
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const claimUrl = `${baseUrl}/fotografos/reclamar/${claimToken}`;

        sendTransferClaim({
          to: toEmail,
          fromName,
          points: snapshotPoints,
          studioName: t.to_studio_name,
          claimUrl,
        })
          .then((r2) => {
            if (!r2.ok) {
              console.error(
                "[cron materialize] Error email pending_claim:",
                r2.error,
              );
            }
          })
          .catch((e) =>
            console.error(
              "[cron materialize] Error inesperado email pending_claim:",
              e,
            ),
          );

        results.push({
          transferId: t.id,
          reservationId: t.reservation_id,
          action: "pending_claim",
        });
      }
    }

    return successResponse({
      message: `Procesadas ${results.length} transferencias`,
      processedAt: todayIso,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error("[cron materialize] Error inesperado:", err);
    return errorResponse("Error inesperado", 500);
  }
}

// Marcar el módulo como dinámico (no cachear) para que el cron siempre corra fresh
export const dynamic = "force-dynamic";
// Evitar que Next intente prerender este endpoint
export const revalidate = 0;
