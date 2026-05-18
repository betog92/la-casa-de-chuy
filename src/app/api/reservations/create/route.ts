import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import {
  finalizeReservationFromPayload,
  safeRefundOrder,
} from "@/lib/payments/finalize-reservation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

/**
 * Endpoint server-side para confirmar una reserva pagada con Conekta.
 *
 * La lógica de negocio (verificación contra Conekta, recálculo autoritativo,
 * insert, consumo de Monedas Chuy, email, etc.) vive en el helper compartido
 * `finalizeReservationFromPayload` para que tanto este endpoint como el
 * webhook (`/api/conekta/webhook`) la reusen.
 *
 * Aquí solo:
 * - Parseamos el body del cliente.
 * - Resolvemos el `userId` autenticado por cookies (si existe).
 * - Buscamos el `pending_reservations` correspondiente al paymentId (para
 *   marcarlo `consumed` cuando el helper haga el insert).
 * - Llamamos al helper y mapeamos el resultado a NextResponse.
 */

interface CreateReservationBody {
  email?: string;
  name?: string;
  phone?: string;
  date?: string;
  startTime?: string;
  paymentId?: string;
  sessionType?: string;
  photographerStudio?: string | null;
  useLoyaltyDiscount?: boolean;
  useLoyaltyPoints?: number;
  useCredits?: number;
  discountCode?: string | null;
  referralCode?: string | null;
}

export async function POST(request: NextRequest) {
  let paymentId: string | null = null;
  const supabase = createServiceRoleClient();
  try {
    const authenticatedUserId = await getAuthenticatedUserId();

    const body = (await request.json().catch(() => ({}))) as CreateReservationBody;
    paymentId =
      typeof body.paymentId === "string" && body.paymentId.trim() !== ""
        ? body.paymentId
        : null;

    if (!body.email || !body.name || !body.phone || !body.date || !body.startTime) {
      return validationErrorResponse(
        "Faltan campos requeridos (email, name, phone, date, startTime)",
      );
    }

    // Resolver el snapshot pending para poder marcarlo consumed cuando el
    // helper inserte la reserva. Es opcional: si no hay snapshot (request
    // viejo, o un cliente directo), simplemente no lo marcamos.
    const pendingId = paymentId
      ? await resolvePendingIdByPaymentId(supabase, paymentId)
      : null;

    const result = await finalizeReservationFromPayload({
      email: body.email,
      name: body.name,
      phone: body.phone,
      date: body.date,
      startTime: body.startTime,
      paymentId,
      sessionType: String(body.sessionType ?? ""),
      photographerStudio: body.photographerStudio ?? null,
      useLoyaltyDiscount: body.useLoyaltyDiscount === true,
      useLoyaltyPoints: Number(body.useLoyaltyPoints) || 0,
      useCredits: Number(body.useCredits) || 0,
      discountCode: body.discountCode ?? null,
      referralCode: body.referralCode ?? null,
      authenticatedUserId,
      pendingReservationId: pendingId,
      supabase,
    });

    if (!result.ok) {
      // Si hubo paymentId pero el reembolso no se confirmó (Conekta down,
      // 5xx, etc.), avisamos al cliente que el sistema lo intentará luego.
      const suffix = result.refunded
        ? " Tu pago será reembolsado automáticamente."
        : paymentId
          ? " Si fuiste cobrado, el sistema intentará reembolsarte en los próximos minutos."
          : "";
      return errorResponse(`${result.message}${suffix}`, result.status);
    }

    return successResponse({
      reservationId: result.reservationId,
      guestToken: result.guestToken,
      guestReservationUrl: result.guestReservationUrl,
      loyaltyLevelChanged: result.loyaltyLevelChanged,
      newLoyaltyLevel: result.newLoyaltyLevel,
      finalPrice: result.finalPrice,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error inesperado al crear la reserva";
    console.error("Error inesperado en /reservations/create:", error);
    if (paymentId) {
      console.error(
        "[reservations/create] Excepción inesperada con paymentId presente; intentando reembolso:",
        paymentId,
      );
      const refundOk = await safeRefundOrder(paymentId, supabase);
      return errorResponse(
        refundOk
          ? `${errorMessage}. Tu pago será reembolsado automáticamente.`
          : `${errorMessage}. Si fuiste cobrado, el sistema intentará reembolsarte en los próximos minutos.`,
        500,
      );
    }
    return errorResponse(errorMessage, 500);
  }
}

// =====================================================
// Helpers locales
// =====================================================

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
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
            // server-only
          },
        },
      },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function resolvePendingIdByPaymentId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  paymentId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("pending_reservations")
      .select("id, status")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; status: string };
    // Sólo devolvemos id si el snapshot sigue esperando pago; si ya está
    // consumed/refunded/etc., el helper no debe intentar marcarlo consumed.
    if (row.status !== "pending_payment") return null;
    return row.id;
  } catch (err) {
    console.error("[reservations/create] resolvePendingIdByPaymentId falló:", err);
    return null;
  }
}
