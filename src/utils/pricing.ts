import { format, getDay, isSameDay, differenceInDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// =====================================================
// CONSTANTES DE PRECIOS BASE
// =====================================================

export const PRICES = {
  normal: 1500, // Precio por reserva en día normal
  weekend: 1800, // Precio por reserva en viernes/sábado/domingo
  holiday: 2000, // Precio por reserva en día festivo
} as const;

// =====================================================
// DÍAS FESTIVOS EN MÉXICO (2024-2025)
// =====================================================

const MEXICAN_HOLIDAYS = [
  // 2024
  new Date(2024, 0, 1), // Año Nuevo
  new Date(2024, 1, 5), // Día de la Constitución
  new Date(2024, 2, 18), // Natalicio de Benito Juárez
  new Date(2024, 4, 1), // Día del Trabajo
  new Date(2024, 8, 16), // Día de la Independencia
  new Date(2024, 10, 1), // Día de Muertos
  new Date(2024, 10, 18), // Día de la Revolución
  new Date(2024, 11, 25), // Navidad
  // 2025
  new Date(2025, 0, 1), // Año Nuevo
  new Date(2025, 1, 3), // Día de la Constitución
  new Date(2025, 2, 17), // Natalicio de Benito Juárez
  new Date(2025, 4, 1), // Día del Trabajo
  new Date(2025, 8, 16), // Día de la Independencia
  new Date(2025, 10, 1), // Día de Muertos
  new Date(2025, 10, 17), // Día de la Revolución
  new Date(2025, 11, 25), // Navidad
] as const;

// =====================================================
// TIPOS
// =====================================================

export type DayType = "normal" | "weekend" | "holiday";

// =====================================================
// FUNCIONES DE DETECCIÓN DE TIPO DE DÍA
// =====================================================

/**
 * Determina si un día es festivo en México
 */
export function isHoliday(date: Date): boolean {
  return MEXICAN_HOLIDAYS.some((holiday) => isSameDay(date, holiday));
}

/**
 * Determina si un día es viernes, sábado o domingo
 */
export function isWeekend(date: Date): boolean {
  const dayOfWeek = getDay(date);
  // 0 = Domingo, 5 = Viernes, 6 = Sábado
  return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
}

/**
 * Determina el tipo de día (normal, weekend, holiday)
 */
export function getDayType(date: Date): DayType {
  if (isHoliday(date)) {
    return "holiday";
  }
  if (isWeekend(date)) {
    return "weekend";
  }
  return "normal";
}

// =====================================================
// FUNCIÓN PRINCIPAL DE CÁLCULO DE PRECIO
// =====================================================

/**
 * Calcula el precio base según la fecha
 *
 * @param date - Fecha de la reserva
 * @param customPrice - Precio personalizado desde la BD (opcional)
 * @returns Precio calculado
 */
export function calculatePrice(
  date: Date,
  customPrice?: number | null
): number {
  // Si hay precio personalizado, usarlo directamente
  if (customPrice !== undefined && customPrice !== null) {
    return customPrice;
  }

  // Determinar tipo de día
  const dayType = getDayType(date);

  // Obtener precio según tipo de día
  return PRICES[dayType];
}

// =====================================================
// FUNCIONES PARA OBTENER PRECIOS PERSONALIZADOS
// =====================================================

/**
 * Obtiene precio personalizado desde la base de datos
 *
 * @param supabase - Cliente de Supabase
 * @param date - Fecha a consultar
 * @returns Precio personalizado o null si no existe
 */
export async function getCustomPrice(
  supabase: SupabaseClient<Database>,
  date: Date
): Promise<number | null> {
  const dateString = format(date, "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("availability")
    .select("custom_price")
    .eq("date", dateString)
    .maybeSingle(); // Cambiar de .single() a .maybeSingle()

  if (error || !data) {
    return null;
  }

  const customPrice = (data as { custom_price: number | null }).custom_price;
  if (!customPrice) {
    return null;
  }

  // Retornar precio personalizado
  return customPrice;
}

/**
 * Calcula el precio final considerando precios personalizados de la BD
 *
 * @param supabase - Cliente de Supabase
 * @param date - Fecha de la reserva
 * @returns Precio final (personalizado o calculado)
 */
export async function calculatePriceWithCustom(
  supabase: SupabaseClient<Database>,
  date: Date
): Promise<number> {
  // Intentar obtener precio personalizado
  const customPrice = await getCustomPrice(supabase, date);

  // Calcular precio (usa personalizado si existe)
  return calculatePrice(date, customPrice);
}

// =====================================================
// FUNCIONES DE DESCUENTOS (FASE 2)
// =====================================================

/**
 * Calcula descuento de último minuto (15% off)
 * Aplica a los próximos 4 días
 *
 * @param date - Fecha de la reserva
 * @param basePrice - Precio base
 * @returns Precio con descuento o precio original
 */
export function applyLastMinuteDiscount(
  date: Date,
  basePrice: number
): { price: number; discount: number; applied: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reservationDate = new Date(date);
  reservationDate.setHours(0, 0, 0, 0);

  // Calcular diferencia en días usando date-fns (más preciso)
  const diffDays = differenceInDays(reservationDate, today);

  // Aplicar descuento si es dentro de los próximos 4 días (0, 1, 2, 3)
  // 0 = hoy, 1 = mañana, 2 = pasado mañana, 3 = el siguiente día
  if (diffDays >= 0 && diffDays <= 3) {
    const discount = basePrice * 0.15;
    return {
      price: basePrice - discount,
      discount,
      applied: true,
    };
  }

  return {
    price: basePrice,
    discount: 0,
    applied: false,
  };
}

/**
 * Calcula descuento por repetición
 * 2da reserva: 5%, 3ra: 10%, 4ta+: 15%
 *
 * @param reservationCount - Número de reservas previas
 * @param basePrice - Precio base
 * @returns Precio con descuento
 */
export function applyLoyaltyDiscount(
  reservationCount: number,
  basePrice: number
): { price: number; discount: number; percentage: number } {
  let percentage = 0;

  if (reservationCount >= 4) {
    percentage = 15;
  } else if (reservationCount === 3) {
    percentage = 10;
  } else if (reservationCount === 2) {
    percentage = 5;
  }

  const discount = basePrice * (percentage / 100);

  return {
    price: basePrice - discount,
    discount,
    percentage,
  };
}

/**
 * Calcula descuento por referido (10% en primera reserva)
 *
 * @param isFirstReservation - Si es la primera reserva del referido
 * @param basePrice - Precio base
 * @returns Precio con descuento
 */
export function applyReferralDiscount(
  isFirstReservation: boolean,
  basePrice: number
): { price: number; discount: number; applied: boolean } {
  if (!isFirstReservation) {
    return {
      price: basePrice,
      discount: 0,
      applied: false,
    };
  }

  const discount = basePrice * 0.1;

  return {
    price: basePrice - discount,
    discount,
    applied: true,
  };
}

// =====================================================
// FUNCIÓN PARA CALCULAR PRECIO FINAL CON TODOS LOS DESCUENTOS
// =====================================================

export interface PriceCalculationOptions {
  date: Date;
  customPrice?: number | null;
  isLastMinute?: boolean;
  reservationCount?: number;
  isFirstReservation?: boolean;
  useLoyaltyPoints?: number; // Puntos a usar (100 puntos = $100)
}

export interface PriceCalculationResult {
  basePrice: number;
  originalPrice: number;
  discounts: {
    lastMinute?: { amount: number; applied: boolean };
    loyalty?: { amount: number; percentage: number };
    referral?: { amount: number; applied: boolean };
    loyaltyPoints?: { amount: number; points: number };
  };
  finalPrice: number;
  totalDiscount: number;
}

/**
 * Calcula el precio final considerando todos los descuentos posibles
 */
export async function calculateFinalPrice(
  supabase: SupabaseClient<Database>,
  options: PriceCalculationOptions
): Promise<PriceCalculationResult> {
  const {
    date,
    customPrice,
    isLastMinute,
    reservationCount,
    isFirstReservation,
    useLoyaltyPoints,
  } = options;

  // 1. Calcular precio base
  // Si customPrice está definido (incluyendo null), usarlo directamente
  // Si es undefined, obtenerlo de la BD
  let basePrice: number;
  if (customPrice !== undefined) {
    basePrice = calculatePrice(date, customPrice);
  } else {
    basePrice = await calculatePriceWithCustom(supabase, date);
  }

  const originalPrice = basePrice;
  let finalPrice = basePrice;
  const discounts: PriceCalculationResult["discounts"] = {};

  // 2. Aplicar descuento de último minuto (si aplica)
  if (isLastMinute !== false) {
    const lastMinute = applyLastMinuteDiscount(date, basePrice);
    if (lastMinute.applied) {
      discounts.lastMinute = {
        amount: lastMinute.discount,
        applied: true,
      };
      finalPrice = lastMinute.price;
    }
  }

  // 3. Aplicar descuento por fidelización (si aplica)
  if (reservationCount !== undefined && reservationCount >= 2) {
    const loyalty = applyLoyaltyDiscount(reservationCount, finalPrice);
    discounts.loyalty = {
      amount: loyalty.discount,
      percentage: loyalty.percentage,
    };
    finalPrice = loyalty.price;
  }

  // 4. Aplicar descuento por referido (si aplica)
  if (isFirstReservation) {
    const referral = applyReferralDiscount(true, finalPrice);
    if (referral.applied) {
      discounts.referral = {
        amount: referral.discount,
        applied: true,
      };
      finalPrice = referral.price;
    }
  }

  // 5. Aplicar puntos de fidelización (si aplica)
  if (useLoyaltyPoints && useLoyaltyPoints > 0) {
    // 100 puntos = $100 MXN
    const discountFromPoints = Math.floor(useLoyaltyPoints / 100) * 100;
    discounts.loyaltyPoints = {
      amount: discountFromPoints,
      points: useLoyaltyPoints,
    };
    finalPrice = Math.max(0, finalPrice - discountFromPoints);
  }

  // Calcular descuento total
  const totalDiscount = originalPrice - finalPrice;

  return {
    basePrice,
    originalPrice,
    discounts,
    finalPrice,
    totalDiscount,
  };
}
