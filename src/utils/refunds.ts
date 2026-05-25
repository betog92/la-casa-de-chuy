/**
 * Constantes y utilidades para el manejo de reembolsos
 */

// Porcentaje de reembolso (80%)
export const REFUND_PERCENTAGE = 0.8;

export type ReschedulePaymentHistoryRow = {
  additional_payment_amount: number | null;
  additional_payment_method: string | null;
};

/**
 * Calcula el monto del reembolso (80% del total pagado)
 * @param totalPaid - Total pagado (precio + pago adicional si existe)
 * @returns Monto del reembolso redondeado a 2 decimales
 */
export function calculateRefundAmount(totalPaid: number): number {
  return Math.round(totalPaid * REFUND_PERCENTAGE * 100) / 100;
}

/**
 * @deprecated No usar para reembolsos: `price` ya es acumulativo tras reagendar.
 * Usar `getTotalConektaPaid` / `buildRefundPlan`.
 */
export function calculateTotalPaid(
  price: number,
  additionalPaymentAmount?: number | null
): number {
  return price + (additionalPaymentAmount || 0);
}

function isConektaMethod(method: string | null | undefined): boolean {
  return (method ?? "").toLowerCase() === "conekta";
}

/**
 * Monto del único pago adicional Conekta por reagendo (si existe).
 *
 * Negocio: el cliente solo puede reagendar una vez; la reserva guarda un solo
 * `additional_payment_id` / `additional_payment_amount` y `buildRefundPlan` solo
 * emite una fila `charge_kind: additional`. El historial puede tener varias
 * filas (reagendos admin sin cobro, etc.), pero para reembolsos y totales
 * usamos la fila de reserva como fuente canónica cuando está presente.
 */
export function sumConektaAdditionalPaid(
  rescheduleHistory: ReschedulePaymentHistoryRow[],
  fallback?: {
    additional_payment_amount: number | null;
    additional_payment_method: string | null;
  }
): number {
  if (fallback && isConektaMethod(fallback.additional_payment_method)) {
    const amt = Number(fallback.additional_payment_amount ?? 0);
    if (Number.isFinite(amt) && amt > 0) {
      const fromHistory = (rescheduleHistory ?? []).reduce(
        (sum, h) =>
          sum +
          (isConektaMethod(h.additional_payment_method)
            ? (h.additional_payment_amount ?? 0)
            : 0),
        0
      );
      if (fromHistory > amt + 0.01) {
        console.warn(
          "[refunds] Historial suma más adicionales Conekta que additional_payment_amount en reserva; usando fila de reserva (un solo reembolso adicional).",
          { fromHistory, reservationAdditional: amt }
        );
      }
      return amt;
    }
  }

  return (rescheduleHistory ?? []).reduce(
    (sum, h) =>
      sum +
      (isConektaMethod(h.additional_payment_method)
        ? (h.additional_payment_amount ?? 0)
        : 0),
    0
  );
}

/**
 * Monto de la orden Conekta inicial (sin pagos adicionales por reagendo).
 * `reservations.price` es acumulativo: incluye adicionales que sumó el reagendo.
 */
export function getInitialConektaCharge(
  paymentMethod: string | null | undefined,
  priceCumulative: number | null | undefined,
  rescheduleHistory: ReschedulePaymentHistoryRow[],
  fallbackAdditional?: {
    additional_payment_amount: number | null;
    additional_payment_method: string | null;
  }
): number {
  if (!isConektaMethod(paymentMethod)) {
    return 0;
  }
  const total = Number(priceCumulative ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const additional = sumConektaAdditionalPaid(
    rescheduleHistory,
    fallbackAdditional
  );
  return Math.max(0, total - additional);
}

/**
 * Total cobrado por Conekta (orden inicial + pagos adicionales en reagendos).
 * Usar `reservations.price` cuando el pago inicial fue Conekta: ya es el total acumulado.
 */
export function getTotalConektaPaid(
  paymentMethod: string | null | undefined,
  priceCumulative: number | null | undefined,
  rescheduleHistory: ReschedulePaymentHistoryRow[],
  fallbackAdditional?: {
    additional_payment_amount: number | null;
    additional_payment_method: string | null;
  }
): number {
  const additional = sumConektaAdditionalPaid(
    rescheduleHistory,
    fallbackAdditional
  );
  const initial = getInitialConektaCharge(
    paymentMethod,
    priceCumulative,
    rescheduleHistory,
    fallbackAdditional
  );
  return initial + additional;
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
 * (pago inicial y, como máximo, un pago adicional de reagendo). Debe alinearse
 * con `getTotalConektaPaid` (véase `sumConektaAdditionalPaid`).
 */
export function buildRefundPlan(args: {
  payment_method: string | null;
  payment_id: string | null;
  original_price: number | null;
  price: number;
  additional_payment_id: string | null;
  additional_payment_amount: number | null;
  additional_payment_method: string | null;
  reschedule_history?: ReschedulePaymentHistoryRow[];
}): RefundPlanItem[] {
  const out: RefundPlanItem[] = [];
  const history = args.reschedule_history ?? [];
  const fallbackAdditional = {
    additional_payment_amount: args.additional_payment_amount,
    additional_payment_method: args.additional_payment_method,
  };

  const pid = (args.payment_id || "").trim();
  const initialPaid = getInitialConektaCharge(
    args.payment_method,
    args.price,
    history,
    fallbackAdditional
  );
  if (isConektaMethod(args.payment_method) && pid && initialPaid > 0) {
    out.push({
      paymentId: pid,
      kind: "initial",
      amountMxn: calculateRefundAmount(initialPaid),
      paidMxn: initialPaid,
    });
  }

  const addId = (args.additional_payment_id || "").trim();
  const addAmt = Number(args.additional_payment_amount ?? 0);
  if (
    isConektaMethod(args.additional_payment_method) &&
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

/** Suma lo pagado (MXN) en todas las filas del plan antes del 80%. */
export function sumRefundPlanPaidMxn(plan: RefundPlanItem[]): number {
  return plan.reduce((sum, item) => sum + item.paidMxn, 0);
}

/** Suma el reembolso (MXN) de todas las filas del plan (80% por orden). */
export function sumRefundPlanAmountMxn(plan: RefundPlanItem[]): number {
  return plan.reduce((sum, item) => sum + item.amountMxn, 0);
}

export type CancellationRefundPreviewArgs = {
  payment_method: string | null;
  payment_id: string | null;
  price: number;
  additional_payment_id: string | null;
  additional_payment_amount: number | null;
  additional_payment_method: string | null;
  reschedule_history?: ReschedulePaymentHistoryRow[];
};

/**
 * Vista previa y cálculo de cancelación: misma lógica que POST /cancel.
 * Una sola fuente de verdad para modal, email y API.
 */
export function getCancellationRefundPreview(
  args: CancellationRefundPreviewArgs
): {
  totalConektaPaid: number;
  refundAmount: number;
  refundPlan: RefundPlanItem[];
} {
  const history = args.reschedule_history ?? [];
  const fallbackAdditional = {
    additional_payment_amount: args.additional_payment_amount,
    additional_payment_method: args.additional_payment_method,
  };
  const totalConektaPaid = getTotalConektaPaid(
    args.payment_method,
    args.price,
    history,
    fallbackAdditional
  );
  const refundPlan = buildRefundPlan({
    payment_method: args.payment_method,
    payment_id: args.payment_id,
    original_price: null,
    price: args.price,
    additional_payment_id: args.additional_payment_id,
    additional_payment_amount: args.additional_payment_amount,
    additional_payment_method: args.additional_payment_method,
    reschedule_history: history,
  });
  const refundAmount =
    refundPlan.length > 0
      ? sumRefundPlanAmountMxn(refundPlan)
      : calculateRefundAmount(totalConektaPaid);
  return { totalConektaPaid, refundAmount, refundPlan };
}

/**
 * El plan debe cubrir exactamente lo que `getTotalConektaPaid` reporta.
 * Tolerancia de 1 centavo por redondeos.
 */
export function isRefundPlanConsistentWithTotal(
  plan: RefundPlanItem[],
  totalConektaPaid: number
): boolean {
  if (plan.length === 0) {
    return totalConektaPaid <= 0;
  }
  return Math.abs(sumRefundPlanPaidMxn(plan) - totalConektaPaid) < 0.01;
}
