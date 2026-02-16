import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateSlotAvailability,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  conflictResponse,
} from "@/utils/api-response";
import {
  generateGuestToken,
  generateGuestReservationUrl,
} from "@/lib/auth/guest-tokens";
import { sendReservationConfirmation } from "@/lib/email";

/**
 * Lista reservas con filtros opcionales (fecha, estado).
 * Solo accesible por admins.
 */
export async function GET(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const status = searchParams.get("status");
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50),
      200
    );
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const supabase = createServiceRoleClient();
    let query = supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, status, payment_id, created_at, reschedule_count, discount_code",
        { count: "exact" }
      )
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      query = query.gte("date", dateFrom);
    }
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      query = query.lte("date", dateTo);
    }
    if (status && ["confirmed", "cancelled", "completed"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error listing reservations:", error);
      return errorResponse("Error al listar reservas", 500);
    }

    return successResponse({
      reservations: data ?? [],
      total: count ?? 0,
    });
  } catch (error) {
    console.error("Error in admin reservations GET:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al cargar reservas",
      500
    );
  }
}

/**
 * Crea una reserva manual (efectivo o transferencia).
 * Solo accesible por admins.
 */
export async function POST(request: NextRequest) {
  const { user: adminUser, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const body = await request.json();
    const {
      date,
      startTime,
      name,
      email,
      phone,
      price,
      payment_method,
      sendEmail,
    } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return validationErrorResponse("Fecha inválida (use YYYY-MM-DD)");
    }
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      return validationErrorResponse("Horario inválido (use HH:mm)");
    }
    if (!name?.trim()) {
      return validationErrorResponse("Nombre requerido");
    }
    if (!email?.trim()) {
      return validationErrorResponse("Email requerido");
    }
    if (!phone?.trim()) {
      return validationErrorResponse("Teléfono requerido");
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return validationErrorResponse("El precio debe ser mayor a 0");
    }
    if (
      !payment_method ||
      !["efectivo", "transferencia"].includes(payment_method)
    ) {
      return validationErrorResponse(
        "Método de pago inválido (use 'efectivo' o 'transferencia')"
      );
    }

    const supabase = createServiceRoleClient();
    const normalizedEmail = String(email).toLowerCase().trim();

    // Si existe un usuario registrado con ese email, vincular la reserva para que aparezca en "Mis Reservas"
    let userId: string | null = null;
    const { data: existingUserRow } = await supabase
      .from("users")
      .select("id")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();
    const existingUser = existingUserRow as { id: string } | null;
    if (existingUser?.id) userId = existingUser.id;

    const isAvailable = await validateSlotAvailability(
      supabase,
      date,
      startTime.includes(":00:00") ? startTime.slice(0, 5) : startTime
    );
    if (!isAvailable) {
      return conflictResponse(
        "El horario seleccionado ya no está disponible. Elige otro slot."
      );
    }

    const endTime = calculateEndTime(startTime);
    const reservationData = {
      email: normalizedEmail,
      name: String(name).trim(),
      phone: String(phone).trim(),
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      price: priceNum,
      original_price: priceNum,
      payment_id: null,
      payment_method: payment_method as "efectivo" | "transferencia",
      status: "confirmed" as const,
      user_id: userId,
      created_by_user_id: adminUser?.id ?? null,
      discount_amount: 0,
      last_minute_discount: 0,
      loyalty_discount: 0,
      loyalty_points_used: 0,
      credits_used: 0,
      referral_discount: 0,
      discount_code: null,
      discount_code_discount: 0,
    };

    const { data, error } = await supabase
      .from("reservations")
      .insert(reservationData as never)
      .select("id")
      .single();

    if (error) {
      console.error("Error al crear reserva manual:", error);
      if (error.code === "23505" || error.message?.includes("UNIQUE")) {
        return conflictResponse(
          "El horario fue reservado por otro usuario. Elige otro slot."
        );
      }
      return errorResponse(
        error.message || "Error al crear la reserva",
        500
      );
    }

    const reservationId = (data as { id: number } | null)?.id;
    if (reservationId == null || typeof reservationId !== "number") {
      return errorResponse("No se pudo obtener el ID de la reserva", 500);
    }

    let manageUrl: string | null = null;
    if (sendEmail && normalizedEmail) {
      try {
        const token = await generateGuestToken(
          normalizedEmail,
          String(reservationId)
        );
        manageUrl = generateGuestReservationUrl(token);
        sendReservationConfirmation({
          to: normalizedEmail,
          name: String(name).trim(),
          date,
          startTime: startTime.slice(0, 5),
          price: priceNum,
          reservationId,
          manageUrl,
        })
          .then((r) => {
            if (!r.ok) console.error("Error enviando email:", r.error);
          })
          .catch((e) =>
            console.error("Error enviando email de confirmación:", e)
          );
      } catch (err) {
        console.error("Error al generar enlace para email:", err);
      }
    }

    return successResponse({
      reservationId,
      message: "Reserva creada correctamente",
    });
  } catch (error) {
    console.error("Error in admin reservations POST:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Error al crear reserva",
      500
    );
  }
}
