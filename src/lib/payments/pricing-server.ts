import { parse } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  applyLastMinuteDiscount,
  calculateFinalPrice,
  type PriceCalculationResult,
} from "@/utils/pricing";
import { getMonterreyToday } from "@/utils/business-days";
import {
  validateReferralForReservationPrice,
  REFERRAL_REFERRER_CREDIT_MXN,
} from "@/lib/payments/referral-validation";
import { countLoyaltyTierReservations } from "@/lib/loyalty/tier-reservation-count";

/**
 * Cálculo de precio AUTORITATIVO en el servidor para reservas nuevas.
 *
 * Es la única fuente de verdad para el monto a cobrar. El cliente puede
 * mostrar un total tentativo, pero el servidor recalcula desde cero leyendo
 * `availability`, `loyalty_points`, `credits`, `discount_codes`, `referrals` y conteos
 * reales del usuario, y rechaza beneficios inválidos en lugar de cobrar de
 * más al cliente sin avisar.
 */

export interface AuthoritativeReservationOptions {
  /** Fecha de la reserva en formato 'yyyy-MM-dd'. */
  dateString: string;
  /** Email del contacto (lowercased internamente). */
  contactEmail: string;
  /** ID del usuario autenticado (Supabase). null = invitado. */
  userId: string | null;
  /** ¿El cliente quiere usar su descuento por fidelización? */
  useLoyaltyDiscount: boolean;
  /** Cantidad de Monedas Chuy que el cliente quiere aplicar (1 punto = $1). */
  useLoyaltyPoints: number;
  /** Monto en MXN de créditos que el cliente quiere aplicar. */
  useCredits: number;
  /** Código de descuento (opcional). */
  discountCode?: string | null;
  /** Código de referido (opcional). Mutuamente excluyente con `discountCode`. */
  referralCode?: string | null;
}

export interface AuthoritativePriceFailure {
  ok: false;
  /** Código de error para el cliente. */
  reason:
    | "loyalty_points_insufficient"
    | "credits_insufficient"
    | "discount_code_invalid"
    | "discount_code_already_used"
    | "discount_code_expired"
    | "discount_code_max_uses"
    | "referral_invalid"
    | "code_conflict"
    | "amount_zero";
  /** Mensaje listo para mostrar al usuario. */
  message: string;
}

export interface AuthoritativePriceResult {
  ok: true;
  /** Precio base de la fecha (sin descuentos). */
  basePrice: number;
  /** Precio final que el servidor cobrará. */
  finalPrice: number;
  /** Suma de todos los descuentos aplicados (incl. monedas y créditos). */
  totalDiscount: number;

  // Desglose para guardar en la fila de la reserva
  lastMinuteDiscount: number;
  loyaltyDiscount: number;
  loyaltyPointsUsed: number;
  creditsUsed: number;
  /** Monto fijo descontado al invitado por usar un código de referido. */
  referralDiscount: number;
  /** Código de referido validado, si se aplicó. */
  referralCode: string | null;
  /** UUID en `referral_codes` (V2) — usado por finalize para crear redemption. */
  referralCodeId: string | null;
  /** user_id del referidor (V2) — usado por finalize para acreditarle. */
  referrerUserId: string | null;
  /** Monto en MXN a acreditar al referidor al confirmarse el pago. */
  referrerCreditAmount: number;
  discountCode: string | null;
  discountCodeDiscount: number;

  /** Detalle "puro" del cálculo base (sin créditos/código), útil para debug. */
  pricing: PriceCalculationResult;

  /** ID interno del usuario resuelto (puede venir nulo si era invitado y no había cuenta). */
  resolvedUserId: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula el precio definitivo y valida cada beneficio contra la base de datos.
 * Devuelve `ok: false` con un código si algún beneficio es inválido (en lugar
 * de cobrar de más en silencio).
 */
export async function computeAuthoritativeReservationPrice(
  supabase: SupabaseClient<Database>,
  opts: AuthoritativeReservationOptions,
): Promise<AuthoritativePriceResult | AuthoritativePriceFailure> {
  const {
    dateString,
    contactEmail,
    userId,
    useLoyaltyDiscount,
    useLoyaltyPoints,
    useCredits,
    discountCode,
    referralCode,
  } = opts;

  const date = parse(dateString, "yyyy-MM-dd", new Date());
  const normalizedEmail = (contactEmail || "").toLowerCase().trim();

  // Códigos mutuamente excluyentes: la UI fuerza elegir uno; si llega lo contrario,
  // mejor rechazar que aplicar uno arbitrariamente y cobrar mal.
  const hasDiscountCode =
    typeof discountCode === "string" && discountCode.trim() !== "";
  const hasReferralCode =
    typeof referralCode === "string" && referralCode.trim() !== "";
  if (hasDiscountCode && hasReferralCode) {
    return {
      ok: false,
      reason: "code_conflict",
      message:
        "Solo puedes aplicar un código a la vez (descuento o referido). Elige uno.",
    };
  }

  // 1. Resolver userId (si invitado pero el email tiene cuenta, asignar)
  let resolvedUserId: string | null = userId ?? null;
  if (!resolvedUserId && normalizedEmail) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .limit(1)
      .maybeSingle();
    if (data && (data as { id: string }).id) {
      resolvedUserId = (data as { id: string }).id;
    }
  }

  // 2. Beneficios sólo cuentan para usuarios autenticados
  let availablePoints = 0;
  let availableCredits = 0;
  let confirmedReservationCount = 0;
  if (resolvedUserId) {
    const [pointsRes, creditsRes, tierCount] = await Promise.all([
      supabase
        .from("loyalty_points")
        .select("points")
        .eq("user_id", resolvedUserId)
        .eq("revoked", false)
        .eq("used", false),
      supabase
        .from("credits")
        .select("amount")
        .eq("user_id", resolvedUserId)
        .eq("revoked", false)
        .eq("used", false),
      countLoyaltyTierReservations(supabase, resolvedUserId),
    ]);
    availablePoints =
      (pointsRes.data as { points: number }[] | null | undefined)?.reduce(
        (sum, r) => sum + Number(r.points || 0),
        0,
      ) ?? 0;
    availableCredits =
      (creditsRes.data as { amount: number }[] | null | undefined)?.reduce(
        (sum, r) => sum + Number(r.amount || 0),
        0,
      ) ?? 0;
    confirmedReservationCount = tierCount;
  }

  // 3. Beneficios solicitados → si no alcanzan, fallar (no cobrar de más en silencio)
  const requestedPoints = Math.max(0, Math.floor(Number(useLoyaltyPoints) || 0));
  const requestedCredits = Math.max(0, Number(useCredits) || 0);

  if (requestedPoints > 0) {
    if (!resolvedUserId || requestedPoints > availablePoints) {
      return {
        ok: false,
        reason: "loyalty_points_insufficient",
        message: `Saldo insuficiente de Monedas Chuy. Disponible: ${availablePoints}.`,
      };
    }
  }
  if (requestedCredits > 0) {
    if (!resolvedUserId || requestedCredits > availableCredits) {
      return {
        ok: false,
        reason: "credits_insufficient",
        message: `Saldo insuficiente de créditos. Disponible: $${availableCredits.toFixed(2)}.`,
      };
    }
  }

  // 4. Validar código de descuento (si se envió)
  let validatedDiscountCode: { code: string; percentage: number } | null = null;
  if (discountCode && typeof discountCode === "string" && discountCode.trim()) {
    const codeUpper = discountCode.trim().toUpperCase();
    const { data, error } = await supabase
      .from("discount_codes")
      .select(
        "id, code, active, valid_from, valid_until, max_uses, current_uses, discount_percentage",
      )
      .eq("code", codeUpper)
      .single();

    if (error || !data) {
      return {
        ok: false,
        reason: "discount_code_invalid",
        message: `Código "${codeUpper}" no es válido.`,
      };
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
    };

    if (!dc.active) {
      return {
        ok: false,
        reason: "discount_code_invalid",
        message: `Código "${dc.code}" no está activo.`,
      };
    }

    const today = getMonterreyToday();
    const validFrom = new Date(dc.valid_from);
    validFrom.setHours(0, 0, 0, 0);
    const validUntil = new Date(dc.valid_until);
    validUntil.setHours(23, 59, 59, 999);
    if (today < validFrom || today > validUntil) {
      return {
        ok: false,
        reason: "discount_code_expired",
        message: `El código "${dc.code}" no está vigente en esta fecha.`,
      };
    }
    if (dc.current_uses >= dc.max_uses) {
      return {
        ok: false,
        reason: "discount_code_max_uses",
        message: `El código "${dc.code}" alcanzó su límite de usos.`,
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
          reason: "discount_code_already_used",
          message: `Ya usaste el código "${dc.code}" anteriormente.`,
        };
      }
    }

    // Defensa: rechazar porcentajes fuera de [0, 100]. Un código en BD con
    // valor inválido (por bug administrativo) podría hacer que el precio
    // calculado salga negativo o absurdo.
    const pct = Number(dc.discount_percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      console.error(
        `[pricing-server] discount_code "${dc.code}" tiene discount_percentage inválido: ${dc.discount_percentage}`,
      );
      return {
        ok: false,
        reason: "discount_code_invalid",
        message: `El código "${dc.code}" tiene una configuración inválida. Contacta a soporte.`,
      };
    }

    validatedDiscountCode = { code: dc.code, percentage: pct };
  }

  // 4b. Validar código de referido (si se envió). Mutuamente excluyente con
  // `discountCode`, ya verificado arriba. V2: el referido descuenta un monto
  // FIJO ($100) al invitado, no un porcentaje. El referidor recibirá $200 en
  // créditos al confirmarse el pago (lo hace `finalize-reservation.ts`).
  let validatedReferral: {
    referralCodeId: string;
    referrerUserId: string;
    code: string;
    inviteeDiscountAmount: number;
    referrerCreditAmount: number;
  } | null = null;
  if (hasReferralCode) {
    const referralResult = await validateReferralForReservationPrice(supabase, {
      codeRaw: referralCode!,
      contactEmail: normalizedEmail,
      resolvedUserId,
    });
    if (!referralResult.ok) {
      return {
        ok: false,
        reason: "referral_invalid",
        message: referralResult.message,
      };
    }
    validatedReferral = {
      referralCodeId: referralResult.referralCodeId,
      referrerUserId: referralResult.referrerUserId,
      code: referralResult.code,
      inviteeDiscountAmount: referralResult.inviteeDiscountAmount,
      referrerCreditAmount: referralResult.referrerCreditAmount,
    };
  }

  // 5. Calcular precio base y descuentos automáticos (last-min, fidelización)
  // (Sin código y sin monedas/créditos: sólo last-min + lealtad)
  const baseCalc = await calculateFinalPrice(supabase, {
    date,
    isLastMinute: true,
    reservationCount: useLoyaltyDiscount ? confirmedReservationCount : undefined,
    useLoyaltyPoints: 0,
  });

  let basePrice = baseCalc.basePrice;
  let runningPrice = baseCalc.finalPrice;
  let lastMinuteDiscount = baseCalc.discounts.lastMinute?.amount || 0;
  let loyaltyDiscount = baseCalc.discounts.loyalty?.amount || 0;
  let referralDiscount = 0;
  let discountCodeDiscount = 0;

  // 6. Si hay código, recalcula last-min/lealtad sobre el precio post-código
  //    (mismo orden que aplica el cliente en `formulario/page.tsx`).
  if (validatedDiscountCode) {
    const codeDiscount = basePrice * (validatedDiscountCode.percentage / 100);
    discountCodeDiscount = codeDiscount;
    let p = basePrice - codeDiscount;

    const lastMinute = applyLastMinuteDiscount(date, p);
    lastMinuteDiscount = lastMinute.discount;
    p = lastMinute.price;

    if (useLoyaltyDiscount && confirmedReservationCount >= 1) {
      let pct = 0;
      if (confirmedReservationCount >= 9) pct = 5;
      else if (confirmedReservationCount >= 4) pct = 4;
      else if (confirmedReservationCount >= 1) pct = 3;
      const ld = p * (pct / 100);
      loyaltyDiscount = ld;
      p -= ld;
    } else {
      loyaltyDiscount = 0;
    }

    runningPrice = p;
  }

  // 7. Aplicar Monedas Chuy (siempre enteras: 1 moneda = $1).
  //    Usamos `floor` para que el descuento aplicado nunca exceda el saldo
  //    consumido y para que la cantidad guardada coincida con el descuento.
  let pointsApplied = 0;
  if (requestedPoints > 0) {
    pointsApplied = Math.floor(Math.min(requestedPoints, runningPrice));
    runningPrice = Math.max(0, runningPrice - pointsApplied);
  }

  // 7b. Referido: descuento FIJO ($100) al invitado, topado al subtotal
  // para no dejar precios negativos. Si el precio del slot es menor a $100,
  // se descuenta hasta el subtotal y punto (no genera saldo a favor).
  if (validatedReferral) {
    const rd = Math.min(validatedReferral.inviteeDiscountAmount, runningPrice);
    if (rd < validatedReferral.inviteeDiscountAmount) {
      console.warn(
        `[pricing-server] Referido ${validatedReferral.code}: descuento topado a $${rd.toFixed(2)} (subtotal menor a $${validatedReferral.inviteeDiscountAmount}).`,
      );
    }
    referralDiscount = rd;
    runningPrice = Math.max(0, runningPrice - rd);
  }

  // 8. Aplicar créditos
  let creditsApplied = 0;
  if (requestedCredits > 0) {
    creditsApplied = Math.min(requestedCredits, runningPrice);
    runningPrice = Math.max(0, runningPrice - creditsApplied);
  }

  // 9. Redondeo y validación final
  basePrice = round2(basePrice);
  const finalPrice = round2(runningPrice);
  lastMinuteDiscount = round2(lastMinuteDiscount);
  loyaltyDiscount = round2(loyaltyDiscount);
  referralDiscount = round2(referralDiscount);
  discountCodeDiscount = round2(discountCodeDiscount);
  creditsApplied = round2(creditsApplied);

  return {
    ok: true,
    basePrice,
    finalPrice,
    totalDiscount: round2(basePrice - finalPrice),
    lastMinuteDiscount,
    loyaltyDiscount,
    loyaltyPointsUsed: pointsApplied,
    creditsUsed: creditsApplied,
    referralDiscount,
    referralCode: validatedReferral?.code ?? null,
    referralCodeId: validatedReferral?.referralCodeId ?? null,
    referrerUserId: validatedReferral?.referrerUserId ?? null,
    referrerCreditAmount:
      validatedReferral?.referrerCreditAmount ?? REFERRAL_REFERRER_CREDIT_MXN,
    discountCode: validatedDiscountCode?.code ?? null,
    discountCodeDiscount,
    pricing: baseCalc,
    resolvedUserId,
  };
}
