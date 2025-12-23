import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import type { NextRequest } from "next/server";

/**
 * Crea un cliente de Supabase con Service Role Key para uso en API routes
 * Este cliente bypassa RLS (Row Level Security)
 *
 * @throws Error si faltan variables de entorno requeridas
 */
export function createServiceRoleClient() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase configuration missing");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Crea un cliente de Supabase autenticado para uso en API routes
 * Este cliente respeta RLS y la autenticación del usuario
 *
 * @param request - NextRequest object para acceder a las cookies
 * @returns Cliente de Supabase autenticado
 */
export function createAuthenticatedClient(request: NextRequest) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // En API routes, no podemos establecer cookies directamente en la request
          // Las cookies se establecen a través de la respuesta
          // Esta función está aquí para compatibilidad con la API de Supabase SSR
        },
      },
    }
  );
}
