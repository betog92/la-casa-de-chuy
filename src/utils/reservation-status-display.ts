import {
  getEffectiveReservationStatus,
  isReservationSessionPast,
} from "@/lib/reservations/session-lifecycle";

export {
  getEffectiveReservationStatus,
  isReservationSessionPast,
} from "@/lib/reservations/session-lifecycle";

export type ReservationStatusDisplayOptions = {
  rescheduleCount?: number;
  sessionDate?: string;
};

/**
 * Etiqueta UX del chip de estado (cuenta, detalle de reserva, etc.).
 */
export function getReservationStatusLabel(
  status: string,
  options?: ReservationStatusDisplayOptions,
): string {
  const effective =
    options?.sessionDate != null
      ? getEffectiveReservationStatus(status, options.sessionDate)
      : status;

  if (effective === "completed") {
    return "Realizada";
  }
  if (
    effective === "confirmed" &&
    options?.rescheduleCount &&
    options.rescheduleCount > 0
  ) {
    return "Reagendada";
  }

  const labels: Record<string, string> = {
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    completed: "Realizada",
  };
  return labels[effective] || effective;
}

export function getReservationStatusColor(
  status: string,
  options?: ReservationStatusDisplayOptions,
): string {
  const effective =
    options?.sessionDate != null
      ? getEffectiveReservationStatus(status, options.sessionDate)
      : status;

  if (effective === "completed") {
    return "bg-blue-100 text-blue-800";
  }
  if (
    effective === "confirmed" &&
    options?.rescheduleCount &&
    options.rescheduleCount > 0
  ) {
    return "bg-orange-100 text-orange-800";
  }

  const colors: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    completed: "bg-blue-100 text-blue-800",
  };
  return colors[effective] || "bg-zinc-100 text-zinc-800";
}

export function withEffectiveReservationStatus<
  T extends { status: string; date: string },
>(row: T): T {
  return {
    ...row,
    status: getEffectiveReservationStatus(row.status, row.date) as T["status"],
  };
}
