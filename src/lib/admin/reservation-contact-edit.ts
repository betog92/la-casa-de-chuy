/** Reserva creada en la web (Conekta); contacto no editable por nadie. */
export function isWebReservation(source: string | null | undefined): boolean {
  return source === "web";
}

/**
 * Reservas manuales del panel o import (Alvero, cliente efectivo/transferencia).
 * Excluye bloqueos `manual_available` y reservas web.
 */
export function canSuperAdminEditReservationContact(reservation: {
  source?: string | null;
  import_type?: string | null;
}): boolean {
  if (isWebReservation(reservation.source ?? null)) return false;
  if (
    reservation.source === "admin" ||
    reservation.source === "google_import"
  ) {
    return reservation.import_type !== "manual_available";
  }
  return false;
}

/** Notas de import / detalles de cita (no aplica a reservas web). */
export function canAdminEditImportNotes(reservation: {
  source?: string | null;
}): boolean {
  return (
    reservation.source === "admin" || reservation.source === "google_import"
  );
}
