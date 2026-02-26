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
 * Total pagado solo por Conekta (reservación inicial + pagos adicionales por Conekta).
 * Se usa para calcular el reembolso: solo se reembolsa lo pagado con tarjeta.
 * Acepta originalPrice null/undefined (reservas antiguas) y normaliza payment_method a minúsculas.
 */
export function getTotalConektaPaid(
  paymentMethod: string | null | undefined,
  originalPrice: number | null | undefined,
  rescheduleHistory: {
    additional_payment_amount: number | null;
    additional_payment_method: string | null;
  }[]
): number {
  const method = (paymentMethod ?? "").toLowerCase();
  const initial =
    method === "conekta" ? (originalPrice ?? 0) : 0;
  const fromHistory = (rescheduleHistory ?? []).reduce(
    (sum, h) =>
      sum +
      ((h.additional_payment_method ?? "").toLowerCase() === "conekta"
        ? (h.additional_payment_amount ?? 0)
        : 0),
    0
  );
  return initial + fromHistory;
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



