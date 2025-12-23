import { createServiceRoleClient } from "./server";
import type { User } from "@supabase/supabase-js";

/**
 * Sincroniza un usuario de auth.users con la tabla public.users
 * y vincula sus reservas de invitado automáticamente.
 *
 * @param user - Usuario de Supabase Auth (debe tener id y email)
 * @returns Objeto con success y opcionalmente error
 */
export async function syncUserToDatabase(user: User): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!user.email) {
    return {
      success: false,
      error: "Usuario no tiene email",
    };
  }

  try {
    const serviceClient = createServiceRoleClient();
    const normalizedEmail = user.email.toLowerCase().trim();

    // 1. Insertar o actualizar en users (idempotente)
    const { error: upsertError } = await serviceClient.from("users").upsert(
      {
        id: user.id,
        email: normalizedEmail,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "id",
      }
    );

    if (upsertError) {
      console.error("Error syncing user to database:", upsertError);
      return {
        success: false,
        error: "Error al sincronizar usuario",
      };
    }

    // 2. Vincular reservas de invitado que tengan el mismo email
    const { error: linkError } = await serviceClient
      .from("reservations")
      .update({ user_id: user.id })
      .is("user_id", null)
      .ilike("email", normalizedEmail);

    if (linkError) {
      console.error("Error linking guest reservations:", linkError);
      // No retornamos error aquí, solo logueamos
      // La sincronización del usuario ya fue exitosa
    }

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al sincronizar usuario";
    console.error("Error inesperado en syncUserToDatabase:", error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
