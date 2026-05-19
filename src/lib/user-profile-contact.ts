/**
 * Lógica compartida para rellenar name/phone en public.users desde reservas o checkout.
 */

import type { User } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/validation/contact-fields";

export type ProfileContact = {
  name: string | null;
  phone: string | null;
};

export type ContactSource = {
  name?: string | null;
  phone?: string | null;
};

export function isProfileContactComplete(
  profile: ProfileContact | null | undefined,
): boolean {
  return Boolean(profile?.name?.trim() && profile?.phone?.trim());
}

/** Contacto capturado en registro (Supabase Auth user_metadata). */
export function contactFromAuthMetadata(user: User): ContactSource | null {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== "object") return null;

  const name =
    typeof meta.name === "string" && meta.name.trim()
      ? meta.name.trim()
      : undefined;
  const phoneRaw =
    typeof meta.phone === "string" ? meta.phone.trim() : "";
  const phoneDigits = phoneRaw ? normalizePhone(phoneRaw) : "";

  if (!name && !phoneDigits) return null;

  return {
    name,
    phone: phoneDigits || undefined,
  };
}

/**
 * Devuelve los campos a escribir en `users` (solo huecos vacíos en el perfil).
 * Recorre `sources` en orden (p. ej. reservas más recientes primero).
 */
export function pickContactFieldsToFill(
  current: ProfileContact,
  sources: ContactSource[],
): { name?: string; phone?: string } | null {
  if (isProfileContactComplete(current)) return null;

  let nameToSet: string | undefined;
  let phoneToSet: string | undefined;

  for (const row of sources) {
    if (!nameToSet && !current.name?.trim() && row.name?.trim()) {
      nameToSet = row.name.trim();
    }
    if (!phoneToSet && !current.phone?.trim() && row.phone?.trim()) {
      phoneToSet = normalizePhone(row.phone);
    }
    if (nameToSet && phoneToSet) break;
    if (
      (current.name?.trim() || nameToSet) &&
      (current.phone?.trim() || phoneToSet)
    ) {
      break;
    }
  }

  if (!nameToSet && !phoneToSet) return null;

  const patch: { name?: string; phone?: string } = {};
  if (nameToSet) patch.name = nameToSet;
  if (phoneToSet) patch.phone = phoneToSet;
  return patch;
}
