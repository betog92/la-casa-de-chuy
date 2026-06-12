import { isSessionType } from "@/utils/session-type";
import {
  normalizeStampCardCode,
} from "@/lib/admin/stamp-card-code";

/** Reserva creada en la web (Conekta); contacto no editable por nadie. */
export function isWebReservation(source: string | null | undefined): boolean {
  return source === "web";
}

/** Cita Alvero con cliente (panel admin o import Alberto). */
export function isAlveroClientReservation(reservation: {
  source?: string | null;
  import_type?: string | null;
}): boolean {
  return (
    (reservation.source === "admin" ||
      reservation.source === "google_import") &&
    reservation.import_type === "manual_client"
  );
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
  municipio: string;
  import_notes: string;
  stamp_card_code: string;
  photographer_studio: string;
  /** "" = sin tipo (null en BD) */
  session_type: string;
};

/** Solo incluye campos que realmente cambiaron (evita error API "sin campos"). */
export function buildReservationDetailPatch(
  reservation: {
    name: string;
    email: string;
    phone: string | null;
    order_number?: string | null;
    municipio?: string | null;
    import_notes?: string | null;
    stamp_card_code?: string | null;
    photographer_studio?: string | null;
    session_type?: string | null;
  },
  form: ReservationDetailEditForm,
  options: {
    includeContact?: boolean;
    includeOrderNumber?: boolean;
    includeMunicipio?: boolean;
    includeNotes?: boolean;
    includeStampCard?: boolean;
    includePhotographer?: boolean;
    includeSessionType?: boolean;
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
  }

  if (options.includeOrderNumber) {
    const order = form.order_number.trim() || null;
    const prevOrder = reservation.order_number ?? null;
    if (order !== prevOrder) patch.order_number = order;
  }

  if (options.includeMunicipio) {
    const municipio = form.municipio.trim() || null;
    const prevMunicipio = normalizeTrimmed(reservation.municipio);
    if (municipio !== prevMunicipio) patch.municipio = municipio;
  }

  if (options.includeNotes) {
    const next = normalizeImportNotesValue(form.import_notes);
    const prev = normalizeImportNotesValue(reservation.import_notes);
    if (next !== prev) patch.import_notes = next;
  }

  if (options.includeStampCard) {
    const next = normalizeStampCardCode(form.stamp_card_code);
    const prev = normalizeStampCardCode(reservation.stamp_card_code);
    if (next !== prev) patch.stamp_card_code = next;
  }

  if (options.includePhotographer) {
    const next = form.photographer_studio.trim() || null;
    const prev = reservation.photographer_studio?.trim() || null;
    if (next !== prev) patch.photographer_studio = next;
  }

  if (options.includeSessionType) {
    const raw = form.session_type.trim();
    const next = raw === "" ? null : raw;
    const prev = reservation.session_type ?? null;
    if (next !== prev && (next === null || isSessionType(next))) {
      patch.session_type = next;
    }
  }

  return patch;
}
