import type { ReactNode } from "react";
import {
  REFUND_PENDING_BANK_NOTE,
  REFUND_PROCESSED_BANK_NOTE,
} from "@/constants/refund-copy";
import { formatCancellationAttribution } from "@/utils/cancellation-display";
import { formatCurrency } from "@/utils/formatters";

type CancelledBy = { id: string; name: string | null; email: string };

export type CancelledReservationDetailsProps = {
  cancelledAt?: string | null;
  refundAmount?: number | null;
  refundId?: string | null;
  refundStatus?: string | null;
  cancelledBy?: CancelledBy | null;
  reservationUserId?: string | null;
  reservationEmail?: string | null;
  /** Solo en detalle con sesión admin (reintentar reembolso, etc.) */
  adminSection?: ReactNode;
  /** Ocultar montos e IDs de reembolso (empleadas admin). */
  hideRefundFinancials?: boolean;
  className?: string;
};

function refundStatusLabel(status: string): string {
  if (status === "processed") return "Procesado";
  if (status === "failed") return "Fallido";
  return "Pendiente";
}

function refundStatusPillClass(status: string): string {
  if (status === "processed") {
    return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80";
  }
  if (status === "failed") {
    return "bg-red-100 text-red-900 ring-1 ring-red-200/80";
  }
  return "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80";
}

/**
 * Bloque de cancelación + reembolso (misma jerarquía visual que reagendamiento).
 */
export function CancelledReservationDetails({
  cancelledAt,
  refundAmount,
  refundId,
  refundStatus,
  cancelledBy,
  reservationUserId,
  reservationEmail,
  adminSection,
  hideRefundFinancials = false,
  className = "",
}: CancelledReservationDetailsProps) {
  const hasRefundAmount = (refundAmount ?? 0) > 0;
  const showRefundAmount = !hideRefundFinancials && hasRefundAmount;
  const showRefundMeta =
    showRefundAmount || Boolean(refundStatus) || Boolean(refundId);
  const cancellationFooter =
    cancelledAt != null && cancelledAt !== ""
      ? formatCancellationAttribution(
          cancelledAt,
          cancelledBy,
          reservationUserId,
          reservationEmail,
        )
      : null;

  return (
    <div
      className={`bg-red-50 rounded-lg p-4 sm:p-5 ${className}`.trim()}
    >
      <h3 className="text-lg font-semibold text-red-900 mb-4">
        Información de cancelación
      </h3>

      <div className="space-y-3 text-sm">
        {showRefundMeta && (
          <>
            {showRefundAmount && (
              <div>
                <p className="text-red-700 font-medium mb-1">Monto del reembolso</p>
                <p className="text-red-900 font-semibold tabular-nums">
                  ${formatCurrency(refundAmount!)} MXN
                </p>
              </div>
            )}

            {refundStatus && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-red-700 font-medium">
                  Estado del reembolso
                </span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${refundStatusPillClass(refundStatus)}`}
                >
                  {refundStatusLabel(refundStatus)}
                </span>
              </div>
            )}

            {refundId && !hideRefundFinancials && (
              <p className="text-red-900 font-mono text-xs mt-1 break-all">
                ID de reembolso: {refundId}
              </p>
            )}

            <div className="pt-3 border-t border-red-200/70">
              <p className="text-red-700 font-medium mb-2">
                Información sobre el reembolso
              </p>
              {refundStatus === "failed" ? (
                <ul className="space-y-1.5 text-red-800 list-disc list-inside">
                  <li>
                    El reembolso automático no pudo completarse. El equipo de
                    soporte te contactará para resolverlo manualmente.
                  </li>
                </ul>
              ) : refundStatus === "processed" ? (
                <ul className="space-y-1.5 text-red-800 list-disc list-inside">
                  <li>El reembolso ya fue enviado a tu banco o tarjeta.</li>
                  <li>{REFUND_PROCESSED_BANK_NOTE}</li>
                </ul>
              ) : (
                <ul className="space-y-1.5 text-red-800 list-disc list-inside">
                  <li>
                    Estamos procesando el reembolso a tu método de pago original.
                  </li>
                  <li>{REFUND_PENDING_BANK_NOTE}</li>
                </ul>
              )}
            </div>
          </>
        )}

        {adminSection ? (
          <div className="pt-3 border-t border-red-200/70">{adminSection}</div>
        ) : null}

        {cancellationFooter ? (
          <p className="text-red-900 font-semibold pt-1">{cancellationFooter}</p>
        ) : null}
      </div>
    </div>
  );
}
