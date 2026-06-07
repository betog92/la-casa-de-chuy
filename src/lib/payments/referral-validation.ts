import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ensurePublicUserRow } from "@/lib/supabase/user-sync";

/**
 * Configuración de negocio del programa de referidos V2.
 * Centralizado aquí para que `pricing-server.ts`, `finalize-reservation.ts`
 * y la UI ("Gana $200 por cada amigo que refieras") usen la misma fuente.
 */
export const REFERRAL_INVITEE_DISCOUNT_MXN = 100 as const;
export const REFERRAL_REFERRER_CREDIT_MXN = 200 as const;

type ReferralCodeRow = Database["public"]["Tables"]["referral_codes"]["Row"];

/**
 * Resultado de validación del código de referido para el checkout.
 * El servidor devuelve datos suficientes para:
 *   1. Aplicar el descuento al invitado en `pricing-server.ts`.
 *   2. Insertar la `referral_redemption` y acreditar al referidor en
 *      `finalize-reservation.ts` cuando el pago se confirma.
 */
export type ReferralValidationResult =
  | {
      ok: true;
      referralCodeId: string;
      referrerUserId: string;
      code: string;
      /** Monto en MXN a descontar al invitado en checkout. Fijo. */
      inviteeDiscountAmount: number;
      /** Monto en MXN a acreditar al referidor cuando se cierra el pago. */
      referrerCreditAmount: number;
    }
  | { ok: false; message: string };

type ReferrerEmailLookup =
  | { ok: true; email: string }
  | { ok: false; message: string };

/**
 * Resuelve el email del referidor desde `public.users`, con fallback a
 * `auth.users` y reparación best-effort del perfil público si falta.
 */
async function resolveReferrerEmail(
  supabase: SupabaseClient<Database>,
  referrerUserId: string,
): Promise<ReferrerEmailLookup> {
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("email")
    .eq("id", referrerUserId)
    .maybeSingle();

  if (profileError) {
    console.error(
      "[referral-validation] Error consultando email del referidor:",
      profileError,
    );
    return {
      ok: false,
      message: "No se pudo validar el referido. Intenta de nuevo.",
    };
  }

  const profileEmail = (profile as { email: string } | null)?.email;
  if (profileEmail) {
    return {
      ok: true,
      email: profileEmail.toLowerCase().trim(),
    };
  }

  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(referrerUserId);

  if (authError || !authData?.user?.email) {
    console.error(
      "[referral-validation] Referidor sin perfil en public.users ni auth:",
      referrerUserId,
      authError,
    );
    return {
      ok: false,
      message: "Este código no es válido en este momento.",
    };
  }

  const email = authData.user.email.toLowerCase().trim();
  const repair = await ensurePublicUserRow(supabase, authData.user);
  if (!repair.ok) {
    console.warn(
      "[referral-validation] No se pudo reparar public.users del referidor:",
      referrerUserId,
      repair.error,
    );
  }

  return { ok: true, email };
}

/**
 * Valida un código de referido contra la nueva tabla `referral_codes`.
 *
 * Reglas:
 *   - Código existe y está `active`.
 *   - El email del invitado nunca ha reservado antes (`confirmed`/`completed`).
 *   - El email del invitado no es el del referidor (no auto-referido).
 *   - No existe ya una `referral_redemption` para (código, email) — un mismo
 *     amigo solo puede redimir el código una vez aunque cancele.
 *
 * NOTA: el email es OBLIGATORIO. La regla "primera reserva" se ancla al
 * email del checkout porque es lo único que tienen los invitados sin cuenta.
 */
export async function validateReferralForReservationPrice(
  supabase: SupabaseClient<Database>,
  args: {
    codeRaw: string | null | undefined;
    contactEmail: string;
    /** ID del usuario autenticado en el checkout (si aplica). */
    resolvedUserId: string | null;
  },
): Promise<ReferralValidationResult> {
  const codeTrim = typeof args.codeRaw === "string" ? args.codeRaw.trim() : "";
  if (!codeTrim) {
    return { ok: false, message: "Código de referido requerido." };
  }

  const codeUpper = codeTrim.toUpperCase();
  const normalizedEmail = (args.contactEmail || "").toLowerCase().trim();
  if (!normalizedEmail) {
    return {
      ok: false,
      message:
        "Se requiere un correo válido para validar el código de referido.",
    };
  }

  const { data: referralCode, error: codeError } = await supabase
    .from("referral_codes")
    .select("id, user_id, code, active")
    .eq("code", codeUpper)
    .maybeSingle();

  if (codeError || !referralCode) {
    return {
      ok: false,
      message: `El código "${codeUpper}" no es válido.`,
    };
  }

  const code = referralCode as Pick<
    ReferralCodeRow,
    "id" | "user_id" | "code" | "active"
  >;

  if (!code.active) {
    return {
      ok: false,
      message: "Este código de referido ya no está activo.",
    };
  }

  // Check rápido de auto-referido por user_id (sin query extra).
  if (args.resolvedUserId && code.user_id === args.resolvedUserId) {
    return {
      ok: false,
      message: "No puedes usar tu propio código de referido.",
    };
  }

  // En paralelo: reservas previas del invitado, redenciones previas y email del
  // referidor (con fallback a auth.users si falta public.users).
  const [reservationsRes, redemptionRes, referrerEmailRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "completed"])
      .eq("email", normalizedEmail),
    supabase
      .from("referral_redemptions")
      .select("id")
      .eq("referral_code_id", code.id)
      .eq("redeemed_email", normalizedEmail)
      .maybeSingle(),
    resolveReferrerEmail(supabase, code.user_id),
  ]);

  if (reservationsRes.error) {
    console.error(
      "[referral-validation] Error contando reservas previas:",
      reservationsRes.error,
    );
    return {
      ok: false,
      message: "No se pudo validar el referido. Intenta de nuevo.",
    };
  }

  // Regla "primera reserva del invitado": cualquier reserva confirmed/completed
  // con este correo descalifica.
  if ((reservationsRes.count ?? 0) > 0) {
    return {
      ok: false,
      message:
        "El descuento por referido solo aplica en tu primera reserva con este correo.",
    };
  }

  if (redemptionRes.error) {
    console.error(
      "[referral-validation] Error consultando redemptions previas:",
      redemptionRes.error,
    );
    return {
      ok: false,
      message: "No se pudo validar el referido. Intenta de nuevo.",
    };
  }

  // Idempotencia: si ya hubo una redención para este (código, email), no
  // se puede redimir de nuevo aunque la reserva previa se haya cancelado
  // (evita ciclos cancel→re-redeem para drenar créditos al referidor).
  if (redemptionRes.data) {
    return {
      ok: false,
      message: "Ya redimiste este código de referido anteriormente.",
    };
  }

  if (!referrerEmailRes.ok) {
    return { ok: false, message: referrerEmailRes.message };
  }

  // Auto-referido por email (caso: invitado sin sesión usa el código del
  // dueño de la cuenta).
  const referrerEmail = referrerEmailRes.email;
  if (referrerEmail === normalizedEmail) {
    return {
      ok: false,
      message: "No puedes usar tu propio código de referido.",
    };
  }

  return {
    ok: true,
    referralCodeId: code.id,
    referrerUserId: code.user_id,
    code: code.code,
    inviteeDiscountAmount: REFERRAL_INVITEE_DISCOUNT_MXN,
    referrerCreditAmount: REFERRAL_REFERRER_CREDIT_MXN,
  };
}
