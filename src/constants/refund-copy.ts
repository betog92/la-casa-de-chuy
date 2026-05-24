/**
 * Textos de plazo de reembolso (tarjeta / banco).
 * Un solo criterio en UI, email y detalle de reserva cancelada.
 */
export const REFUND_BANK_TIMEFRAME = "de 5 a 10 días hábiles";

/** Línea de política en el modal de confirmar cancelación. */
export const REFUND_CANCEL_MODAL_POLICY =
  "Recibirás el 80% del monto pagado con tarjeta.";

/** Nota bajo el monto en el modal de confirmar cancelación. */
export const REFUND_CANCEL_MODAL_TIMEFRAME_NOTE = `El reembolso se enviará a tu método de pago original y puede tardar ${REFUND_BANK_TIMEFRAME} en verse en tu estado de cuenta.`;

/** Párrafo en email de cancelación (HTML interior, sin etiquetas). */
export const REFUND_CANCEL_EMAIL_TIMEFRAME = `Puede tardar ${REFUND_BANK_TIMEFRAME} en verse en tu estado de cuenta.`;

/** Viñeta cuando el reembolso ya fue enviado (detalle cancelada). */
export const REFUND_PROCESSED_BANK_NOTE = `Puede tardar ${REFUND_BANK_TIMEFRAME} en verse en tu estado de cuenta.`;

/** Viñeta cuando el reembolso sigue en proceso. */
export const REFUND_PENDING_BANK_NOTE = `Una vez enviado al banco, puede tardar ${REFUND_BANK_TIMEFRAME} en verse en tu estado de cuenta.`;
