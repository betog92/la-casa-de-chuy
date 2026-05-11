import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parse, addDays, startOfDay } from "date-fns";
import {
  calculateBusinessDays,
  getMonterreyToday,
} from "@/utils/business-days";
import {
  buildRefundPlan,
  calculateRefundAmount,
  getTotalConektaPaid,
} from "@/utils/refunds";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
} from "@/utils/api-response";
import {
  sendCancellationConfirmation,
  sendAdminPaymentAlert,
} from "@/lib/email";
import { verifyGuestToken, generateGuestReservationUrl } from "@/lib/auth/guest-tokens";
import { requireAdmin } from "@/lib/auth/admin";
import type { Database } from "@/types/database.types";
import {
  processRefundRow,
  recomputeReservationRefundStatus,
  type ReservationRefundRow,
} from "@/lib/payments/refund-processor";

/** Sin cache: estado de reserva y Conekta cambian en cada POST. */
export const dynamic = "force-dynamic";
/**
 * Hasta 2 filas `processRefundRow` en paralelo; cada una puede hacer hasta
 * ~2 llamadas HTTP a Conekta con timeout 30s → ~60s de peor caso por fila,
 * pero en paralelo el techo práctico es ~60s + margen DB/email. 120s evita
 * cortes si Conekta va lento. El techo efectivo lo impone el plan de Vercel
 * (p. ej. Fluid Compute en Hobby permite hasta 300s según documentación).
 */
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const reservationId =
      typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
    if (isNaN(reservationId) || reservationId <= 0) {
      return validationErrorResponse("ID de reserva inválido");
    }

    // Obtener el body para verificar si hay token de invitado
    const body = await request.json().catch(() => ({}));
    const guestToken = body.token as string | undefined;

    // Obtener el usuario autenticado
    const cookieStore = await cookies();
    const authClient = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // No necesitamos establecer cookies aquí
          },
        },
      }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    let isAdmin = false;
    if (user) {
      const adminCheck = await requireAdmin();
      isAdmin = adminCheck.isAdmin;
    }

    // Obtener la reserva (payment_method y original_price para calcular reembolso solo Conekta)
    const supabase = createServiceRoleClient();
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, status, date, start_time, price, original_price, payment_method, payment_id, additional_payment_id, additional_payment_amount, additional_payment_method, email, name"
      )
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return notFoundResponse("Reserva");
    }

    const reservationRow = reservation as {
      id: number;
      user_id: string | null;
      status: string;
      date: string;
      start_time: string | null;
      price: number;
      original_price: number;
      payment_method: string | null;
      payment_id: string | null;
      additional_payment_id: string | null;
      additional_payment_amount: number | null;
      additional_payment_method: string | null;
      email: string | null;
      name: string | null;
    };

    // Historial de reagendos para sumar pagos adicionales por Conekta
    const { data: historyRows } = await supabase
      .from("reservation_reschedule_history")
      .select("additional_payment_amount, additional_payment_method")
      .eq("reservation_id", reservationId)
      .order("rescheduled_at", { ascending: true });
    const historyList = (historyRows ?? []) as {
      additional_payment_amount: number | null;
      additional_payment_method: string | null;
    }[];

    // Validar autorización: usuario autenticado O token de invitado válido (admin puede cancelar cualquier reserva)
    if (user) {
      if (reservationRow.user_id !== user.id && !isAdmin) {
        return unauthorizedResponse(
          "No tienes permisos para cancelar esta reserva"
        );
      }
    } else if (guestToken) {
      // Invitado: verificar token
      const tokenResult = await verifyGuestToken(guestToken);
      if (!tokenResult.valid || !tokenResult.payload) {
        return unauthorizedResponse(
          tokenResult.error || "Token inválido o expirado"
        );
      }

      // Verificar que el email del token coincide con el email de la reserva
      const tokenEmail = (tokenResult.payload.email || "").toLowerCase().trim();
      const reservationEmail = (reservationRow.email || "").toLowerCase().trim();
      if (tokenEmail !== reservationEmail || tokenResult.payload.reservationId !== String(reservationId)) {
        return unauthorizedResponse(
          "No tienes permisos para cancelar esta reserva"
        );
      }
    } else {
      // Sin autenticación ni token
      return unauthorizedResponse(
        "Debes iniciar sesión o proporcionar un token válido para cancelar una reserva"
      );
    }

    // Verificar que el status es 'confirmed'
    if (reservationRow.status !== "confirmed") {
      return errorResponse("Solo se pueden cancelar reservas confirmadas", 400);
    }

    // Calcular días hábiles desde mañana hasta la fecha de la reserva
    const today = getMonterreyToday();
    const tomorrow = addDays(today, 1);
    const reservationDate = startOfDay(
      parse(reservationRow.date, "yyyy-MM-dd", new Date())
    );

    const businessDays = calculateBusinessDays(tomorrow, reservationDate);

    // Si < 5 días hábiles, rechazar cancelación (admin puede cancelar en cualquier momento)
    if (!isAdmin && businessDays < 5) {
      return errorResponse(
        `La cancelación solo está disponible con al menos 5 días hábiles de anticipación. Faltan ${businessDays} día${
          businessDays !== 1 ? "s" : ""
        } hábil${businessDays !== 1 ? "es" : ""}.`,
        400
      );
    }

    // Reembolso solo por lo pagado con Conekta (órdenes conocidas en la reserva)
    const originalPrice =
      reservationRow.original_price ?? reservationRow.price ?? 0;
    const totalConektaPaid = getTotalConektaPaid(
      reservationRow.payment_method,
      originalPrice,
      historyList
    );
    const refundPlan = buildRefundPlan({
      payment_method: reservationRow.payment_method,
      payment_id: reservationRow.payment_id,
      original_price: reservationRow.original_price,
      price: reservationRow.price,
      additional_payment_id: reservationRow.additional_payment_id,
      additional_payment_amount: reservationRow.additional_payment_amount,
      additional_payment_method: reservationRow.additional_payment_method,
    });

    const refundAmountFromPlan = refundPlan.reduce(
      (sum, item) => sum + item.amountMxn,
      0,
    );
    /** Monto mostrado al cliente (email/UI): plan por órdenes, o 80% del total Conekta si no hay órdenes. */
    const refundAmountForClient =
      refundPlan.length > 0
        ? refundAmountFromPlan
        : calculateRefundAmount(totalConektaPaid);

    /** Pagos Conekta detectados en negocio pero sin órdenes en DB → no se puede reembolsar automáticamente. */
    const corruptConektaData =
      totalConektaPaid > 0 && refundPlan.length === 0;

    const initialRefundStatus = corruptConektaData
      ? ("failed" as const)
      : refundPlan.length > 0
        ? ("pending" as const)
        : ("processed" as const);

    const cancelledAt = new Date().toISOString();

    const { data: updatedReservation, error: updateError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        refund_amount: refundAmountForClient,
        refund_status: initialRefundStatus,
        refund_id: null,
        cancelled_at: cancelledAt,
        ...(isAdmin && user && { cancelled_by_user_id: user.id }),
      } as never)
      .eq("id", reservationId)
      .eq("status", "confirmed")
      .select("id");

    if (updateError) {
      console.error("Error cancelling reservation:", updateError);
      return errorResponse("Error al cancelar la reserva", 500);
    }
    if (!updatedReservation?.length) {
      return errorResponse(
        "La reserva ya no estaba confirmada (posible doble solicitud).",
        409,
      );
    }

    let insertedRefundRows: ReservationRefundRow[] = [];
    if (refundPlan.length > 0) {
      const nextRetryAt = new Date(Date.now() + 30_000).toISOString();
      const inserts = refundPlan.map((p) => ({
        reservation_id: reservationId,
        payment_id: p.paymentId,
        charge_kind: p.kind,
        amount_mxn: p.amountMxn,
        status: "pending" as const,
        next_retry_at: nextRetryAt,
      }));
      const { data: rrData, error: rrInsertError } = await supabase
        .from("reservation_refunds")
        .insert(inserts as never)
        .select("*");
      if (rrInsertError || !rrData) {
        console.error(
          "Error insertando reservation_refunds:",
          rrInsertError,
        );
        const { error: revertErr } = await supabase
          .from("reservations")
          .update({
            status: "confirmed",
            refund_amount: null,
            refund_status: null,
            refund_id: null,
            cancelled_at: null,
            cancelled_by_user_id: null,
          } as never)
          .eq("id", reservationId)
          .eq("status", "cancelled");
        if (revertErr) {
          console.error(
            "[cancel] CRÍTICO: no se pudieron insertar refunds y falló revertir reserva:",
            revertErr,
          );
        }
        return errorResponse("Error al registrar reembolsos", 500);
      }
      insertedRefundRows = rrData as ReservationRefundRow[];
    }

    if (corruptConektaData) {
      void sendAdminPaymentAlert({
        type: "cancellation_refund_failed",
        paymentId:
          reservationRow.payment_id ||
          reservationRow.additional_payment_id ||
          "unknown",
        chargeId: null,
        reservationId,
        notes: `Datos Conekta inconsistentes: total pagado Conekta estimado ${totalConektaPaid} pero sin órdenes en reservation_refunds (plan vacío). La reserva quedó cancelada con refund_status failed.`,
      });
    }

    await Promise.all(
      insertedRefundRows.map(async (rr) => {
        try {
          await processRefundRow(supabase, rr);
        } catch (err) {
          console.error(
            "[cancel] processRefundRow excepción (se reintentará vía cron):",
            {
              reservationId,
              refundRowId: rr.id,
              paymentId: rr.payment_id,
              err,
            },
          );
        }
      }),
    );
    if (insertedRefundRows.length > 0) {
      await recomputeReservationRefundStatus(supabase, reservationId);
    }

    const { data: refundSnapshot } = await supabase
      .from("reservations")
      .select("refund_status, refund_id")
      .eq("id", reservationId)
      .maybeSingle();
    const refundSnap = refundSnapshot as {
      refund_status: string | null;
      refund_id: string | null;
    } | null;
    // Revocar puntos y créditos asociados a esta reserva (en paralelo)
    const revokeTimestamp = new Date().toISOString();

    const [loyaltyResult, creditsResult] = await Promise.all([
      supabase
        .from("loyalty_points")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("revoked", false),
      supabase
        .from("credits")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("revoked", false),
    ]);

    const loyaltyIds =
      !loyaltyResult.error && Array.isArray(loyaltyResult.data) && loyaltyResult.data.length > 0
        ? (loyaltyResult.data as { id: string }[]).map((r) => r.id)
        : [];
    const creditIds =
      !creditsResult.error && Array.isArray(creditsResult.data) && creditsResult.data.length > 0
        ? (creditsResult.data as { id: string }[]).map((r) => r.id)
        : [];

    const [revokeLoyaltyOut, revokeCreditsOut] = await Promise.all([
      loyaltyIds.length > 0
        ? supabase
            .from("loyalty_points")
            .update({ revoked: true, revoked_at: revokeTimestamp } as never)
            .in("id", loyaltyIds)
        : Promise.resolve({ error: null }),
      creditIds.length > 0
        ? supabase
            .from("credits")
            .update({ revoked: true, revoked_at: revokeTimestamp } as never)
            .in("id", creditIds)
        : Promise.resolve({ error: null }),
    ]);

    if (loyaltyResult.error) {
      console.error("Error consultando puntos de lealtad:", loyaltyResult.error);
    }
    if (revokeLoyaltyOut.error) {
      console.error("Error revocando puntos de lealtad:", revokeLoyaltyOut.error);
    }
    if (creditsResult.error) {
      console.error("Error consultando créditos:", creditsResult.error);
    }
    if (revokeCreditsOut.error) {
      console.error("Error revocando créditos:", revokeCreditsOut.error);
    }

    // Cancelar transferencias de Monedas Chuy aún no acreditadas:
    //   - pending: el cron aún no las procesó (las Monedas ya estaban
    //     revocadas desde que se creó el pending; aquí simplemente
    //     marcamos la transferencia como cancelada y NO restauramos
    //     porque la reserva entera se cancela y el cliente pierde las
    //     Monedas igualmente).
    //   - pending_claim: cron generó magic link pero fotógrafo no
    //     reclamó. Idéntico tratamiento: las Monedas se quedan
    //     revocadas y la transferencia queda cancelada.
    // Si ya están auto_credited / claimed, NO se tocan: el fotógrafo ya
    // tiene las Monedas en su cuenta y no se le quitan por una cancelación.
    const { error: cancelTransferError } = await supabase
      .from("benefit_transfers")
      .update({
        status: "cancelled",
        cancelled_at: revokeTimestamp,
      } as never)
      .eq("reservation_id", reservationId)
      .in("status", ["pending", "pending_claim"]);
    if (cancelTransferError) {
      console.error(
        "Error cancelando transferencia pendiente de Monedas Chuy:",
        cancelTransferError,
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const manageUrl = guestToken
      ? generateGuestReservationUrl(guestToken)
      : `${baseUrl}/reservaciones/${reservationId}`;
    const to = (reservationRow.email || "").trim();
    const name = (reservationRow.name || "Cliente").trim();
    const startTime = reservationRow.start_time || "00:00";

    // Si los datos están corruptos (Conekta pagó pero sin órdenes en DB), NO
    // enviamos el email automático con monto de reembolso: sería engañoso.
    // El admin ya recibió la alerta y procesará el caso manualmente.
    if (to && !corruptConektaData) {
      sendCancellationConfirmation({
        to,
        name,
        date: reservationRow.date || "",
        startTime,
        refundAmount: refundAmountForClient,
        reservationId,
        manageUrl,
      })
        .then((r) => {
          if (!r.ok) console.error("Error email cancelación:", r.error);
        })
        .catch((e) =>
          console.error("Error inesperado enviando email cancelación:", e)
        );
    }

    // Si canceló un admin, devolver cancelled_by para que el front no tenga que hacer refetch
    let cancelled_by: { id: string; name: string | null; email: string } | null = null;
    if (isAdmin && user) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("id", user.id)
        .maybeSingle();
      if (userRow) {
        const row = userRow as { id: string; name: string | null; email: string };
        cancelled_by = { id: row.id, name: row.name ?? null, email: row.email };
      }
    }

    return successResponse({
      message: "Reserva cancelada exitosamente",
      refund_amount: refundAmountForClient,
      refund_id: refundSnap?.refund_id ?? null,
      refund_status: refundSnap?.refund_status ?? initialRefundStatus,
      cancelled_by,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cancelar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
