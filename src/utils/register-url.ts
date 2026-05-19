import { isSafeRedirectPath } from "@/utils/safe-redirect";

export type RegisterUrlParams = {
  email?: string;
  name?: string;
  phone?: string;
  redirect?: string;
};

/**
 * URL de registro con query params opcionales (precarga desde reserva invitado, etc.).
 */
export function buildRegisterHref(params: RegisterUrlParams): string {
  const search = new URLSearchParams();
  const email = params.email?.trim();
  const name = params.name?.trim();
  const phone = params.phone?.trim();
  const redirect = params.redirect?.trim();

  if (email) search.set("email", email);
  if (name) search.set("name", name);
  if (phone) search.set("phone", phone);
  if (redirect && isSafeRedirectPath(redirect)) search.set("redirect", redirect);

  const qs = search.toString();
  return qs ? `/auth/register?${qs}` : "/auth/register";
}
