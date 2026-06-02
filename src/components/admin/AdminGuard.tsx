"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getDefaultAdminHomePath,
  isSuperAdminOnlyAdminPath,
} from "@/lib/auth/admin-access";
import { useAuth } from "@/hooks/useAuth";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading, isAdmin, isSuperAdmin, isAdminLoading } =
    useAuth();

  const roleLoading = authLoading || (!!user?.id && isAdminLoading);
  const accessDenied = !!user?.id && !isAdminLoading && !isAdmin;

  useEffect(() => {
    if (roleLoading) return;

    if (!user?.id) {
      router.replace("/auth/login?redirect=/admin");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    if (!isSuperAdmin && isSuperAdminOnlyAdminPath(pathname)) {
      router.replace(getDefaultAdminHomePath(false));
    }
  }, [roleLoading, user?.id, isAdmin, isSuperAdmin, pathname, router]);

  if (roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#103948]" />
          <p className="mt-4 text-zinc-600">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-center text-zinc-600">Redirigiendo…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-center text-zinc-600">
          {accessDenied
            ? "No tienes permisos para acceder al panel."
            : "Redirigiendo…"}
        </p>
      </div>
    );
  }

  if (!isSuperAdmin && isSuperAdminOnlyAdminPath(pathname)) {
    return null;
  }

  return <>{children}</>;
}
