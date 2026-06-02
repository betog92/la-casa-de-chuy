/** Enlaces del panel admin (sidebar y menú móvil). */
export type AdminNavItem = {
  href: string;
  label: string;
  /** Solo familia (is_super_admin): ingresos, finanzas, configuración. */
  superAdminOnly?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", superAdminOnly: true },
  { href: "/admin/calendario", label: "Calendario" },
  { href: "/admin/reservaciones", label: "Reservaciones" },
  { href: "/admin/pagos-manuales", label: "Pagos manuales", superAdminOnly: true },
  { href: "/admin/reembolsos", label: "Reembolsos", superAdminOnly: true },
  { href: "/admin/clientes", label: "Clientes", superAdminOnly: true },
  { href: "/admin/disponibilidad", label: "Disponibilidad" },
  { href: "/admin/codigos", label: "Códigos de descuento", superAdminOnly: true },
  { href: "/admin/galeria", label: "Galería", superAdminOnly: true },
];
