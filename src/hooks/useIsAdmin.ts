"use client";

import { useAuth } from "@/hooks/useAuth";

/**
 * Rol admin del usuario (cacheado en AuthContext; una sola petición por sesión).
 */
export function useIsAdmin() {
  const { isAdmin, isSuperAdmin, isAdminLoading, loading } = useAuth();

  return {
    isAdmin,
    isSuperAdmin,
    loading: loading || isAdminLoading,
  };
}
