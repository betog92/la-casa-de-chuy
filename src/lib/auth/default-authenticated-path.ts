/**
 * Ruta por defecto tras login o verificación de email.
 * Admins → panel; clientes → cuenta.
 */
export async function fetchDefaultAuthenticatedPath(): Promise<string> {
  try {
    const res = await fetch("/api/users/me");
    const data = await res.json();
    if (data.success === true && data.isAdmin === true) {
      return "/admin";
    }
  } catch {
    // fallback cliente
  }
  return "/account";
}
