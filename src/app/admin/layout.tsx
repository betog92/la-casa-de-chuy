"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/calendario", label: "Calendario" },
  { href: "/admin/reservaciones", label: "Reservaciones" },
  { href: "/admin/disponibilidad", label: "Disponibilidad" },
  { href: "/admin/codigos", label: "Códigos de descuento" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AdminGuard>
      <div className="min-h-screen bg-zinc-50">
        <div className="flex">
          {/* Sidebar - dentro del contenido, alineado arriba */}
          <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white">
            <nav className="space-y-0.5 p-4">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-[#103948]/10 text-[#103948]"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-zinc-200 p-3">
              <Link
                href="/"
                className="block rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                ← Volver al sitio
              </Link>
            </div>
          </aside>

          {/* Main content */}
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
