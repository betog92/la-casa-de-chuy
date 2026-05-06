/** Enlaces del panel admin (sidebar y menú móvil). */
export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/calendario", label: "Calendario" },
  { href: "/admin/reservaciones", label: "Reservaciones" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/disponibilidad", label: "Disponibilidad" },
  { href: "/admin/codigos", label: "Códigos de descuento" },
  { href: "/admin/galeria", label: "Galería" },
] as const;
