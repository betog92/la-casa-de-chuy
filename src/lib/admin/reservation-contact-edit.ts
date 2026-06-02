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

/**
 * Notas internas editables por admins (La Casa de Chuy manual/web, import, Alvero).
 * Excluye bloqueos `manual_available` sin cliente.
 */
export function canAdminEditImportNotes(reservation: {
  source?: string | null;
  import_type?: string | null;
}): boolean {
  if (reservation.import_type === "manual_available") return false;
  const source = reservation.source ?? null;
  return source === "web" || source === "admin" || source === "google_import";
}

/** UI de notas en detalle: Alvero ya las muestra en su rama; el resto usa el bloque Casa de Chuy/web. */
export function showAdminNotesInContactSection(reservation: {
  source?: string | null;
  import_type?: string | null;
}): boolean {
  return (
    canAdminEditImportNotes(reservation) &&
    reservation.import_type !== "manual_client"
  );
}

function normalizeTrimmed(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const t = String(value).trim();
  return t === "" ? null : t;
}

/** Compara notas como en PATCH (trim; vacío → null). */
export function normalizeImportNotesValue(
  value: string | null | undefined,
): string | null {
  return normalizeTrimmed(value);
}

type ReservationDetailEditForm = {
  name: string;
  email: string;
  phone: string;
  order_number: string;
  import_notes: string;
  photographer_studio: string;
};

/** Solo incluye campos que realmente cambiaron (evita error API "sin campos"). */
export function buildReservationDetailPatch(
  reservation: {
    name: string;
    email: string;
    phone: string | null;
    order_number?: string | null;
    import_notes?: string | null;
    photographer_studio?: string | null;
  },
  form: ReservationDetailEditForm,
  options: {
    includeContact?: boolean;
    includeNotes?: boolean;
    includePhotographer?: boolean;
  },
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};

  if (options.includeContact) {
    const name = form.name.trim();
    if (name !== reservation.name) patch.name = name;

    const email = form.email.trim().toLowerCase();
    if (email !== reservation.email.trim().toLowerCase()) patch.email = email;

    const phone = form.phone.trim();
    if (phone !== (reservation.phone ?? "").trim()) patch.phone = phone;

    const order = form.order_number.trim() || null;
    const prevOrder = reservation.order_number ?? null;
    if (order !== prevOrder) patch.order_number = order;
  }

  if (options.includeNotes) {
    const next = normalizeImportNotesValue(form.import_notes);
    const prev = normalizeImportNotesValue(reservation.import_notes);
    if (next !== prev) patch.import_notes = next;
  }

  if (options.includePhotographer) {
    const next = form.photographer_studio.trim() || null;
    const prev = reservation.photographer_studio?.trim() || null;
    if (next !== prev) patch.photographer_studio = next;
  }

  return patch;
}
