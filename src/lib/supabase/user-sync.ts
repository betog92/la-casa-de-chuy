import { createServiceRoleClient } from "./server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

type ReservationContact = {
  name: string;
  phone: string;
};

/**
 * Rellena name/phone en public.users desde reservas del mismo email si el perfil
 * aún no los tiene (misma lógica que finalize-reservation para usuarios logueados).
 */
async function backfillProfileFromReservations(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  normalizedEmail: string,
): Promise<void> {
  const { data: profile, error: profileError } = await serviceClient
    .from("users")
    .select("name, phone")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) return;

  const current = profile as { name: string | null; phone: string | null };
  if (current.name?.trim() && current.phone?.trim()) return;

  const { data: reservations, error: resError } = await serviceClient
    .from("reservations")
    .select("name, phone, created_at")
    .eq("user_id", userId)
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(10);

  if (resError || !reservations?.length) return;

  let nameToSet: string | undefined;
  let phoneToSet: string | undefined;

  for (const row of reservations as ReservationContact[]) {
    if (!nameToSet && !current.name?.trim() && row.name?.trim()) {
      nameToSet = row.name.trim();
    }
    if (!phoneToSet && !current.phone?.trim() && row.phone?.trim()) {
      phoneToSet = row.phone.trim();
    }
    if (nameToSet && phoneToSet) break;
    if (
      (current.name?.trim() || nameToSet) &&
      (current.phone?.trim() || phoneToSet)
    ) {
      break;
    }
  }

  if (!nameToSet && !phoneToSet) return;

  const updateData: { name?: string; phone?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (nameToSet) updateData.name = nameToSet;
  if (phoneToSet) updateData.phone = phoneToSet;

  const { error: updateError } = await serviceClient
    .from("users")
    // @ts-ignore
    .update(updateData)
    .eq("id", userId);

  if (updateError) {
    console.error(
      "[syncUserToDatabase] Error backfilling name/phone from reservations:",
      updateError,
    );
  }
}

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

    // 4. Copiar nombre/teléfono de reservas vinculadas si el perfil está vacío
    await backfillProfileFromReservations(
      serviceClient,
      user.id,
      normalizedEmail,
    );

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
