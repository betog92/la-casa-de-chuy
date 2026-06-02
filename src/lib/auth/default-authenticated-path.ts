import { getDefaultAdminHomePath } from "@/lib/auth/admin-access";

/**
 * Ruta por defecto tras login o verificación de email.
 * Super admin (familia) → dashboard; empleadas → calendario; clientes → cuenta.
 */
export async function fetchDefaultAuthenticatedPath(): Promise<string> {
  try {
    const res = await fetch("/api/users/me");
    const data = await res.json();
    if (data.success === true && data.isAdmin === true) {
      return getDefaultAdminHomePath(data.isSuperAdmin === true);
    }
  } catch {
    // fallback cliente
  }
  return "/account";
}
