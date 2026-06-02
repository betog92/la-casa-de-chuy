import { ADMIN_NAV_ITEMS } from "@/constants/admin-nav";

/**
 * Permisos de panel (resumen operativo):
 *
 * Super admin (familia): todo el menú + validar pagos manuales + listado /admin/reembolsos
 * + sync calendario (legacy).
 *
 * Admin empleada: calendario (vestidos incl. borrar), reservaciones (todas las variantes),
 * reintentar reembolso desde detalle de reserva cancelada.
 * disponibilidad, cancelar/reagendar con reglas de admin, ver montos e IDs de pago,
 * crear manuales con precio (validación de cobro la hace familia).
 */

/** Prefijos derivados del menú (evita desincronizar rutas y nav). */
const SUPER_ADMIN_ONLY_PREFIXES = ADMIN_NAV_ITEMS.filter(
  (item) => item.superAdminOnly && item.href !== "/admin",
).map((item) => item.href);

export function filterAdminNavItems(isSuperAdmin: boolean) {
  return ADMIN_NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || isSuperAdmin,
  );
}

export function isSuperAdminOnlyAdminPath(pathname: string): boolean {
  if (pathname === "/admin") return true;
  return SUPER_ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Destino tras login o al bloquear una ruta de super admin. */
export function getDefaultAdminHomePath(isSuperAdmin: boolean): string {
  return isSuperAdmin ? "/admin" : "/admin/calendario";
}
