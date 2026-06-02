"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { useAuth } from "@/hooks/useAuth";
import { filterAdminNavItems } from "@/lib/auth/admin-access";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading: authLoading, isSuperAdmin, isAdminLoading } = useAuth();
  const navLoading = authLoading || (!!user?.id && isAdminLoading);
  const navItems = filterAdminNavItems(isSuperAdmin);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-zinc-50">
        <div className="flex">
          <aside className="hidden md:block w-56 shrink-0 border-r border-zinc-200 bg-white">
            <nav className="space-y-0.5 p-4">
              {!navLoading &&
                navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/admin" &&
                      pathname.startsWith(item.href));
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
            <div className="border-t border-zinc-200 p-3 space-y-0.5">
              <Link
                href="/account"
                className="block rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Vista cliente
              </Link>
              <Link
                href="/"
                className="block rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                ← Volver al sitio
              </Link>
            </div>
          </aside>

          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
