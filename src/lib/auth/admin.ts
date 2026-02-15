import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export interface AdminCheckResult {
  user: { id: string; email: string } | null;
  isAdmin: boolean;
}

/**
 * Verifica si el usuario actual está autenticado y tiene permisos de admin.
 * Usa las cookies de sesión y consulta la tabla users para is_admin.
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
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.id) {
    return { user: null, isAdmin: false };
  }

  const supabase = createServiceRoleClient();
  const { data: userRow, error } = await supabase
    .from("users")
    .select("id, email, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !userRow) {
    return { user: null, isAdmin: false };
  }

  const row = userRow as { id: string; email: string; is_admin: boolean };
  const isAdmin = row.is_admin === true;

  return {
    user: { id: row.id, email: row.email },
    isAdmin,
  };
}
