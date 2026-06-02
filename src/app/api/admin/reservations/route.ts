import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateConsecutiveSlots,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import {
  DEFAULT_DURATION_MIN,
  durationForVariant,
  isAlveroVariant,
} from "@/utils/reservation-variants";
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
import {
  applyOriginFilter,
  excludeManualAvailableSlots,
  isOriginFilter,
} from "@/lib/admin/reservation-filters";

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
    const paymentStatusFilter = searchParams.get("paymentStatus");
    const originParam = searchParams.get("origin");
    const originFilter = isOriginFilter(originParam) ? originParam : null;
    const search = searchParams.get("search")?.trim() || "";
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50),
      200
    );
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const supabase = createServiceRoleClient();

    let query = supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, status, payment_id, payment_method, payment_status, created_at, reschedule_count, discount_code, source, google_event_id, import_type, order_number",
        { count: "exact" }
      )
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    // Excluir slots de Nancy / "Reservado para Alvero" (manual_available)
    query = excludeManualAvailableSlots(query);

    if (search) {
      // Búsqueda "contiene": nombre, email, teléfono, orden #, google_event_id y (si es número) id
      const term = search.replace(/^#/, "").trim();
      const escaped = search
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_")
        .replace(/'/g, "''");
      const pattern = `%${escaped}%`;
      const quoted = pattern.includes(",") || pattern.includes('"')
        ? `"${pattern.replace(/"/g, '""')}"`
        : pattern;
      const orParts = [
        `name.ilike.${quoted}`,
        `email.ilike.${quoted}`,
        `phone.ilike.${quoted}`,
        `order_number.ilike.${quoted}`,
        `google_event_id.ilike.${quoted}`,
      ];
      const num = parseInt(term, 10);
      if (term !== "" && !Number.isNaN(num) && num > 0 && String(num) === term) {
        orParts.push(`id.eq.${num}`);
      }
      query = query.or(orParts.join(","));
    }

    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      query = query.gte("date", dateFrom);
    }
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      query = query.lte("date", dateTo);
    }
    if (status && ["confirmed", "cancelled", "completed"].includes(status)) {
      query = query.eq("status", status);
    }
    if (paymentStatusFilter === "pending") {
      query = query.eq("payment_status", "pending");
    }
    query = applyOriginFilter(query, originFilter);

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

const PLACEHOLDER_EMAIL = "reservado-alvero@lacasaddechuy.local";
const PLACEHOLDER_PHONE = "—";

type Variant = "cliente" | "reservado_alvero" | "cita_alvero";

/**
 * Crea una reserva desde el panel admin (una de tres variantes).
 * Solo accesible por admins.
 * variant: cliente (efectivo/transferencia) | reservado_alvero (bloqueo) | cita_alvero (sesión Alvero + orden)
 */
export async function POST(request: NextRequest) {
  const { user: adminUser, isAdmin, isSuperAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const body = await request.json();
    const variant: Variant | undefined = body.variant;
    if (
      !variant ||
      !["cliente", "reservado_alvero", "cita_alvero"].includes(variant)
    ) {
      return validationErrorResponse(
        "Tipo de reserva inválido (use cliente, reservado_alvero o cita_alvero)"
      );
    }

    const {
      date,
      startTime,
      name,
      email,
      phone,
      price,
      payment_method,
      payment_status: bodyPaymentStatus,
      sendEmail,
      order_number,
      replaces_reservation_id: bodyReplacesId,
      import_notes: bodyImportNotes,
    } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return validationErrorResponse("Fecha inválida (use YYYY-MM-DD)");
    }
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      return validationErrorResponse("Horario inválido (use HH:mm)");
    }

    // Promover un `reservado_alvero` existente a `cita_alvero` (en sitio,
    // mismo id). Solo aplica para variant `cita_alvero`.
    let replacesReservationId: number | null = null;
    if (bodyReplacesId !== undefined && bodyReplacesId !== null) {
      const parsed = Number(bodyReplacesId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return validationErrorResponse(
          "replaces_reservation_id inválido (debe ser un entero positivo)",
        );
      }
      if (variant !== "cita_alvero") {
        return validationErrorResponse(
          "replaces_reservation_id solo aplica para variant 'cita_alvero'",
        );
      }
      replacesReservationId = parsed;
    }

    let finalName: string;
    let finalEmail: string;
    let finalPhone: string;
    let finalPrice: number;
    let finalPaymentMethod: "efectivo" | "transferencia" | null = null;
    let importType: string | null = null;
    let finalOrderNumber: string | null = null;
    let shouldSendEmail = false;
    let paymentStatus: "pending" | "paid" | "not_applicable" = "not_applicable";

    if (variant === "cliente") {
      if (!name?.trim()) return validationErrorResponse("Nombre requerido");
      if (!email?.trim()) return validationErrorResponse("Email requerido");
      if (!phone?.trim()) return validationErrorResponse("Teléfono requerido");
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        return validationErrorResponse("El precio debe ser mayor a 0");
      }
      if (
        !payment_method ||
        !["efectivo", "transferencia"].includes(payment_method)
      ) {
        return validationErrorResponse(
          "Método de pago inválido (use efectivo o transferencia)"
        );
      }
      finalName = String(name).trim();
      finalEmail = String(email).toLowerCase().trim();
      finalPhone = String(phone).trim();
      finalPrice = priceNum;
      finalPaymentMethod = payment_method as "efectivo" | "transferencia";
      shouldSendEmail = Boolean(sendEmail);
      // Empleadas: siempre pending → cola de pagos manuales para que familia valide.
      // Familia puede marcar pagado al crear si ya recibieron el cobro.
      paymentStatus =
        isSuperAdmin && bodyPaymentStatus === "paid" ? "paid" : "pending";
    } else if (variant === "reservado_alvero") {
      finalName = "Espacio reservado para Alvero";
      finalEmail = PLACEHOLDER_EMAIL;
      finalPhone = PLACEHOLDER_PHONE;
      finalPrice = 0;
      importType = "manual_available";
    } else {
      // cita_alvero
      if (!name?.trim()) return validationErrorResponse("Nombre requerido");
      if (!order_number?.toString()?.trim()) {
        return validationErrorResponse("Número de orden requerido");
      }
      finalName = String(name).trim();
      finalEmail = (email?.toString()?.trim() || "").toLowerCase() || PLACEHOLDER_EMAIL;
      finalPhone = String(phone ?? "").trim() || PLACEHOLDER_PHONE;
      finalPrice = Number(price);
      finalPrice = Number.isFinite(finalPrice) && finalPrice >= 0 ? finalPrice : 0;
      finalOrderNumber = String(order_number).trim();
      importType = "manual_client";
    }

    const supabase = createServiceRoleClient();

    let userId: string | null = null;
    if (variant === "cliente" || (variant === "cita_alvero" && finalEmail !== PLACEHOLDER_EMAIL)) {
      const { data: existingUserRow } = await supabase
        .from("users")
        .select("id")
        .ilike("email", finalEmail)
        .limit(1)
        .maybeSingle();
      const existingUser = existingUserRow as { id: string } | null;
      if (existingUser?.id) userId = existingUser.id;
    }

    const startTimeNorm = startTime.includes(":00:00") ? startTime.slice(0, 5) : startTime;
    const durationMin = durationForVariant(variant);

    // Caso especial: promoción de `reservado_alvero` -> `cita_alvero`.
    // El slot YA está ocupado por ese row; `validateConsecutiveSlots`
    // daría false. Validamos por separado que el row existente sea
    // promocionable y saltamos la validación de slots libres.
    let originalCreatedByUserId: string | null = adminUser?.id ?? null;
    if (replacesReservationId !== null) {
      const { data: existingRow, error: existingErr } = await supabase
        .from("reservations")
        .select(
          "id, date, start_time, end_time, status, source, import_type, created_by_user_id",
        )
        .eq("id", replacesReservationId)
        .maybeSingle();

      if (existingErr) {
        console.error("[admin reservations] error leyendo replaces:", existingErr);
        return errorResponse("Error al verificar el espacio reservado", 500);
      }
      if (!existingRow) {
        return validationErrorResponse(
          "El espacio reservado no existe (replaces_reservation_id)",
        );
      }
      const r = existingRow as {
        id: number;
        date: string;
        start_time: string;
        end_time: string;
        status: string;
        source: string;
        import_type: string | null;
        created_by_user_id: string | null;
      };
      if (
        r.source !== "admin" ||
        r.import_type !== "manual_available" ||
        r.status !== "confirmed"
      ) {
        return validationErrorResponse(
          "Esta reserva no es un 'Espacio reservado para Alvero' promocionable",
        );
      }
      // Defensa: cliente envió date/startTime; deben coincidir con el row.
      const startTimeRow = String(r.start_time).slice(0, 5);
      if (r.date !== date || startTimeRow !== startTimeNorm) {
        return validationErrorResponse(
          "Fecha u horario no coinciden con el espacio reservado",
        );
      }
      // Conservamos el created_by_user_id original para auditoría
      // (quién dejó el espacio reservado). El nuevo admin queda en
      // un campo separado vía updated_at; el "promovido por" se puede
      // inferir cruzando con logs o agregando un campo en el futuro.
      originalCreatedByUserId = r.created_by_user_id;
    } else {
      const slotsCount = Math.max(1, Math.round(durationMin / DEFAULT_DURATION_MIN));
      const isAvailable = await validateConsecutiveSlots(
        supabase,
        date,
        startTimeNorm,
        slotsCount,
      );
      if (!isAvailable) {
        return conflictResponse(
          isAlveroVariant(variant)
            ? "Para una cita Alvero se necesitan 2 bloques consecutivos disponibles (90 min). Elige otro horario."
            : "El horario seleccionado ya no está disponible. Elige otro slot.",
        );
      }
    }

    const endTime = calculateEndTime(startTime, durationMin);
    const paidAtCreation =
      variant === "cliente" && paymentStatus === "paid" && isSuperAdmin;

    let importNotes: string | null = null;
    if (
      (variant === "cliente" || variant === "cita_alvero") &&
      bodyImportNotes != null &&
      bodyImportNotes !== ""
    ) {
      const raw = String(bodyImportNotes).trim();
      importNotes = raw ? raw.slice(0, 10000) : null;
    }

    const reservationData = {
      source: "admin" as const,
      import_type: importType,
      order_number: finalOrderNumber,
      email: finalEmail,
      name: finalName,
      phone: finalPhone,
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      price: finalPrice,
      original_price: finalPrice,
      payment_id: null,
      payment_method: finalPaymentMethod,
      payment_status: paymentStatus,
      ...(paidAtCreation && {
        payment_validated_at: new Date().toISOString(),
        payment_validated_by_user_id: adminUser?.id ?? null,
      }),
      status: "confirmed" as const,
      user_id: userId,
      created_by_user_id: originalCreatedByUserId,
      discount_amount: 0,
      last_minute_discount: 0,
      loyalty_discount: 0,
      loyalty_points_used: 0,
      credits_used: 0,
      referral_discount: 0,
      discount_code: null,
      discount_code_discount: 0,
      ...(importNotes !== null && { import_notes: importNotes }),
    };

    let reservationId: number;

    if (replacesReservationId !== null) {
      // UPDATE en sitio: el row existente cambia de 'manual_available'
      // (espacio reservado) a 'manual_client' (cita Alvero asignada).
      const { data: updatedRow, error: updateError } = await supabase
        .from("reservations")
        .update(reservationData as never)
        .eq("id", replacesReservationId)
        .eq("import_type", "manual_available")
        .select("id")
        .single();

      if (updateError) {
        // `.single()` con 0 filas (otro admin ya promovió, o el row cambió).
        const code =
          typeof updateError === "object" &&
          updateError !== null &&
          "code" in updateError
            ? String((updateError as { code?: string }).code)
            : "";
        if (code === "PGRST116") {
          return conflictResponse(
            "El espacio reservado ya no estaba disponible para promoción (puede haberlo tomado otro admin).",
          );
        }
        console.error("Error al promover reservado_alvero:", updateError);
        return errorResponse(
          updateError.message || "Error al promover el espacio reservado",
          500,
        );
      }
      const updatedId = (updatedRow as { id: number } | null)?.id;
      if (updatedId == null || typeof updatedId !== "number") {
        return conflictResponse(
          "El espacio reservado ya no estaba disponible para promoción (puede haberlo tomado otro admin).",
        );
      }
      reservationId = updatedId;
    } else {
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

      const inserted = (data as { id: number } | null)?.id;
      if (inserted == null || typeof inserted !== "number") {
        return errorResponse("No se pudo obtener el ID de la reserva", 500);
      }
      reservationId = inserted;
    }

    if (shouldSendEmail && finalEmail && finalEmail !== PLACEHOLDER_EMAIL) {
      try {
        const token = await generateGuestToken(finalEmail, String(reservationId));
        const manageUrl = generateGuestReservationUrl(token);
        sendReservationConfirmation({
          to: finalEmail,
          name: finalName,
          date,
          startTime: startTimeNorm,
          price: finalPrice,
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
