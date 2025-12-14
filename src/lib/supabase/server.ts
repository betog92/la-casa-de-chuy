import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

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
