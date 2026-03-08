import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  forbiddenResponse,
} from "@/utils/api-response";

/**
 * PATCH: Marcar reserva como pagada (validar pago).
 * Solo super admin (Nancy) puede llamar este endpoint.
 * Aplica solo a reservas manuales cliente (source=admin, import_type null, payment_status pending).
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, isSuperAdmin } = await requireSuperAdmin();
  if (!isSuperAdmin) {
    return forbiddenResponse("Solo la super administradora puede validar pagos");
  }

  const { id } = await params;
  const reservationId = parseInt(id, 10);
  if (Number.isNaN(reservationId) || reservationId < 1) {
    return validationErrorResponse("ID de reserva inválido");
  }

  const supabase = createServiceRoleClient();
  const { data: reservation, error: fetchError } = await supabase
    .from("reservations")
    .select("id, source, import_type, payment_status, payment_method")
    .eq("id", reservationId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching reservation for payment-status:", fetchError);
    return errorResponse("Error al obtener la reserva", 500);
  }
  if (!reservation) {
    return errorResponse("Reserva no encontrada", 404);
  }

  const row = reservation as {
    id: number;
    source: string;
    import_type: string | null;
    payment_status: string | null;
    payment_method: string | null;
  };

  if (row.source !== "admin" || row.import_type != null) {
    return validationErrorResponse(
      "Solo se puede validar pago en reservas manuales de cliente (efectivo/transferencia)"
    );
  }
  if (row.payment_status !== "pending") {
    return validationErrorResponse(
      "Esta reserva no tiene pago pendiente de validar"
    );
  }

  const now = new Date().toISOString();
  const table = supabase.from("reservations");
  const { error: updateError } = await table.update({
    payment_status: "paid",
    payment_validated_at: now,
    payment_validated_by_user_id: adminUser?.id ?? null,
  } as Parameters<typeof table.update>[0]).eq("id", reservationId);

  if (updateError) {
    console.error("Error updating payment_status:", updateError);
    return errorResponse("Error al actualizar el estado de pago", 500);
  }

  return successResponse({
    message: "Pago validado correctamente",
    payment_status: "paid",
  });
}
