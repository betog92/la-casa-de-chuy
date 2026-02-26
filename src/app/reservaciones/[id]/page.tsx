"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parse, addDays, startOfDay, isValid } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
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
import {
  calculateRefundAmount,
  getTotalConektaPaid,
} from "@/utils/refunds";
import { DiscountRow } from "@/components/DiscountRow";
import RescheduleModal from "@/components/RescheduleModal";
import type { Reservation } from "@/types/reservation";

export default function ReservationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const reservationId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Solo para errores de carga inicial
  const [actionError, setActionError] = useState<string | null>(null); // Para errores de cancelación
  const [rescheduleError, setRescheduleError] = useState<string | null>(null); // Para errores de reagendamiento
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    order_number: "",
    import_notes: "",
  });
  const [savingDetail, setSavingDetail] = useState(false);
  const [editDetailError, setEditDetailError] = useState<string | null>(null);
  const [saveDetailSuccess, setSaveDetailSuccess] = useState(false);
  const [pendingAdminPayment, setPendingAdminPayment] = useState<{
    date: string;
    startTime: string;
    additionalAmount: number;
  } | null>(null);
  const hasLoadedRef = useRef(false);
  const previousReservationIdRef = useRef<string | null>(null);

  // Verificar si el usuario es admin (para mostrar datos de contacto completos)
  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data) => setIsAdmin(data.success === true && data.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, [user?.id]);

  // Sincronizar formulario de edición con la reserva cargada
  useEffect(() => {
    if (!reservation) return;
    setEditForm({
      name: reservation.name ?? "",
      email: reservation.email ?? "",
      phone: reservation.phone ?? "",
      order_number: reservation.order_number ?? "",
      import_notes: reservation.import_notes ?? "",
    });
  }, [reservation?.id, reservation?.name, reservation?.email, reservation?.phone, reservation?.order_number, reservation?.import_notes]);

  // Ocultar mensaje "Detalles guardados" tras unos segundos
  useEffect(() => {
    if (!saveDetailSuccess) return;
    const t = setTimeout(() => setSaveDetailSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [saveDetailSuccess]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
      return;
    }

    if (!user || !reservationId) return;

    // Resetear flag si cambió el ID de reserva
    if (previousReservationIdRef.current !== reservationId) {
      hasLoadedRef.current = false;
      previousReservationIdRef.current = reservationId;
    }

    // Evitar recargar si ya se cargó la reserva para este ID
    if (hasLoadedRef.current) {
      return;
    }

    const loadReservation = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/reservations/${reservationId}`);
        const result = await response.json();

        if (!result.success) {
          setError(
            result.error || "No se pudo cargar la información de la reserva"
          );
          return;
        }

        if (!result.reservation) {
          setError("Reserva no encontrada");
          return;
        }

        // Verificar que la reserva pertenece al usuario
        // Esto se hace en el backend, pero verificamos aquí también por seguridad
        setReservation(result.reservation as Reservation);
        hasLoadedRef.current = true;
      } catch (err) {
        console.error("Error loading reservation:", err);
        setError("Ocurrió un error al cargar la reserva");
      } finally {
        setLoading(false);
      }
    };

    loadReservation();
  }, [user?.id, reservationId, authLoading, router]);

  // Scroll al top cuando la página se monta
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [reservationId]);

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
        `/api/reservations/${reservationId}/cancel`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (!result.success) {
        setActionError(result.error || "Error al cancelar la reserva");
        setShowCancelModal(false);
        return;
      }

      setShowCancelModal(false);
      // Usar cancelled_by de la respuesta si vino (admin canceló); si no, refetch por compatibilidad
      const cancelledAt = new Date().toISOString();
      if (result.cancelled_by !== undefined) {
        setReservation({
          ...reservation,
          status: "cancelled",
          refund_amount: result.refund_amount,
          refund_id: result.refund_id ?? null,
          refund_status: result.refund_status ?? "pending",
          cancelled_at: cancelledAt,
          cancelled_by: result.cancelled_by ?? undefined,
        });
      } else {
        try {
          const res = await fetch(`/api/reservations/${reservationId}`);
          const data = await res.json();
          if (data.success && data.reservation) {
            setReservation(data.reservation as Reservation);
            return;
          }
        } catch {
          // Refetch falló; la cancelación sí fue exitosa
        }
        setReservation({
          ...reservation,
          status: "cancelled",
          refund_amount: result.refund_amount,
          refund_id: result.refund_id ?? null,
          refund_status: result.refund_status ?? "pending",
          cancelled_at: cancelledAt,
        });
      }
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
        `/api/reservations/${reservationId}/reschedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ date, startTime }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        setRescheduleError(result.error || "Error al reagendar la reserva");
        // NO cerrar el modal cuando hay error - permitir que el usuario intente de nuevo
        return;
      }

      // Verificar si requiere pago adicional
      if (result.requiresPayment === true && result.additionalAmount) {
        if (isAdmin && result.adminCanConfirmPaymentMethod) {
          setPendingAdminPayment({
            date,
            startTime,
            additionalAmount: result.additionalAmount,
          });
          return;
        }
        setShowRescheduleModal(false);
        router.push(
          `/reservar/reagendar/pago?reservationId=${reservationId}&newDate=${date}&newStartTime=${startTime}&additionalAmount=${result.additionalAmount}`
        );
        return;
      }

      // No requiere pago - reagendamiento exitoso, redirigir a confirmación
      setShowRescheduleModal(false);
      setPendingAdminPayment(null);
      router.push(
        `/reservar/confirmacion?id=${reservationId}&rescheduled=true`
      );
    } catch (err) {
      console.error("Error rescheduling reservation:", err);
      setRescheduleError("Error inesperado al reagendar la reserva");
      // NO cerrar el modal cuando hay error
    } finally {
      setRescheduling(false);
    }
  };

  // Limpiar error de reagendamiento cuando el modal se cierra
  const handleCloseRescheduleModal = () => {
    setShowRescheduleModal(false);
    setRescheduleError(null);
    setPendingAdminPayment(null);
  };

  const handleConfirmAdminPayment = async () => {
    if (!pendingAdminPayment) return;
    setRescheduling(true);
    setRescheduleError(null);
    try {
      const response = await fetch(
        `/api/reservations/${reservationId}/reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: pendingAdminPayment.date,
            startTime: pendingAdminPayment.startTime,
            adminReschedule: true,
          }),
        }
      );
      const result = await response.json();
      if (!result.success) {
        setRescheduleError(result.error || "Error al reagendar la reserva");
        return;
      }
      setShowRescheduleModal(false);
      const amountAdded = pendingAdminPayment.additionalAmount;
      setPendingAdminPayment(null);
      const confirmUrl =
        amountAdded > 0
          ? `/reservar/confirmacion?id=${reservationId}&rescheduled=true&additionalAmount=${amountAdded}`
          : `/reservar/confirmacion?id=${reservationId}&rescheduled=true`;
      router.push(confirmUrl);
    } catch (err) {
      console.error("Error rescheduling (admin):", err);
      setRescheduleError("Error inesperado al reagendar la reserva");
    } finally {
      setRescheduling(false);
    }
  };

  const businessDays = getBusinessDaysUntilReservation();
  const hasReachedRescheduleLimit = (reservation?.reschedule_count || 0) >= 1;
  const canCancel = isAdmin
    ? true
    : businessDays !== null && businessDays >= 5;
  const canReschedule = isAdmin
    ? true
    : businessDays !== null && businessDays >= 5 && !hasReachedRescheduleLimit;

  // Determinar si el texto debe ser rojo (menos de 5 días hábiles)
  const isPastDeadline = businessDays !== null && businessDays < 5;
  const totalDiscounts = calculateTotalDiscounts();
  const hasDiscounts = totalDiscounts > 0;
  const hasAdditionalPayment =
    (reservation?.additional_payment_amount ?? 0) > 0 ||
    (reservation?.reschedule_history?.some(
      (h) => (h.additional_payment_amount ?? 0) > 0
    ) ?? false);
  const showPriceBreakdown = hasDiscounts || hasAdditionalPayment;
  const paidMethods = ["conekta", "efectivo", "transferencia"] as const;
  const isPaidAdditional = (h: { additional_payment_amount?: number | null; additional_payment_method?: string | null }) =>
    (h.additional_payment_amount ?? 0) > 0 &&
    h.additional_payment_method != null &&
    paidMethods.includes(h.additional_payment_method as (typeof paidMethods)[number]);
  const additionalFromHistory = (reservation?.reschedule_history ?? []).reduce(
    (sum, h) => sum + (isPaidAdditional(h) ? (h.additional_payment_amount ?? 0) : 0),
    0
  );
  const originalPriceForBreakdown = Math.max(
    0,
    (reservation?.price ?? 0) - additionalFromHistory
  );
  const rescheduleHistoryWithPayment = (reservation?.reschedule_history ?? []).filter(
    (h) => isPaidAdditional(h)
  );

  if (loading || authLoading) {
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
              href="/account"
              className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              Volver a mis reservas
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
          {reservation.source === "google_import" && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
              Cita importada de Google Calendar (web anterior)
            </div>
          )}
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
                {formatTimeRange(reservation.start_time, reservation.end_time)}
              </p>
            </div>

            {/* Datos de contacto: editable solo para admin en citas de Alberto */}
            {isAdmin && (
              <div className="pt-4 border-t border-zinc-200 space-y-3">
                {reservation.source === "google_import" &&
                reservation.import_type === "manual_client" ? (
                  <>
                    <div>
                      <p className="text-sm text-zinc-600 mb-1">Nombre</p>
                      <p className="text-lg font-medium text-[#103948]">{reservation.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-600 mb-1">Email</p>
                      <p className="text-lg font-medium text-[#103948]">{reservation.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-600 mb-1">Teléfono</p>
                      <p className="text-lg font-medium text-[#103948]">
                        {reservation.phone || "No proporcionado"}
                      </p>
                    </div>
                    {(reservation.order_number || reservation.google_event_id) && (
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">Orden (web anterior)</p>
                        <p className="text-lg font-medium text-[#103948]">
                          {reservation.order_number ? `#${reservation.order_number}` : reservation.google_event_id}
                        </p>
                      </div>
                    )}
                    <div>
                      <label htmlFor="edit-notes" className="text-sm text-zinc-600 mb-1 block">Detalles de la cita</label>
                      <textarea
                        id="edit-notes"
                        value={editForm.import_notes}
                        onChange={(e) => setEditForm((f) => ({ ...f, import_notes: e.target.value }))}
                        rows={4}
                        maxLength={10000}
                        className="w-full rounded border border-zinc-300 px-3 py-2 text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                      />
                    </div>
                    {editDetailError && (
                      <p className="text-sm text-red-600">{editDetailError}</p>
                    )}
                    {saveDetailSuccess && (
                      <p className="text-sm text-green-600 font-medium">Detalles guardados correctamente.</p>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        setEditDetailError(null);
                        setSaveDetailSuccess(false);
                        setSavingDetail(true);
                        try {
                          const res = await fetch(`/api/reservations/${reservation.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ import_notes: editForm.import_notes || null }),
                          });
                          const data = await res.json();
                          if (!data.success) {
                            setEditDetailError(data.error || "Error al guardar");
                            return;
                          }
                          const updated = data.reservation;
                          setReservation((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  import_notes: updated.import_notes ?? prev.import_notes ?? null,
                                  import_notes_edited_at: updated.import_notes_edited_at ?? prev.import_notes_edited_at ?? null,
                                  import_notes_edited_by: updated.import_notes_edited_by ?? prev.import_notes_edited_by ?? null,
                                }
                              : null
                          );
                          setSaveDetailSuccess(true);
                        } catch {
                          setEditDetailError("Error de conexión");
                        } finally {
                          setSavingDetail(false);
                        }
                      }}
                      disabled={savingDetail}
                      className="rounded bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0f2d38] disabled:opacity-50"
                    >
                      {savingDetail ? "Guardando…" : "Guardar detalles de la cita"}
                    </button>
                    {reservation.import_notes_edited_at && (() => {
                      const editedAt = new Date(reservation.import_notes_edited_at);
                      const isValid = !Number.isNaN(editedAt.getTime());
                      return isValid ? (
                        <p className="text-xs text-zinc-500 mt-2">
                          Editado por última vez por{" "}
                          {reservation.import_notes_edited_by?.name ?? "—"}{" "}
                          el {format(editedAt, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })}.
                        </p>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-zinc-600 mb-1">Nombre</p>
                      <p className="text-lg font-medium text-[#103948]">{reservation.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-600 mb-1">Email</p>
                      <p className="text-lg font-medium text-[#103948]">{reservation.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-600 mb-1">Teléfono</p>
                      <p className="text-lg font-medium text-[#103948]">
                        {reservation.phone || "No proporcionado"}
                      </p>
                    </div>
                    {reservation.source === "google_import" && (reservation.order_number || reservation.google_event_id) && (
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">Orden (web anterior)</p>
                        <p className="text-lg font-medium text-[#103948]">
                          {reservation.order_number ? `#${reservation.order_number}` : reservation.google_event_id}
                        </p>
                      </div>
                    )}
                    {reservation.source === "google_import" && reservation.import_notes && (
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">Detalles de la cita</p>
                        <p className="text-base font-medium text-[#103948] whitespace-pre-line">
                          {reservation.import_notes}
                        </p>
                      </div>
                    )}
                    {reservation.source !== "google_import" && (
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">Creada el</p>
                        <p className="text-lg font-medium text-[#103948]">
                          {format(
                            new Date(reservation.created_at),
                            "d 'de' MMMM yyyy, h:mm a",
                            { locale: es }
                          )}
                        </p>
                      </div>
                    )}
                    {reservation.created_by && (
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">Creada por</p>
                        <p className="text-lg font-medium text-[#103948]">
                          {reservation.created_by.name?.trim() || reservation.created_by.email}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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

                    {(() => {
                      const pointsDiscount = calculatePointsDiscount(
                        reservation.loyalty_points_used
                      );
                      if (pointsDiscount <= 0) {
                        return null;
                      }
                      return (
                        <DiscountRow
                          label={`Puntos de lealtad usados (${reservation.loyalty_points_used} puntos)`}
                          amount={pointsDiscount}
                        />
                      );
                    })()}

                    {isValidDiscount(reservation.credits_used) && (
                      <DiscountRow
                        label="Créditos usados"
                        amount={reservation.credits_used!}
                      />
                    )}
                  </>
                )}

                {!hasDiscounts && hasAdditionalPayment && (
                  <>
                    <div className="flex justify-between text-zinc-700">
                      <span>Precio de la reserva:</span>
                      <span>
                        ${formatCurrency(originalPriceForBreakdown)}
                      </span>
                    </div>
                    {rescheduleHistoryWithPayment.map((h, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-sm text-zinc-700"
                      >
                        <span>
                          Pago adicional por reagendamiento
                          {rescheduleHistoryWithPayment.length > 1
                            ? ` (${idx + 1})`
                            : ""}
                          :
                        </span>
                        <span className="text-[#103948]">
                          +
                          ${formatCurrency(h.additional_payment_amount ?? 0)}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                <div className="pt-5 border-t border-zinc-200 flex justify-between font-semibold text-lg">
                  <span>Total pagado:</span>
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

          {/* Un bloque completo por cada reagendamiento */}
          {(reservation.reschedule_history?.length ?? 0) > 0 &&
            (reservation.reschedule_history ?? []).map((h, idx) => (
              <div
                key={idx}
                className="pt-4 border-t border-zinc-200 -mx-6 sm:-mx-8"
              >
                <div className="bg-orange-50 rounded-lg p-4 mx-6 sm:mx-8">
                  <h3 className="text-lg font-semibold text-orange-900 mb-3">
                    Información de Reagendamiento
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-orange-700 font-medium mb-1">
                        {(reservation.reschedule_history?.length ?? 0) === 1
                          ? "Fecha y horario original:"
                          : "Fecha y horario anterior:"}
                      </p>
                      <p className="text-orange-900">
                        {formatDisplayDate(h.previous_date)} -{" "}
                        {formatTimeRange(h.previous_start_time)}
                      </p>
                    </div>
                    {(reservation.reschedule_history?.length ?? 0) > 1 && (
                      <div>
                        <p className="text-orange-700 font-medium mb-1">
                          Nueva fecha y horario:
                        </p>
                        <p className="text-orange-900">
                          {formatDisplayDate(h.new_date)} -{" "}
                          {formatTimeRange(h.new_start_time)}
                        </p>
                      </div>
                    )}
                    {(h.additional_payment_amount ?? 0) > 0 && (
                      <div>
                        <p className="text-orange-700 font-medium mb-1">
                          Pago adicional por reagendamiento:
                        </p>
                        <p className="text-orange-900 font-semibold mb-1">
                          $
                          {formatCurrency(h.additional_payment_amount ?? 0)}{" "}
                          MXN
                        </p>
                        {h.rescheduled_by && h.additional_payment_method && (
                          <p className="text-orange-900 mb-1">
                            Método:{" "}
                            {h.additional_payment_method === "conekta"
                              ? "En línea"
                              : h.additional_payment_method === "pendiente"
                                ? "Pendiente de cobro"
                                : h.additional_payment_method.charAt(0).toUpperCase() +
                                  h.additional_payment_method.slice(1)}
                          </p>
                        )}
                        {!h.rescheduled_by &&
                          reservation.additional_payment_id &&
                          idx === (reservation.reschedule_history ?? []).length - 1 && (
                            <p className="text-orange-900 font-mono text-xs mt-1">
                              ID de pago: {reservation.additional_payment_id}
                            </p>
                          )}
                      </div>
                    )}
                    {h.rescheduled_by && (
                      <p className="text-orange-900 font-semibold pt-1">
                        Realizado por:{" "}
                        {h.rescheduled_by.name?.trim() ||
                          h.rescheduled_by.email}{" "}
                        ·{" "}
                        {format(
                          new Date(h.rescheduled_at),
                          "d 'de' MMMM 'a las' h:mm a",
                          { locale: es }
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {/* Fallback: sin historial (reservas reagendadas antes de migración 15) */}
          {(reservation.reschedule_count ?? 0) > 0 &&
            (reservation.reschedule_history?.length ?? 0) === 0 && (
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
                    {(reservation.additional_payment_amount ?? 0) > 0 && (
                      <div>
                        <p className="text-orange-700 font-medium mb-1">
                          Pago adicional por reagendamiento:
                        </p>
                        <p className="text-orange-900 font-semibold mb-1">
                          $
                          {formatCurrency(
                            reservation.additional_payment_amount ?? 0
                          )}{" "}
                          MXN
                        </p>
                        {reservation.additional_payment_method && (
                          <p className="text-orange-900 mb-1">
                            Método:{" "}
                            {reservation.additional_payment_method === "conekta"
                              ? "En línea"
                              : reservation.additional_payment_method === "pendiente"
                                ? "Pendiente de cobro"
                                : reservation.additional_payment_method.charAt(0).toUpperCase() +
                                  reservation.additional_payment_method.slice(1)}
                          </p>
                        )}
                        {reservation.additional_payment_id && (
                          <p className="text-orange-900 font-mono text-xs">
                            ID de pago: {reservation.additional_payment_id}
                          </p>
                        )}
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
                      <p className="text-xs text-red-700">
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
                {reservation.cancelled_by && (
                  <p className="mt-3 text-sm text-red-800 font-semibold pt-2 border-t border-red-200">
                    Cancelado por:{" "}
                    {reservation.cancelled_by.name?.trim() ||
                      reservation.cancelled_by.email}
                    {reservation.cancelled_at &&
                    isValid(new Date(reservation.cancelled_at))
                      ? ` · ${format(
                          new Date(reservation.cancelled_at),
                          "d 'de' MMMM 'a las' h:mm a",
                          { locale: es }
                        )}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          {reservation.status === "confirmed" && (
            <div className="pt-6 border-t border-zinc-200 space-y-4">
              {reservation.source === "google_import" && !isAdmin && (
                <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  Esta cita fue importada de la web anterior y no puede reagendarse ni cancelarse desde aquí.
                </p>
              )}
              <div>
                <button
                  onClick={() => setShowRescheduleModal(true)}
                  disabled={!canReschedule || rescheduling || (!isAdmin && reservation.source === "google_import")}
                  className="w-full bg-[#103948] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {rescheduling ? "Reagendando..." : "Reagendar"}
                </button>
                {isAdmin ? (
                  <p className="mt-2 text-xs text-zinc-600">
                    Como administrador puedes reagendar en cualquier momento y sin
                    límite de intentos. Si la nueva fecha tiene mayor costo, se
                    asignará como pago pendiente.
                  </p>
                ) : (
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
                )}
              </div>
              <div>
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={!canCancel || (!isAdmin && reservation.source === "google_import")}
                  className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Cancelar Reserva
                </button>
                {isAdmin ? (
                  <p className="mt-2 text-xs text-zinc-600">
                    Como administrador puedes cancelar en cualquier momento.
                  </p>
                ) : (
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
                )}
              </div>
            </div>
          )}

          {/* Navegación */}
          <div className="pt-6 border-t border-zinc-200">
            <Link
              href={isAdmin ? "/admin/reservaciones" : "/account"}
              className="block w-full text-center rounded-lg border border-zinc-300 bg-white py-3 px-4 font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              {isAdmin ? "Volver a reservaciones" : "Volver a mis reservas"}
            </Link>
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
                // Reembolso solo por lo pagado con Conekta (tarjeta)
                const totalConektaPaid = getTotalConektaPaid(
                  reservation.payment_method ?? null,
                  reservation.original_price ?? 0,
                  reservation.reschedule_history ?? []
                );
                const refundAmount = calculateRefundAmount(totalConektaPaid);

                return (
                  <div className="mb-4 p-4 bg-zinc-50 rounded-lg">
                    {totalConektaPaid > 0 ? (
                      <>
                        <p className="text-sm text-zinc-600 mb-2">
                          <strong>Reembolso:</strong> Recibirás el 80% del
                          monto pagado con tarjeta (Conekta).
                        </p>
                        <p className="text-lg font-semibold text-[#103948]">
                          Monto a reembolsar: $
                          {formatCurrency(refundAmount)} MXN
                        </p>
                        <p className="text-xs text-zinc-500 mt-2">
                          El reembolso se procesará en un plazo de 5-7 días
                          hábiles al método de pago original.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-zinc-600">
                        No hay reembolso por tarjeta: esta reserva se pagó por
                        otro método (efectivo/transferencia).
                      </p>
                    )}
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
          adminPaymentStep={pendingAdminPayment}
          onConfirmAdminPayment={handleConfirmAdminPayment}
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
