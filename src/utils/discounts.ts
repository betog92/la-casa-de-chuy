/**
 * Valida si un descuento numérico es válido (existe, es número, y mayor a 0)
 */
export function isValidDiscount(
  value: number | null | undefined
): boolean {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "number" &&
    !isNaN(value) &&
    value > 0
  );
}

/**
 * Calcula el descuento por puntos de fidelización
 * @param loyaltyPointsUsed - Puntos usados
 * @returns Descuento calculado (100 puntos = $100 MXN, redondeado hacia abajo)
 */
export function calculatePointsDiscount(
  loyaltyPointsUsed: number | null | undefined
): number {
  if (!loyaltyPointsUsed || loyaltyPointsUsed <= 0) return 0;
  return Math.floor(loyaltyPointsUsed / 100) * 100;
}

/**
 * Valida si un código de descuento es válido
 */
export function isValidDiscountCode(
  code: string | null | undefined,
  discountAmount: number | null | undefined
): boolean {
  return (
    code !== null &&
    code !== undefined &&
    typeof code === "string" &&
    code.trim() !== "" &&
    !/^0+$/.test(code.trim()) && // No solo ceros
    isValidDiscount(discountAmount)
  );
}



