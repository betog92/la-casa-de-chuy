"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parse, addDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import {
  calculateBusinessDays,
  getMonterreyToday,
} from "@/utils/business-days";
import {
  formatDisplayDate,
  formatTimeRange,
  formatReservationId,
  formatCurrency,
  formatBusinessDaysMessage,
} from "@/utils/formatters";
import {
  isValidDiscount,
  calculatePointsDiscount,
  isValidDiscountCode,
} from "@/utils/discounts";
import { calculateTotalPaid, calculateRefundAmount } from "@/utils/refunds";
import { DiscountRow } from "@/components/DiscountRow";
import RescheduleModal from "@/components/RescheduleModal";
import type { Reservation } from "@/types/reservation";

export default function GuestReservationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setError("Token inválido");
      setLoading(false);
      return;
    }

    if (hasLoadedRef.current) {
      return;
    }

    const fetchReservation = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/guest-reservations/${token}`);
        const result = await response.json();

        if (!result.success) {
          setError(result.error || "Error al cargar la reserva");
          return;
        }

        if (!result.reservation) {
          setError("Reserva no encontrada");
          return;
        }

        setReservation(result.reservation as Reservation);
        hasLoadedRef.current = true;
      } catch (err) {
        console.error("Error loading reservation:", err);
        setError("Ocurrió un error al cargar la reserva");
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [token]);

  // Scroll al top cuando la página se monta
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Calcular días hábiles hasta la reserva
  const getBusinessDaysUntilReservation = (): number | null => {
    if (!reservation) return null;
    try {
      const today = getMonterreyToday();
      const tomorrow = addDays(today, 1);
      const reservationDate = startOfDay(
        parse(reservation.date, "yyyy-MM-dd", new Date())
      );
      return calculateBusinessDays(tomorrow, reservationDate);
    } catch {
      return null;
    }
  };

  // Calcular total de descuentos
  const calculateTotalDiscounts = (): number => {
    if (!reservation) return 0;

    const pointsDiscount = calculatePointsDiscount(
      reservation.loyalty_points_used
    );

    const discounts = [
      reservation.last_minute_discount,
      reservation.loyalty_discount,
      reservation.referral_discount,
      reservation.discount_code_discount,
      pointsDiscount,
      reservation.credits_used,
    ]
      .filter(isValidDiscount)
      .reduce((sum: number, discount) => sum + (discount || 0), 0);

    return discounts;
  };

  const handleCancel = async () => {
    if (!reservation) return;

    try {
      setCancelling(true);
      setActionError(null);
      const response = await fetch(
        `/api/reservations/${reservation.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token, // Enviar token para validación
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        setActionError(result.error || "Error al cancelar la reserva");
        setShowCancelModal(false);
        return;
      }

      // Actualizar la reserva con los datos de cancelación
      setReservation({
        ...reservation,
        status: "cancelled",
        refund_amount: result.refund_amount,
        refund_id: result.refund_id || null,
        refund_status: result.refund_status || "pending",
        cancelled_at: new Date().toISOString(),
      });
      setShowCancelModal(false);
    } catch (err) {
      console.error("Error cancelling reservation:", err);
      setActionError("Error inesperado al cancelar la reserva");
      setShowCancelModal(false);
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async (date: string, startTime: string) => {
    if (!reservation) return;

    try {
      setRescheduling(true);
      setRescheduleError(null);
      const response = await fetch(
        `/api/reservations/${reservation.id}/reschedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ date, startTime, token }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        setRescheduleError(result.error || "Error al reagendar la reserva");
        return;
      }

      // Verificar si requiere pago adicional
      if (result.requiresPayment === true && result.additionalAmount) {
        // Requiere pago adicional - redirigir a la página de pago
        setShowRescheduleModal(false);
        router.push(
          `/reservar/reagendar/pago?reservationId=${reservation.id}&newDate=${date}&newStartTime=${startTime}&additionalAmount=${result.additionalAmount}&token=${token}`
        );
        return;
      }

      // No requiere pago - reagendamiento exitoso, redirigir a confirmación
      setShowRescheduleModal(false);
      router.push(
        `/reservar/confirmacion?id=${reservation.id}&rescheduled=true&token=${token}`
      );
    } catch (err) {
      console.error("Error rescheduling reservation:", err);
      setRescheduleError("Error inesperado al reagendar la reserva");
    } finally {
      setRescheduling(false);
    }
  };

  // Limpiar error de reagendamiento cuando el modal se cierra
  const handleCloseRescheduleModal = () => {
    setShowRescheduleModal(false);
    setRescheduleError(null);
  };

  const businessDays = getBusinessDaysUntilReservation();
  const hasReachedRescheduleLimit = (reservation?.reschedule_count || 0) >= 1;
  const canCancel = businessDays !== null && businessDays >= 5;
  const canReschedule =
    businessDays !== null && businessDays >= 5 && !hasReachedRescheduleLimit;

  // Determinar si el texto debe ser rojo (menos de 5 días hábiles)
  const isPastDeadline = businessDays !== null && businessDays < 5;
  const totalDiscounts = calculateTotalDiscounts();
  const hasDiscounts = totalDiscounts > 0;
  const hasAdditionalPayment =
    (reservation?.additional_payment_amount ?? 0) > 0;
  const showPriceBreakdown = hasDiscounts || hasAdditionalPayment;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto"></div>
          <p className="mt-4 text-zinc-600">
            Cargando información de la reserva...
          </p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold text-zinc-900">
              {error || "Reserva no encontrada"}
            </h1>
            <p className="mb-6 text-zinc-600">
              {error ||
                "No se pudo encontrar la información de la reserva. Por favor verifica el enlace o contacta soporte."}
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Mostrar error de cancelación como banner discreto */}
        {actionError && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-1">
                  Error
                </h3>
                <p className="text-sm text-red-700">{actionError}</p>
              </div>
              <button
                onClick={() => setActionError(null)}
                className="ml-4 text-red-600 hover:text-red-800"
                aria-label="Cerrar mensaje de error"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Detalles de la Reserva
          </h1>
          <p className="text-zinc-600">Gestiona tu reserva desde aquí</p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Estado de la reserva e ID */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
            <div>
              <p className="text-sm text-zinc-600 mb-1">Estado</p>
              <span
                className={`inline-block px-3 py-1.5 text-sm font-medium rounded-full ${
                  reservation.status === "confirmed" &&
                  reservation.reschedule_count &&
                  reservation.reschedule_count > 0
                    ? "bg-orange-100 text-orange-800"
                    : reservation.status === "confirmed"
                    ? "bg-green-100 text-green-800"
                    : reservation.status === "cancelled"
                    ? "bg-red-100 text-red-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {reservation.status === "confirmed" &&
                reservation.reschedule_count &&
                reservation.reschedule_count > 0
                  ? "Reagendada"
                  : reservation.status === "confirmed"
                  ? "Confirmada"
                  : reservation.status === "cancelled"
                  ? "Cancelada"
                  : "Completada"}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-600 mb-1">ID de Reserva</p>
              <p className="text-sm font-mono text-[#103948] font-semibold">
                {formatReservationId(reservation.id)}
              </p>
            </div>
          </div>

          {/* Información básica */}
          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-600 mb-1">
                {reservation.reschedule_count &&
                reservation.reschedule_count > 0
                  ? "Fecha reagendada"
                  : "Fecha"}
              </p>
              <p className="text-lg font-medium text-[#103948]">
                {formatDisplayDate(reservation.date)}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-600 mb-1">
                {reservation.reschedule_count &&
                reservation.reschedule_count > 0
                  ? "Horario reagendado"
                  : "Horario"}
              </p>
              <p className="text-lg font-medium text-[#103948]">
                {formatTimeRange(reservation.start_time)}
              </p>
            </div>

            {/* Datos de contacto (solo para invitados) */}
            <div className="pt-4 border-t border-zinc-200 space-y-3">
              <div>
                <p className="text-sm text-zinc-600 mb-1">Nombre</p>
                <p className="text-lg font-medium text-[#103948]">
                  {reservation.name}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-600 mb-1">Email</p>
                <p className="text-lg font-medium text-[#103948]">
                  {reservation.email}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-600 mb-1">Teléfono</p>
                <p className="text-lg font-medium text-[#103948]">
                  {reservation.phone || "No proporcionado"}
                </p>
              </div>
            </div>
          </div>

          {/* Desglose de precios (descuentos y/o pago adicional por reagendamiento) */}
          {showPriceBreakdown && (
            <div className="pt-4 border-t border-zinc-200">
              <h3 className="text-lg font-semibold text-[#103948] mb-4">
                Desglose de Precios
              </h3>
              <div className="space-y-2">
                {hasDiscounts && (
                  <>
                    <div className="flex justify-between text-zinc-700">
                      <span>Precio original:</span>
                      <span className="line-through text-zinc-400">
                        ${formatCurrency(reservation.original_price)}
                      </span>
                    </div>

                    {isValidDiscount(reservation.last_minute_discount) && (
                      <DiscountRow
                        label="Descuento último minuto"
                        amount={reservation.last_minute_discount!}
                      />
                    )}

                    {isValidDiscount(reservation.loyalty_discount) && (
                      <DiscountRow
                        label={
                          reservation.original_price &&
                          Number(reservation.original_price) > 0
                            ? `Descuento fidelización (${Math.round(
                                (Number(reservation.loyalty_discount!) /
                                  Number(reservation.original_price)) *
                                  100
                              )}%)`
                            : "Descuento fidelización"
                        }
                        amount={reservation.loyalty_discount!}
                      />
                    )}

                    {isValidDiscount(reservation.referral_discount) && (
                      <DiscountRow
                        label="Descuento por referido"
                        amount={reservation.referral_discount!}
                      />
                    )}

                    {isValidDiscountCode(
                      reservation.discount_code,
                      reservation.discount_code_discount
                    ) && (
                      <DiscountRow
                        label={`Descuento código "${reservation.discount_code!.trim()}"`}
                        amount={reservation.discount_code_discount!}
                      />
                    )}

                    {isValidDiscount(
                      calculatePointsDiscount(reservation.loyalty_points_used)
                    ) && (
                      <DiscountRow
                        label="Descuento por puntos de lealtad"
                        amount={
                          calculatePointsDiscount(
                            reservation.loyalty_points_used
                          ) || 0
                        }
                      />
                    )}

                    {isValidDiscount(reservation.credits_used) && (
                      <DiscountRow
                        label="Créditos utilizados"
                        amount={reservation.credits_used!}
                      />
                    )}
                  </>
                )}

                {!hasDiscounts && hasAdditionalPayment && (
                  <div className="flex justify-between text-zinc-700">
                    <span>Precio de la reserva:</span>
                    <span>${formatCurrency(reservation.price)}</span>
                  </div>
                )}

                {hasAdditionalPayment && (
                  <div className="flex justify-between text-zinc-700">
                    <span>Pago adicional por reagendamiento:</span>
                    <span className="font-semibold">
                      +${formatCurrency(reservation.additional_payment_amount ?? 0)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-200">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total pagado:</span>
                    <span className="text-[#103948]">
                      $
                      {formatCurrency(
                        calculateTotalPaid(
                          reservation.price,
                          reservation.additional_payment_amount
                        )
                      )}
                    </span>
                  </div>
                  {(reservation.payment_id || reservation.additional_payment_id) && (
                    <p className="mt-2 text-sm text-zinc-500 font-mono">
                      ID de pago:{" "}
                      {reservation.additional_payment_id ||
                        reservation.payment_id}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Precio sin descuentos ni pago adicional */}
          {!showPriceBreakdown && (
            <div className="pt-5 border-t border-zinc-200">
              <div className="flex justify-between font-semibold text-lg">
                <span>Precio total:</span>
                <span className="text-[#103948]">
                  ${formatCurrency(reservation.price)}
                </span>
              </div>
              {reservation.payment_id && (
                <p className="mt-2 text-sm text-zinc-500 font-mono">
                  ID de pago: {reservation.payment_id}
                </p>
              )}
            </div>
          )}

          {/* Información de reagendamiento */}
          {(reservation.reschedule_count ?? 0) > 0 && (
            <div className="pt-4 border-t border-zinc-200 -mx-6 sm:-mx-8">
              <div className="bg-orange-50 rounded-lg p-4 mx-6 sm:mx-8">
                <h3 className="text-lg font-semibold text-orange-900 mb-3">
                  Información de Reagendamiento
                </h3>
                <div className="space-y-3 text-sm">
                  {reservation.original_date &&
                    reservation.original_start_time && (
                      <div>
                        <p className="text-orange-700 font-medium mb-1">
                          Fecha y horario original:
                        </p>
                        <p className="text-orange-900">
                          {formatDisplayDate(reservation.original_date)} -{" "}
                          {formatTimeRange(reservation.original_start_time)}
                        </p>
                      </div>
                    )}
                  {reservation.additional_payment_id && (
                    <div>
                      <p className="text-orange-700 font-medium mb-1">
                        Pago adicional por reagendamiento:
                      </p>
                      {(reservation.additional_payment_amount ?? 0) > 0 && (
                        <p className="text-orange-900 font-semibold mb-1">
                          $
                          {formatCurrency(
                            reservation.additional_payment_amount ?? 0
                          )}{" "}
                          MXN
                        </p>
                      )}
                      <p className="text-orange-900 font-mono text-xs">
                        ID de pago: {reservation.additional_payment_id}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Estado de cancelación */}
          {reservation.status === "cancelled" && (
            <div className="pt-4 border-t border-zinc-200 -mx-6 sm:-mx-8">
              <div className="bg-red-50 rounded-lg p-4 mx-6 sm:mx-8">
                <h3 className="text-lg font-semibold text-red-900 mb-3">
                  Reserva Cancelada
                </h3>
                {reservation.cancelled_at && (
                  <div className="mb-2">
                    <p className="text-sm text-red-700">
                      <strong>Fecha de cancelación:</strong>{" "}
                      {format(
                        new Date(reservation.cancelled_at),
                        "d 'de' MMMM 'de' yyyy 'a las' h:mm a",
                        { locale: es }
                      )}
                    </p>
                  </div>
                )}
                {reservation.refund_amount && reservation.refund_amount > 0 && (
                  <div className="space-y-2 text-sm text-red-800">
                    <div>
                      <strong>Monto del reembolso:</strong> $
                      {formatCurrency(reservation.refund_amount)} MXN
                    </div>
                    {(reservation.refund_id || reservation.refund_status) && (
                      <div className="space-y-1">
                        {reservation.refund_id && (
                          <div className="text-red-700">
                            <span className="font-medium">ID de reembolso:</span>{" "}
                            <span className="font-mono text-xs text-red-900">
                              {reservation.refund_id}
                            </span>
                          </div>
                        )}
                        {(reservation.refund_status ||
                          reservation.refund_id?.startsWith("refund_dummy_")) && (
                          <div className="flex items-center gap-2">
                            <span className="text-red-700 font-medium text-sm">
                              Estado del reembolso:
                            </span>
                            <span
                              className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
                                reservation.refund_id?.startsWith(
                                  "refund_dummy_"
                                )
                                  ? "bg-green-100 text-green-800"
                                  : reservation.refund_status === "processed"
                                    ? "bg-green-100 text-green-800"
                                    : reservation.refund_status === "failed"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {reservation.refund_id?.startsWith(
                                "refund_dummy_"
                              )
                                ? "Procesado"
                                : reservation.refund_status === "processed"
                                  ? "Procesado"
                                  : reservation.refund_status === "failed"
                                    ? "Fallido"
                                    : "Pendiente"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3">
                      <p className="text-xs text-red-700 font-medium mb-1">
                        <strong>Información sobre el reembolso:</strong>
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-red-600 list-disc list-inside">
                        <li>
                          El reembolso se procesará en un plazo de 5-7 días
                          hábiles.
                        </li>
                        <li>
                          El monto se reembolsará al método de pago original
                          utilizado para la reserva.
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          {reservation.status === "confirmed" && (
            <div className="pt-6 border-t border-zinc-200 space-y-4">
              <div>
                <button
                  onClick={() => setShowRescheduleModal(true)}
                  disabled={!canReschedule || rescheduling}
                  className="w-full bg-[#103948] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {rescheduling ? "Reagendando..." : "Reagendar"}
                </button>
                <p className="mt-2 text-xs text-zinc-600">
                  {hasReachedRescheduleLimit ? (
                    "Ya has utilizado tu único intento de reagendamiento permitido para esta reserva."
                  ) : (
                    <>
                      El reagendamiento solo está disponible con al menos 5 días
                      hábiles de anticipación.
                      {businessDays !== null && (
                        <>
                          {" "}
                          <span
                            className={
                              isPastDeadline ? "text-red-600" : "text-zinc-600"
                            }
                          >
                            {formatBusinessDaysMessage(businessDays)}
                          </span>
                          .
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
              <div>
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={!canCancel}
                  className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Cancelar Reserva
                </button>
                <p className="mt-2 text-xs text-zinc-600">
                  La cancelación solo está disponible con al menos 5 días
                  hábiles de anticipación.
                  {businessDays !== null && (
                    <>
                      {" "}
                      <span
                        className={
                          isPastDeadline ? "text-red-600" : "text-zinc-600"
                        }
                      >
                        {formatBusinessDaysMessage(businessDays)}
                      </span>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Navegación */}
          <div>
            <Link
              href={`/auth/register?email=${encodeURIComponent(
                reservation.email
              )}`}
              className="block w-full text-center rounded-lg border border-zinc-300 bg-white py-3 px-4 font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Crear cuenta
            </Link>
            <p className="mt-2 text-xs text-zinc-600">
              Al crear cuenta disfruta de descuentos por fidelización, puntos de lealtad, créditos y más beneficios.
            </p>
          </div>
        </div>
      </div>

      {/* Modal de confirmación de cancelación */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-[#103948] mb-4">
              Confirmar Cancelación
            </h2>
            <p className="text-zinc-700 mb-4">
              ¿Estás seguro de que deseas cancelar esta reserva?
            </p>
            {reservation &&
              (() => {
                // Calcular el total pagado (precio + pago adicional si existe)
                const totalPaid = calculateTotalPaid(
                  reservation.price,
                  reservation.additional_payment_amount
                );
                // Calcular reembolso del 80%
                const refundAmount = calculateRefundAmount(totalPaid);

                return (
                  <div className="mb-4 p-4 bg-zinc-50 rounded-lg">
                    <p className="text-sm text-zinc-600 mb-2">
                      <strong>Reembolso:</strong> Recibirás el 80% del monto
                      pagado.
                    </p>
                    <p className="text-lg font-semibold text-[#103948]">
                      Monto a reembolsar: ${formatCurrency(refundAmount)} MXN
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">
                      El reembolso se procesará en un plazo de 5-7 días hábiles
                      al método de pago original.
                    </p>
                  </div>
                );
              })()}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {cancelling ? "Cancelando..." : "Confirmar Cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de reagendamiento */}
      {reservation && (
        <RescheduleModal
          isOpen={showRescheduleModal}
          onClose={handleCloseRescheduleModal}
          onConfirm={handleReschedule}
          currentDate={reservation.date}
          currentStartTime={reservation.start_time}
          isRescheduling={rescheduling}
          externalError={rescheduleError}
        />
      )}
    </div>
  );
}
