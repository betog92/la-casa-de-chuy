/**
 * Lógica compartida para rellenar name/phone en public.users desde reservas o checkout.
 */

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
      phoneToSet = row.phone.trim();
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
