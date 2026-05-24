import type { ReactNode } from "react";
import {
  formatCurrency,
  formatDisplayDateTime,
  formatDisplayDateTimeShort,
} from "@/utils/formatters";

type CancelledBy = { name: string | null; email: string };

export type CancelledReservationDetailsProps = {
  cancelledAt?: string | null;
  refundAmount?: number | null;
  refundId?: string | null;
  refundStatus?: string | null;
  cancelledBy?: CancelledBy | null;
  /** Solo en detalle con sesión admin (reintentar reembolso, etc.) */
  adminSection?: ReactNode;
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
  adminSection,
  className = "",
}: CancelledReservationDetailsProps) {
  const hasRefund = (refundAmount ?? 0) > 0;
  const cancelledAtValid = cancelledAt
    ? formatDisplayDateTime(cancelledAt)
    : null;
  const cancelledAtShort = cancelledAt
    ? formatDisplayDateTimeShort(cancelledAt)
    : null;

  return (
    <div
      className={`bg-red-50 rounded-lg p-4 sm:p-5 ${className}`.trim()}
    >
      <h3 className="text-lg font-semibold text-red-900 mb-4">
        Reserva Cancelada
      </h3>

      <div className="space-y-3 text-sm">
        {cancelledAtValid && (
          <div>
            <p className="text-red-700 font-medium mb-1">Fecha de cancelación</p>
            <p className="text-red-900">{cancelledAtValid}</p>
          </div>
        )}

        {hasRefund && (
          <>
            <div>
              <p className="text-red-700 font-medium mb-1">Monto del reembolso</p>
              <p className="text-red-900 font-semibold tabular-nums">
                ${formatCurrency(refundAmount!)} MXN
              </p>
            </div>

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

            {refundId && (
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
                  <li>
                    Puede tardar de 5 a 10 días hábiles en verse en tu estado de
                    cuenta.
                  </li>
                </ul>
              ) : (
                <ul className="space-y-1.5 text-red-800 list-disc list-inside">
                  <li>
                    Estamos procesando el reembolso a tu método de pago original.
                  </li>
                  <li>
                    Una vez enviado al banco, puede tardar de 5 a 10 días hábiles
                    en verse en tu estado de cuenta.
                  </li>
                </ul>
              )}
            </div>
          </>
        )}

        {adminSection ? (
          <div className="pt-3 border-t border-red-200/70">{adminSection}</div>
        ) : null}

        {cancelledBy && (
          <p className="text-red-900 font-semibold pt-3 border-t border-red-200/70">
            Cancelado por: {cancelledBy.name?.trim() || cancelledBy.email}
            {cancelledAtShort ? ` · ${cancelledAtShort}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
