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
 * Total cobrado por Conekta (orden inicial + pagos adicionales en reagendos).
 * Usar `reservations.price` (monto de la orden), no `original_price` (antes de descuentos).
 */
export function getTotalConektaPaid(
  paymentMethod: string | null | undefined,
  initialChargeMxn: number | null | undefined,
  rescheduleHistory: {
    additional_payment_amount: number | null;
    additional_payment_method: string | null;
  }[]
): number {
  const method = (paymentMethod ?? "").toLowerCase();
  const initial =
    method === "conekta" ? (initialChargeMxn ?? 0) : 0;
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

/** Cada fila corresponde a una orden Conekta (`payment_id`) a reembolsar. */
export type RefundPlanChargeKind = "initial" | "additional";

export interface RefundPlanItem {
  paymentId: string;
  kind: RefundPlanChargeKind;
  /** Monto a devolver al cliente (80% de lo pagado en ese cargo). */
  amountMxn: number;
  /** Lo pagado en ese cargo antes de aplicar el 80%. */
  paidMxn: number;
}

/**
 * Construye el plan de reembolsos por cancelación: hasta dos órdenes Conekta
 * (pago inicial y pago adicional de reagendo). Debe alinearse con
 * `getTotalConektaPaid` cuando sólo existen esas dos órdenes.
 */
export function buildRefundPlan(args: {
  payment_method: string | null;
  payment_id: string | null;
  original_price: number | null;
  price: number;
  additional_payment_id: string | null;
  additional_payment_amount: number | null;
  additional_payment_method: string | null;
}): RefundPlanItem[] {
  const out: RefundPlanItem[] = [];
  const pid = (args.payment_id || "").trim();
  if ((args.payment_method ?? "").toLowerCase() === "conekta" && pid) {
    const paid = Number(args.price ?? 0);
    if (Number.isFinite(paid) && paid > 0) {
      out.push({
        paymentId: pid,
        kind: "initial",
        amountMxn: calculateRefundAmount(paid),
        paidMxn: paid,
      });
    }
  }
  const addId = (args.additional_payment_id || "").trim();
  const addAmt = Number(args.additional_payment_amount ?? 0);
  if (
    (args.additional_payment_method ?? "").toLowerCase() === "conekta" &&
    addId &&
    Number.isFinite(addAmt) &&
    addAmt > 0
  ) {
    out.push({
      paymentId: addId,
      kind: "additional",
      amountMxn: calculateRefundAmount(addAmt),
      paidMxn: addAmt,
    });
  }
  return out;
}

