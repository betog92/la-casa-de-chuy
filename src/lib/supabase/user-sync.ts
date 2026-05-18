import { createServiceRoleClient } from "./server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

export type SyncUserResult = {
  success: boolean;
  error?: string;
  linkedReservationCount?: number;
};

/**
 * Sincroniza un usuario de auth.users con la tabla public.users
 * y vincula sus reservas de invitado automáticamente.
 *
 * La vinculación de reservas se ejecuta siempre, incluso si el upsert en
 * `public.users` falla (p. ej. por el trigger de código de referido). Antes
 * un fallo en el paso 1 abortaba el sync y las reservas quedaban huérfanas.
 *
 * @param user - Usuario de Supabase Auth (debe tener id y email)
 */
export async function syncUserToDatabase(user: User): Promise<SyncUserResult> {
  if (!user.email) {
    return {
      success: false,
      error: "Usuario no tiene email",
    };
  }

  try {
    const serviceClient = createServiceRoleClient();
    const normalizedEmail = user.email.toLowerCase().trim();

    // 1. Insertar o actualizar en users (idempotente). El trigger AFTER INSERT
    // asigna el código de referido; si falla, no bloqueamos la vinculación.
    const userData: UserInsert = {
      id: user.id,
      email: normalizedEmail,
      created_at: user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await serviceClient
      .from("users")
      // @ts-ignore - TypeScript tiene problemas con tipos de Supabase en upsert
      .upsert(userData, {
        onConflict: "id",
      });

    if (upsertError) {
      console.error("Error syncing user to database:", upsertError);
    }

    // 2. Vincular reservas de invitado con el mismo email (siempre, paso crítico)
    const { data: linkedRows, error: linkError } = await serviceClient
      .from("reservations")
      // @ts-ignore - TypeScript tiene problemas con tipos de Supabase en update
      .update({ user_id: user.id })
      .is("user_id", null)
      .ilike("email", normalizedEmail)
      .select("id");

    if (linkError) {
      console.error("Error linking guest reservations:", linkError);
      return {
        success: false,
        error: "Error al vincular reservas de invitado",
        linkedReservationCount: 0,
      };
    }

    const linkedReservationCount = linkedRows?.length ?? 0;

    // 3. Completar redeemed_user_id en redenciones hechas como invitado
    const { error: redemptionLinkError } = await serviceClient
      .from("referral_redemptions")
      // @ts-ignore
      .update({ redeemed_user_id: user.id })
      .is("redeemed_user_id", null)
      .ilike("redeemed_email", normalizedEmail);

    if (redemptionLinkError) {
      console.error(
        "[syncUserToDatabase] Error linking referral redemptions:",
        redemptionLinkError,
      );
    }

    if (upsertError) {
      // Perfil público falló: éxito parcial solo si se vincularon reservas;
      // si no había reservas de invitado, el usuario igual necesita public.users.
      return {
        success: linkedReservationCount > 0,
        error:
          linkedReservationCount > 0
            ? undefined
            : "Error al sincronizar usuario",
        linkedReservationCount,
      };
    }

    return { success: true, linkedReservationCount };
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
