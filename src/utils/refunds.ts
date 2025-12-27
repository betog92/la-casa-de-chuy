/**
 * Constantes y utilidades para el manejo de reembolsos
 */

// Porcentaje de reembolso (80%)
export const REFUND_PERCENTAGE = 0.8;

/**
 * Calcula el monto del reembolso (80% del total pagado)
 * @param totalPaid - Total pagado (precio + pago adicional si existe)
 * @returns Monto del reembolso redondeado a 2 decimales
 */
export function calculateRefundAmount(totalPaid: number): number {
  return Math.round(totalPaid * REFUND_PERCENTAGE * 100) / 100;
}

/**
 * Calcula el total pagado (precio + pago adicional si existe)
 * @param price - Precio base de la reserva
 * @param additionalPaymentAmount - Monto adicional pagado (opcional)
 * @returns Total pagado
 */
export function calculateTotalPaid(
  price: number,
  additionalPaymentAmount?: number | null
): number {
  return price + (additionalPaymentAmount || 0);
}

/**
 * Genera un ID dummy para reembolsos (temporal hasta integrar con Conekta)
 * Formato: refund_dummy_[timestamp]_[random]
 * @returns ID dummy único
 */
export function generateDummyRefundId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `refund_dummy_${timestamp}_${random}`;
}

