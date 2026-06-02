import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export interface AdminCheckResult {
  user: { id: string; email: string } | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

type AdminRoleRow = {
  id: string;
  email: string;
  is_admin: boolean;
  is_super_admin?: boolean;
};

/** Una sola consulta a public.users por id (reutilizable tras auth.getUser). */
export async function lookupAdminRolesForUserId(userId: string) {
  const supabase = createServiceRoleClient();
  const { data: userRow, error } = await supabase
    .from("users")
    .select("id, email, is_admin, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !userRow) {
    return { isAdmin: false, isSuperAdmin: false, email: null as string | null };
  }

  const row = userRow as AdminRoleRow;
  return {
    isAdmin: row.is_admin === true,
    isSuperAdmin: row.is_super_admin === true,
    email: row.email,
  };
}

/**
 * Verifica si el usuario actual está autenticado y tiene permisos de admin.
 * Usa las cookies de sesión y consulta la tabla users para is_admin e is_super_admin.
 *
 * Roles:
 * - is_super_admin: familia (Nancy, Beto, Julio) — panel completo y finanzas.
 * - is_admin sin super: empleadas (Yaretzi, Alejandra) — calendario, reservas, disponibilidad.
 */
export async function requireAdmin(): Promise<AdminCheckResult> {
  const cookieStore = await cookies();
  const authClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No necesario para verificación de lectura
        },
      },
    },
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.id) {
    return { user: null, isAdmin: false, isSuperAdmin: false };
  }

  const roles = await lookupAdminRolesForUserId(user.id);
  if (!roles.email) {
    return { user: null, isAdmin: false, isSuperAdmin: false };
  }

  return {
    user: { id: user.id, email: roles.email },
    isAdmin: roles.isAdmin,
    isSuperAdmin: roles.isSuperAdmin,
  };
}

/**
 * Exige familia (is_super_admin). Empleadas con is_admin no pasan.
 * Usar en dashboard, reembolsos, clientes, galería, códigos y validación de pagos.
 */
export async function requireSuperAdmin(): Promise<AdminCheckResult> {
  const result = await requireAdmin();
  if (!result.isAdmin || !result.isSuperAdmin) {
    return { ...result, isSuperAdmin: false };
  }
  return result;
}
