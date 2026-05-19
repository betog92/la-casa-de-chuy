import { isSafeRedirectPath } from "@/utils/safe-redirect";

export type SignUpContact = {
  name: string;
  phone: string;
  /** Ruta interna post-verificación (p. ej. reclamar Monedas). */
  redirectAfterVerify?: string;
};

export function buildSignUpMetadata(contact: SignUpContact): Record<string, string> {
  const data: Record<string, string> = {
    name: contact.name.trim(),
    phone: contact.phone,
  };
  if (
    contact.redirectAfterVerify &&
    isSafeRedirectPath(contact.redirectAfterVerify)
  ) {
    data.redirect_after_verify = contact.redirectAfterVerify.trim();
  }
  return data;
}

export function readRedirectAfterVerify(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const raw = metadata?.redirect_after_verify;
  if (typeof raw !== "string" || !isSafeRedirectPath(raw)) return undefined;
  return raw.trim();
}
