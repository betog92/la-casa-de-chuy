import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupAdminRolesForUserId, requireAdmin } from "@/lib/auth/admin";
import {
  canSuperAdminEditReservationContact,
  canAdminEditImportNotes,
  isAlveroClientReservation,
} from "@/lib/admin/reservation-contact-edit";
import {
  isManualChuyReservation,
  isStampCardGiftReservation,
  normalizeStampCardCode,
  stampCardGiftPaymentFields,
} from "@/lib/admin/stamp-card-code";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/utils/api-response";
import type { Database } from "@/types/database.types";
import { isSessionType } from "@/utils/session-type";
import { getEffectiveReservationStatus } from "@/lib/reservations/session-lifecycle";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];

export async function GET(
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

    // Obtener la reserva usando service role para evitar problemas de RLS
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, email, name, phone, date, start_time, end_time, price, original_price, payment_id, payment_method, payment_status, payment_validated_at, payment_validated_by_user_id, status, created_at, last_minute_discount, loyalty_discount, loyalty_points_used, credits_used, referral_discount, discount_code, discount_code_discount, refund_amount, refund_id, refund_status, cancelled_at, reschedule_count, original_date, original_start_time, original_payment_id, additional_payment_id, additional_payment_amount, additional_payment_method, user_id, created_by_user_id, rescheduled_by_user_id, cancelled_by_user_id, source, google_event_id, import_type, order_number, municipio, import_notes, import_notes_edited_at, import_notes_edited_by_user_id, stamp_card_code, session_type, photographer_studio"
      )
      .eq("id", reservationId)
      .single();

    if (error || !data) {
      console.error("Error loading reservation:", error);
      return notFoundResponse("Reserva");
    }

    // Type assertion para ayudar a TypeScript
    const reservationData = data as ReservationRow;

    // Admins pueden ver cualquier reserva (una sola consulta de roles tras getUser)
    const isAdmin = user?.id
      ? (await lookupAdminRolesForUserId(user.id)).isAdmin
      : false;

    // Si hay usuario autenticado, verificar pertenencia (o ser admin); si no, permitir (flujo invitado/confirmación)
    if (
      !isAdmin &&
      user &&
      reservationData.user_id &&
      reservationData.user_id !== user.id
    ) {
      return unauthorizedResponse("No tienes permisos para ver esta reserva");
    }

    // Si no hay sesión, comprobar si el email de la reserva ya tiene cuenta (para UI de confirmación)
    let hasAccount: boolean | undefined;
    if (!user && reservationData.email) {
      const normalized = String(reservationData.email).toLowerCase().trim();
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalized)
        .limit(1)
        .maybeSingle();
      hasAccount = !!userRow;
    }

    // Historial de reagendamientos (todos, orden cronológico)
    type HistoryRow = {
      id: number;
      rescheduled_at: string;
      rescheduled_by_user_id: string | null;
      previous_date: string;
      previous_start_time: string;
      new_date: string;
      new_start_time: string;
      additional_payment_amount: number | null;
      additional_payment_method: string | null;
    };
    const { data: historyRows } = await supabase
      .from("reservation_reschedule_history")
      .select("id, rescheduled_at, rescheduled_by_user_id, previous_date, previous_start_time, new_date, new_start_time, additional_payment_amount, additional_payment_method")
      .eq("reservation_id", reservationId)
      .order("rescheduled_at", { ascending: true });
    const historyList = (historyRows ?? []) as HistoryRow[];

    // Una sola query de users para created_by, rescheduled_by, cancelled_by y historial
    const createdByUserId = (reservationData as { created_by_user_id?: string | null }).created_by_user_id;
    const rescheduledByUserId = (reservationData as { rescheduled_by_user_id?: string | null }).rescheduled_by_user_id;
    const cancelledByUserId = (reservationData as { cancelled_by_user_id?: string | null }).cancelled_by_user_id;
    const importNotesEditedByUserId = (reservationData as { import_notes_edited_by_user_id?: string | null }).import_notes_edited_by_user_id;
    const paymentValidatedByUserId = (reservationData as { payment_validated_by_user_id?: string | null }).payment_validated_by_user_id;
    const historyUserIds = historyList.map((h) => h.rescheduled_by_user_id).filter(Boolean) as string[];
    const allUserIds = [
      ...new Set(
        [
          createdByUserId,
          rescheduledByUserId,
          cancelledByUserId,
          ...(isAdmin ? [importNotesEditedByUserId, paymentValidatedByUserId] : []),
          ...historyUserIds,
        ].filter(Boolean),
      ),
    ] as string[];
    let usersMap: Record<string, { id: string; name: string | null; email: string }> = {};
    if (allUserIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", allUserIds);
      const users = (usersData ?? []) as { id: string; name: string | null; email: string }[];
      for (const u of users) {
        usersMap[u.id] = { id: u.id, name: u.name ?? null, email: u.email };
      }
    }
    const created_by = createdByUserId ? usersMap[createdByUserId] ?? null : null;
    const rescheduled_by = rescheduledByUserId ? usersMap[rescheduledByUserId] ?? null : null;
    const cancelled_by = cancelledByUserId ? usersMap[cancelledByUserId] ?? null : null;
    const import_notes_edited_by = importNotesEditedByUserId ? usersMap[importNotesEditedByUserId] ?? null : null;
    const payment_validated_by = paymentValidatedByUserId ? usersMap[paymentValidatedByUserId] ?? null : null;
    const reschedule_history = historyList.map((h) => ({
      rescheduled_at: h.rescheduled_at,
      rescheduled_by: h.rescheduled_by_user_id ? usersMap[h.rescheduled_by_user_id] ?? null : null,
      previous_date: h.previous_date,
      previous_start_time: h.previous_start_time,
      new_date: h.new_date,
      new_start_time: h.new_start_time,
      additional_payment_amount: h.additional_payment_amount,
      additional_payment_method: h.additional_payment_method,
    }));

    const reservation: Record<string, unknown> = {
      ...reservationData,
      status: getEffectiveReservationStatus(
        reservationData.status,
        reservationData.date,
      ),
      created_by,
      rescheduled_by,
      cancelled_by,
      reschedule_history,
      ...(isAdmin && {
        import_notes_edited_by,
        payment_validated_by,
      }),
    };

    if (!isAdmin) {
      delete reservation.import_notes;
      delete reservation.import_notes_edited_at;
      delete reservation.import_notes_edited_by_user_id;
      delete reservation.order_number;
      delete reservation.municipio;
      delete reservation.google_event_id;
      delete reservation.stamp_card_code;
    }

    return successResponse({
      reservation,
      ...(hasAccount !== undefined && { hasAccount }),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al cargar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}

/** PATCH: Actualizar detalle de la reserva (admin; contacto solo super admin en manuales) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, isAdmin, isSuperAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("Solo un administrador puede editar la reserva");
  }

  try {
    const { id: rawId } = await params;
    const reservationId =
      typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
    if (isNaN(reservationId) || reservationId <= 0) {
      return validationErrorResponse("ID de reserva inválido");
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Cuerpo de la petición no es JSON válido");
    }

    const supabase = createServiceRoleClient();
    const { data: existingRow, error: fetchError } = await supabase
      .from("reservations")
      .select(
        "id, source, import_type, import_notes, name, email, phone, order_number, municipio, stamp_card_code, price, payment_status, payment_method, session_type, photographer_studio",
      )
      .eq("id", reservationId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching reservation for PATCH:", fetchError);
      return errorResponse("Error al obtener la reserva", 500);
    }
    if (!existingRow) {
      return notFoundResponse("Reserva");
    }

    const existing = existingRow as {
      source: string;
      import_type: string | null;
      import_notes: string | null;
      name: string;
      email: string;
      phone: string | null;
      order_number: string | null;
      municipio: string | null;
      stamp_card_code: string | null;
      price: number;
      payment_status: string | null;
      payment_method: string | null;
      session_type: string | null;
      photographer_studio: string | null;
    };

    const touchesPersonalContact =
      body.name !== undefined ||
      body.email !== undefined ||
      body.phone !== undefined ||
      body.order_number !== undefined;

    if (touchesPersonalContact) {
      if (!isSuperAdmin) {
        return forbiddenResponse(
          "Solo la familia (super admin) puede editar los datos personales del cliente",
        );
      }
      if (!canSuperAdminEditReservationContact(existing)) {
        return validationErrorResponse(
          "Los datos personales solo se pueden editar en reservas manuales del panel (no reservas web)",
        );
      }
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return validationErrorResponse("El nombre no puede estar vacío");
      }
      if (name !== existing.name) {
        updatePayload.name = name;
      }
    }
    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!email) {
        return validationErrorResponse("El email no puede estar vacío");
      }
      if (!email.includes("@")) {
        return validationErrorResponse("El email no es válido");
      }
      if (email !== existing.email.trim().toLowerCase()) {
        updatePayload.email = email;
      }
    }
    if (typeof body.phone === "string") {
      const phone = body.phone.trim();
      if (phone !== (existing.phone ?? "").trim()) {
        updatePayload.phone = phone;
      }
    }
    if (body.order_number !== undefined) {
      const order =
        body.order_number === "" || body.order_number == null
          ? null
          : String(body.order_number).trim();
      const prevOrder = existing.order_number ?? null;
      if (order !== prevOrder) {
        updatePayload.order_number = order;
      }
    }
    if (body.municipio !== undefined) {
      if (!isAlveroClientReservation(existing)) {
        return validationErrorResponse(
          "El municipio solo aplica en citas Alvero",
        );
      }
      const municipio =
        body.municipio === "" || body.municipio == null
          ? null
          : String(body.municipio).trim().slice(0, 200);
      const prevMunicipio = existing.municipio?.trim() || null;
      const nextMunicipio = municipio === "" ? null : municipio;
      if (nextMunicipio !== prevMunicipio) {
        updatePayload.municipio = nextMunicipio;
      }
    }
    if (body.import_notes !== undefined) {
      if (!canAdminEditImportNotes(existing)) {
        return validationErrorResponse(
          "Las notas internas no se pueden editar en este tipo de reserva",
        );
      }
      const raw =
        body.import_notes === "" || body.import_notes == null
          ? null
          : String(body.import_notes).trim();
      const maxNotesLength = 10000;
      const newNotes = raw === null ? null : raw.slice(0, maxNotesLength);
      const prevNotes = existing.import_notes ?? null;
      if (newNotes !== prevNotes) {
        updatePayload.import_notes = newNotes;
      }
    }

    if (body.stamp_card_code !== undefined || body.cupon !== undefined) {
      if (!isManualChuyReservation(existing)) {
        return validationErrorResponse(
          "El cupón del tarjetero solo aplica en citas manuales de La Casa de Chuy",
        );
      }
      const raw =
        body.stamp_card_code !== undefined
          ? body.stamp_card_code
          : body.cupon;
      const next = normalizeStampCardCode(
        raw === "" || raw == null ? null : String(raw),
      );
      const prev = normalizeStampCardCode(existing.stamp_card_code);
      if (next !== prev) {
        if (next) {
          updatePayload.stamp_card_code = next;
          Object.assign(updatePayload, stampCardGiftPaymentFields());
        } else {
          const bodyPrice =
            body.price !== undefined ? Number(body.price) : undefined;
          const effectivePrice =
            bodyPrice !== undefined && Number.isFinite(bodyPrice)
              ? bodyPrice
              : Number(existing.price) || 0;
          if (effectivePrice <= 0) {
            return validationErrorResponse(
              "Al quitar el cupón de regalo debes indicar un precio mayor a 0",
            );
          }
          updatePayload.stamp_card_code = null;
          updatePayload.price = effectivePrice;
          updatePayload.original_price = effectivePrice;
          updatePayload.payment_status = "pending";
          if (
            body.payment_method &&
            ["efectivo", "transferencia"].includes(String(body.payment_method))
          ) {
            updatePayload.payment_method = body.payment_method;
          } else if (!existing.payment_method) {
            return validationErrorResponse(
              "Al quitar el cupón indica método de pago (efectivo o transferencia)",
            );
          }
          updatePayload.payment_validated_at = null;
          updatePayload.payment_validated_by_user_id = null;
        }
      }
    }

    if (
      isManualChuyReservation(existing) &&
      isStampCardGiftReservation({
        stamp_card_code:
          (updatePayload.stamp_card_code as string | null | undefined) ??
          existing.stamp_card_code,
      }) &&
      body.price !== undefined
    ) {
      const priceNum = Number(body.price);
      if (Number.isFinite(priceNum) && priceNum !== 0) {
        return validationErrorResponse(
          "La sesión regalo con cupón debe tener precio $0",
        );
      }
    }

    if (body.session_type !== undefined && body.session_type !== null) {
      if (!isSuperAdmin) {
        return forbiddenResponse(
          "Solo la familia (super admin) puede cambiar el tipo de sesión",
        );
      }
      const st = String(body.session_type).trim();
      if (!isSessionType(st)) {
        return validationErrorResponse(
          "session_type inválido (use xv_anos, boda o casual)"
        );
      }
      if (st !== (existing.session_type ?? null)) {
        updatePayload.session_type = st;
      }
    }
    if (body.session_type === null) {
      if (!isSuperAdmin) {
        return forbiddenResponse(
          "Solo la familia (super admin) puede cambiar el tipo de sesión",
        );
      }
      if (existing.session_type !== null) {
        updatePayload.session_type = null;
      }
    }

    if (body.photographer_studio !== undefined) {
      const raw =
        body.photographer_studio === "" || body.photographer_studio == null
          ? null
          : String(body.photographer_studio).trim().slice(0, 500);
      const nextPhotographer = raw === "" ? null : raw;
      const prevPhotographer = existing.photographer_studio ?? null;
      if (nextPhotographer !== prevPhotographer) {
        updatePayload.photographer_studio = nextPhotographer;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return validationErrorResponse("No hay campos válidos para actualizar");
    }

    updatePayload.import_notes_edited_at = new Date().toISOString();
    updatePayload.import_notes_edited_by_user_id = adminUser?.id ?? null;

    // Si cambia el email, re-vincular user_id (igual que al crear reserva manual).
    if (typeof updatePayload.email === "string") {
      const { data: linkedUser } = await supabase
        .from("users")
        .select("id")
        .ilike("email", updatePayload.email)
        .maybeSingle();
      updatePayload.user_id = (linkedUser as { id: string } | null)?.id ?? null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipos generados de Supabase no incluyen todos los campos en Update
    const { data, error } = await (supabase.from("reservations") as any)
      .update(updatePayload)
      .eq("id", reservationId)
      .select("id, name, email, phone, order_number, municipio, user_id, import_notes, import_notes_edited_at, import_notes_edited_by_user_id, stamp_card_code, price, payment_status, payment_method, session_type, photographer_studio")
      .single();

    if (error) {
      console.error("Error updating reservation:", error);
      return errorResponse("Error al actualizar la reserva", 500);
    }
    if (!data) {
      return notFoundResponse("Reserva");
    }

    // Resolver quién editó (cualquier campo guardado vía PATCH admin).
    let import_notes_edited_by: { id: string; name: string | null; email: string } | null = null;
    const editedByUserId = data.import_notes_edited_by_user_id;
    if (editedByUserId) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("id", editedByUserId)
        .maybeSingle();
      if (userRow) {
        import_notes_edited_by = {
          id: (userRow as { id: string }).id,
          name: (userRow as { name: string | null }).name ?? null,
          email: (userRow as { email: string }).email,
        };
      }
    }

    return successResponse({
      reservation: {
        ...data,
        import_notes_edited_by,
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al actualizar la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
