import { createServiceRoleClient } from "./server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  type ContactSource,
  type ProfileContact,
  contactFromAuthMetadata,
  isProfileContactComplete,
  pickContactFieldsToFill,
} from "@/lib/user-profile-contact";

type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type SyncUserResult = {
  success: boolean;
  error?: string;
  linkedReservationCount?: number;
  /** Sync omitido: perfil completo y sin reservas de invitado pendientes */
  skipped?: boolean;
  /** Reservas vinculadas pero falló crear/actualizar public.users */
  partialProfile?: boolean;
};

async function patchUserContact(
  serviceClient: ServiceClient,
  userId: string,
  sources: ContactSource[],
): Promise<void> {
  const { data: profile, error: profileError } = await serviceClient
    .from("users")
    .select("name, phone")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) return;

  const patch = pickContactFieldsToFill(profile as ProfileContact, sources);
  if (!patch) return;

  const { error: updateError } = await serviceClient
    .from("users")
    // @ts-ignore
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    console.error(
      "[syncUserToDatabase] Error actualizando name/phone:",
      updateError,
    );
  }
}

async function linkReferralRedemptions(
  serviceClient: ServiceClient,
  userId: string,
  normalizedEmail: string,
): Promise<void> {
  const { error } = await serviceClient
    .from("referral_redemptions")
    // @ts-ignore
    .update({ redeemed_user_id: userId })
    .is("redeemed_user_id", null)
    .ilike("redeemed_email", normalizedEmail);

  if (error) {
    console.error(
      "[syncUserToDatabase] Error linking referral redemptions:",
      error,
    );
  }
}

/**
 * Sincroniza un usuario de auth.users con la tabla public.users
 * y vincula sus reservas de invitado automáticamente.
 *
 * La vinculación de reservas se ejecuta siempre que haya pendientes, incluso si
 * el upsert en `public.users` falla (p. ej. trigger de código de referido).
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

    const [profileRes, guestResRes] = await Promise.all([
      serviceClient
        .from("users")
        .select("name, phone")
        .eq("id", user.id)
        .maybeSingle(),
      serviceClient
        .from("reservations")
        .select("id, name, phone")
        .is("user_id", null)
        .ilike("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const profileExists = Boolean(profileRes.data && !profileRes.error);
    const currentProfile: ProfileContact = profileRes.data
      ? {
          name: (profileRes.data as ProfileContact).name,
          phone: (profileRes.data as ProfileContact).phone,
        }
      : { name: null, phone: null };

    const guestReservations = (guestResRes.data ?? []) as ContactSource[];
    const metadataContact = contactFromAuthMetadata(user);
    const contactSourcesForFill: ContactSource[] = [
      ...(metadataContact ? [metadataContact] : []),
      ...guestReservations,
    ];
    const hasUnlinkedReservations = guestReservations.length > 0;

    // Magic link / re-login: nada pendiente → evitar queries extra
    if (
      profileExists &&
      isProfileContactComplete(currentProfile) &&
      !hasUnlinkedReservations
    ) {
      // Un update barato por si quedó redemption sin redeemed_user_id
      await linkReferralRedemptions(serviceClient, user.id, normalizedEmail);
      return {
        success: true,
        linkedReservationCount: 0,
        skipped: true,
      };
    }

    const contactForUpsert = pickContactFieldsToFill(
      profileExists ? currentProfile : { name: null, phone: null },
      contactSourcesForFill,
    );

    const userData: UserInsert = {
      id: user.id,
      email: normalizedEmail,
      updated_at: new Date().toISOString(),
    };
    if (!profileExists) {
      userData.created_at = user.created_at || new Date().toISOString();
    }
    if (contactForUpsert?.name) userData.name = contactForUpsert.name;
    if (contactForUpsert?.phone) userData.phone = contactForUpsert.phone;

    const { error: upsertError } = await serviceClient
      .from("users")
      // @ts-ignore
      .upsert(userData, {
        onConflict: "id",
      });

    if (upsertError) {
      console.error("Error syncing user to database:", upsertError);
    }

    let linkedReservationCount = 0;
    if (hasUnlinkedReservations) {
      const { data: linkedRows, error: linkError } = await serviceClient
        .from("reservations")
        // @ts-ignore
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
      linkedReservationCount = linkedRows?.length ?? 0;
    }

    let contactSources: ContactSource[] = contactSourcesForFill;

    // Reparación: perfil vacío pero reservas ya vinculadas en un sync anterior
    if (
      guestReservations.length === 0 &&
      !isProfileContactComplete(currentProfile)
    ) {
      const { data: ownedReservations } = await serviceClient
        .from("reservations")
        .select("name, phone")
        .eq("user_id", user.id)
        .ilike("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(10);
      contactSources = [
        ...(metadataContact ? [metadataContact] : []),
        ...((ownedReservations ?? []) as ContactSource[]),
      ];
    }

    await Promise.all([
      linkReferralRedemptions(serviceClient, user.id, normalizedEmail),
      patchUserContact(serviceClient, user.id, contactSources),
    ]);

    const partialProfile = Boolean(upsertError && linkedReservationCount > 0);

    if (upsertError) {
      if (partialProfile) {
        console.warn(
          "[syncUserToDatabase] Éxito parcial: reservas vinculadas sin fila estable en public.users",
          { userId: user.id, email: normalizedEmail, linkedReservationCount },
        );
      }
      return {
        success: linkedReservationCount > 0,
        partialProfile,
        error:
          linkedReservationCount > 0
            ? undefined
            : "Error al sincronizar usuario",
        linkedReservationCount,
      };
    }

    return {
      success: true,
      linkedReservationCount,
      partialProfile: false,
    };
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
