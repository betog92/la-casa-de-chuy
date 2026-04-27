export type LoyaltyLevel = "Elite" | "VIP" | "Frecuente" | "Inicial";

// =====================================================
// Naming público de los puntos de lealtad
// =====================================================
// IMPORTANTE: cambiar aquí cambia el nombre en TODA la UI.
// En base de datos y código sigue siendo "loyalty_points" / "points".
// En lo que ve el cliente y los admins, se llama "Monedas Chuy".

/** Plural: usado cuando se habla del programa o cantidades > 1. */
export const LOYALTY_CURRENCY_NAME = "Monedas Chuy";

/** Singular: usado cuando la cantidad es exactamente 1. */
export const LOYALTY_CURRENCY_SINGULAR = "Moneda Chuy";

/** Versión corta para celdas de tablas y lugares con poco espacio. */
export const LOYALTY_CURRENCY_SHORT = "Monedas";

/**
 * Devuelve la forma adecuada (singular o plural) según la cantidad.
 * Útil para frases como "Tienes 1 Moneda Chuy" vs "Tienes 250 Monedas Chuy".
 */
export function pluralizeLoyalty(amount: number): string {
  return amount === 1 ? LOYALTY_CURRENCY_SINGULAR : LOYALTY_CURRENCY_NAME;
}

/**
 * Calcula el nivel de fidelización basado en el número de reservas confirmadas
 *
 * @param confirmedCount - Número de reservas confirmadas
 * @returns Nombre del nivel de fidelización
 */
export function calculateLoyaltyLevel(confirmedCount: number): LoyaltyLevel {
  if (confirmedCount >= 10) {
    return "Elite";
  } else if (confirmedCount >= 5) {
    return "VIP";
  } else if (confirmedCount >= 1) {
    return "Frecuente";
  } else {
    return "Inicial";
  }
}

/**
 * Devuelve un rank numérico para ordenar niveles (mayor = más alto).
 * Útil para ordenamientos en listas de admin.
 */
export function loyaltyLevelRank(level: string): number {
  switch (level) {
    case "Elite":
      return 4;
    case "VIP":
      return 3;
    case "Frecuente":
      return 2;
    case "Inicial":
      return 1;
    default:
      return 0;
  }
}
