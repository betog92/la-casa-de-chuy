import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getMonterreyToday } from "@/utils/business-days";
import { validateReferralForReservationPrice } from "@/lib/payments/referral-validation";

export type CheckoutCodeType = "discount" | "referral";

/**
 * Resultado unificado de `/api/codes/validate`.
 * - `discount`: cupón de marketing con porcentaje.
 * - `referral`: código de referido con monto fijo (no %).
 */
export type ValidateCheckoutCodeSuccess =
  | {
      ok: true;
      type: "discount";
      code: string;
      discountPercentage: number;
      description: string | null;
    }
  | {
      ok: true;
      type: "referral";
      code: string;
      /** Monto fijo a descontar al invitado en el checkout (MXN). */
      inviteeDiscountAmount: number;
      /** Solo informativo: monto en créditos que ganará el referidor. */
      referrerCreditAmount: number;
    };

export type ValidateCheckoutCodeFailure = {
  ok: false;
  message: string;
};

/**
 * Un solo código en checkout: primero busca en `discount_codes`, si no existe
 * valida como referido. El cliente solo ve un campo "Código".
 *
 * Estrategia: si el código existe como cupón pero está inválido (vencido,
 * inactivo, etc.), devolvemos ese error en vez de intentar como referido
 * (no engañar al cliente sobre por qué su cupón conocido no jala).
 */
export async function validateCheckoutCode(
  supabase: SupabaseClient<Database>,
  args: { codeRaw: string; contactEmail?: string | null },
): Promise<ValidateCheckoutCodeSuccess | ValidateCheckoutCodeFailure> {
  const codeTrim = args.codeRaw.trim();
  if (!codeTrim) {
    return { ok: false, message: "El código es requerido" };
  }

  const codeUpper = codeTrim.toUpperCase();
  const normalizedEmail = (args.contactEmail || "").toLowerCase().trim();

  const discountResult = await tryValidateDiscountCode(
    supabase,
    codeUpper,
    normalizedEmail || undefined,
  );
  if (discountResult.ok) {
    return {
      ok: true,
      type: "discount",
      code: discountResult.code,
      discountPercentage: discountResult.discountPercentage,
      description: discountResult.description,
    };
  }
  if (discountResult.found) {
    return { ok: false, message: discountResult.message };
  }

  // No es cupón: intenta como referido. El referido SIEMPRE requiere email
  // (la UI de checkout también exige correo antes de "Aplicar" cualquier código).
  if (!normalizedEmail) {
    return {
      ok: false,
      message:
        "Captura tu correo en el formulario para validar este código de referido.",
    };
  }

  let resolvedUserId: string | null = null;
  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();
  if (userRow && (userRow as { id: string }).id) {
    resolvedUserId = (userRow as { id: string }).id;
  }

  const referralResult = await validateReferralForReservationPrice(supabase, {
    codeRaw: codeUpper,
    contactEmail: normalizedEmail,
    resolvedUserId,
  });
  if (referralResult.ok) {
    return {
      ok: true,
      type: "referral",
      code: referralResult.code,
      inviteeDiscountAmount: referralResult.inviteeDiscountAmount,
      referrerCreditAmount: referralResult.referrerCreditAmount,
    };
  }

  return { ok: false, message: referralResult.message };
}

async function tryValidateDiscountCode(
  supabase: SupabaseClient<Database>,
  codeUpper: string,
  normalizedEmail?: string,
): Promise<
  | {
      ok: true;
      code: string;
      discountPercentage: number;
      description: string | null;
    }
  | { ok: false; found: false }
  | { ok: false; found: true; message: string }
> {
  const { data, error } = await supabase
    .from("discount_codes")
    .select(
      "id, code, active, valid_from, valid_until, max_uses, current_uses, discount_percentage, description",
    )
    .eq("code", codeUpper)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, found: false };
  }

  const dc = data as {
    id: string;
    code: string;
    active: boolean;
    valid_from: string;
    valid_until: string;
    max_uses: number;
    current_uses: number;
    discount_percentage: number;
    description: string | null;
  };

  if (!dc.active) {
    return {
      ok: false,
      found: true,
      message: "Este código de descuento no está activo",
    };
  }

  const today = getMonterreyToday();
  const validFrom = new Date(dc.valid_from);
  validFrom.setHours(0, 0, 0, 0);
  const validUntil = new Date(dc.valid_until);
  validUntil.setHours(23, 59, 59, 999);
  if (today < validFrom) {
    return {
      ok: false,
      found: true,
      message: `Este código será válido a partir del ${validFrom.toLocaleDateString("es-MX")}`,
    };
  }
  if (today > validUntil) {
    return {
      ok: false,
      found: true,
      message: "Este código de descuento ha expirado",
    };
  }
  if (dc.current_uses >= dc.max_uses) {
    return {
      ok: false,
      found: true,
      message: "Este código de descuento ha alcanzado su límite de usos",
    };
  }

  if (normalizedEmail) {
    const { data: existingUse } = await supabase
      .from("discount_code_uses")
      .select("id")
      .eq("discount_code_id", dc.id)
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (existingUse) {
      return {
        ok: false,
        found: true,
        message: "Ya has usado este código de descuento anteriormente",
      };
    }
  }

  const pct = Number(dc.discount_percentage);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return {
      ok: false,
      found: true,
      message: "Código de descuento no válido",
    };
  }

  return {
    ok: true,
    code: dc.code,
    discountPercentage: pct,
    description: dc.description,
  };
}
