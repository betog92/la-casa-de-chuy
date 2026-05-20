import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import {
  successResponse,
  unauthorizedResponse,
} from "@/utils/api-response";

/**
 * Rol del usuario autenticado (200 siempre si hay sesión; sin 403).
 * Usado por el menú y redirects post-login.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return unauthorizedResponse("Debes iniciar sesión");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  const row = profile as {
    is_admin?: boolean;
    is_super_admin?: boolean;
  } | null;

  return successResponse({
    isAdmin: row?.is_admin === true,
    isSuperAdmin: row?.is_super_admin === true,
  });
}
