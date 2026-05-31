import { getMonterreyDayBounds } from "@/utils/business-days";

/** Estados de reserva que cuentan para nivel de fidelización (sesión válida, no cancelada). */
export const TIER_ELIGIBLE_RESERVATION_STATUSES = [
  "confirmed",
  "completed",
] as const;

export type TierEligibleReservationStatus =
  (typeof TIER_ELIGIBLE_RESERVATION_STATUSES)[number];

/**
 * La sesión ya pasó: fecha de la cita (America/Monterrey) es anterior a hoy.
 * El mismo día de la sesión sigue mostrándose como confirmada hasta el día siguiente.
 */
export function isReservationSessionPast(sessionDate: string): boolean {
  const trimmed = sessionDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  // Comparación lexicográfica en yyyy-MM-dd (misma lógica que el cron `.lt("date", today)`).
  return trimmed < getMonterreyTodayDateString();
}

/**
 * Estado para mostrar en UI y persistir vía cron.
 * `confirmed` + fecha pasada → `completed`.
 */
export function getEffectiveReservationStatus(
  dbStatus: string,
  sessionDate: string,
): string {
  if (
    dbStatus === "confirmed" &&
    isReservationSessionPast(sessionDate)
  ) {
    return "completed";
  }
  return dbStatus;
}

/** Fecha (yyyy-MM-dd) en Monterrey para comparar en cron. */
export function getMonterreyTodayDateString(): string {
  return getMonterreyDayBounds().dateStr;
}
