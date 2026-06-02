"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parse, addDays, startOfDay } from "date-fns";
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
  getReservationStatusColor,
  getReservationStatusLabel,
} from "@/utils/reservation-status-display";
import {
  formatRescheduleAttribution,
  shouldShowRescheduleActor,
} from "@/utils/reschedule-display";
import { CancelledReservationDetails } from "@/components/CancelledReservationDetails";
import { ReservationSpaceUsage } from "@/components/ReservationSpaceUsage";
import {
  isValidDiscount,
  calculatePointsDiscount,
  isValidDiscountCode,
} from "@/utils/discounts";
import {
  REFUND_CANCEL_MODAL_POLICY,
  REFUND_CANCEL_MODAL_TIMEFRAME_NOTE,
} from "@/constants/refund-copy";
import {
  getCancellationRefundPreview,
  getPriceBeforePaidAdditionals,
  isPaidAdditionalPaymentMethod,
} from "@/utils/refunds";
import {
  PRICE_BREAKDOWN_CREDITOS_LABEL,
  PRICE_BREAKDOWN_MONEDAS_LABEL,
  PRICE_BREAKDOWN_SECTION_TITLE,
  RESCHEDULE_INFO_SECTION_TITLE,
} from "@/constants/price-breakdown-copy";
import { DiscountRow } from "@/components/DiscountRow";
import { RescheduleAdditionalRow } from "@/components/RescheduleAdditionalRow";
import RescheduleModal from "@/components/RescheduleModal";
import TransferMonedasPanel from "@/components/TransferMonedasPanel";
import { AdminReservationInternalInfo } from "@/components/admin/AdminReservationInternalInfo";
import {
  AdminInternalNotesField,
  defaultDetailInputClass,
} from "@/components/admin/AdminInternalNotesField";
import type { Reservation } from "@/types/reservation";
import { durationMinutesBetween } from "@/utils/reservation-helpers";
import {
  buildReservationDetailPatch,
  canSuperAdminEditReservationContact,
  showAdminNotesInContactSection,
} from "@/lib/admin/reservation-contact-edit";

const contactInputClass =
  "w-full rounded border border-zinc-300 px-3 py-2 text-sm text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]";

type ContactEditForm = {
  name: string;
  email: string;
  phone: string;
  order_number: string;
};

function ReservationContactFields({
  reservation,
  editForm,
  setEditForm,
  editable,
  orderLabel,
}: {
  reservation: Reservation;
  editForm: ContactEditForm;
  setEditForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      email: string;
      phone: string;
      order_number: string;
      import_notes: string;
      photographer_studio: string;
    }>
  >;
  editable: boolean;
  orderLabel: string;
}) {
  if (editable) {
    return (
      <>
        <div>
          <label htmlFor="edit-name" className="text-sm text-zinc-600 mb-1 block">
            Nombre
          </label>
          <input
            id="edit-name"
            type="text"
            value={editForm.name}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, name: e.target.value }))
            }
            className={contactInputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="edit-email" className="text-sm text-zinc-600 mb-1 block">
            Email
          </label>
          <input
            id="edit-email"
            type="email"
            value={editForm.email}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, email: e.target.value }))
            }
            className={contactInputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="edit-phone" className="text-sm text-zinc-600 mb-1 block">
            Teléfono
          </label>
          <input
            id="edit-phone"
            type="tel"
            value={editForm.phone}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, phone: e.target.value }))
            }
            className={contactInputClass}
          />
        </div>
        <div>
          <label
            htmlFor="edit-order-number"
            className="text-sm text-zinc-600 mb-1 block"
          >
            {orderLabel}
          </label>
          <input
            id="edit-order-number"
            type="text"
            value={editForm.order_number}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, order_number: e.target.value }))
            }
            className={contactInputClass}
            placeholder="Opcional"
          />
        </div>
      </>
    );
  }

  return (
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
          <p className="text-sm text-zinc-600 mb-1">{orderLabel}</p>
          <p className="text-lg font-medium text-[#103948]">
            {reservation.order_number
              ? `#${reservation.order_number}`
              : reservation.google_event_id}
          </p>
        </div>
      )}
    </>
  );
}

function ReservationDetailLastEdited({
  reservation,
}: {
  reservation: Reservation;
}) {
  if (!reservation.import_notes_edited_at) return null;
  const editedAt = new Date(reservation.import_notes_edited_at);
  if (Number.isNaN(editedAt.getTime())) return null;
  const editor =
    reservation.import_notes_edited_by?.name?.trim() ||
    reservation.import_notes_edited_by?.email ||
    "—";
  return (
    <p className="text-xs text-zinc-500 mt-2">
      Editado por última vez por {editor} el{" "}
      {format(editedAt, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })}.
    </p>
  );
}

export default function ReservationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const reservationId = params.id as string;
  const {
    user,
    loading: authLoading,
    isAdmin,
    isSuperAdmin,
    isAdminLoading,
  } = useAuth();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Solo para errores de carga inicial
  const [actionError, setActionError] = useState<string | null>(null); // Para errores de cancelación
  const [rescheduleError, setRescheduleError] = useState<string | null>(null); // Para errores de reagendamiento
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  /** Evita mostrar el panel de Monedas como "cliente" antes de saber si es admin. */
  const adminMeResolved = !user?.id || !isAdminLoading;
  const [validatingPayment, setValidatingPayment] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    order_number: "",
    import_notes: "",
    photographer_studio: "",
  });
  const [savingDetail, setSavingDetail] = useState(false);
  const [editDetailError, setEditDetailError] = useState<string | null>(null);
  const [saveDetailSuccess, setSaveDetailSuccess] = useState(false);
  const [pendingAdminPayment, setPendingAdminPayment] = useState<{
    date: string;
    startTime: string;
    additionalAmount: number;
  } | null>(null);
  const [retryingRefund, setRetryingRefund] = useState(false);
  const [retryRefundMessage, setRetryRefundMessage] = useState<string | null>(
    null,
  );
  const [retryRefundError, setRetryRefundError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const previousReservationIdRef = useRef<string | null>(null);

  // Sincronizar formulario de edición con la reserva cargada
  useEffect(() => {
    if (!reservation) return;
    setEditForm({
      name: reservation.name ?? "",
      email: reservation.email ?? "",
      phone: reservation.phone ?? "",
      order_number: reservation.order_number ?? "",
      import_notes: reservation.import_notes ?? "",
      photographer_studio: reservation.photographer_studio ?? "",
    });
  }, [
    reservation?.id,
    reservation?.name,
    reservation?.email,
    reservation?.phone,
    reservation?.order_number,
    reservation?.import_notes,
    reservation?.photographer_studio,
  ]);

  useEffect(() => {
    setSaveDetailSuccess(false);
    setEditDetailError(null);
    setRetryRefundMessage(null);
    setRetryRefundError(null);
  }, [reservation?.id]);

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

  const handleRetryRefund = async () => {
    if (!reservation) return;
    setRetryingRefund(true);
    setRetryRefundMessage(null);
    setRetryRefundError(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservation.id}/refund/retry`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRetryRefundError(
          data.error || `Error del servidor (${res.status})`,
        );
        return;
      }
      const processed = Number(data.processed ?? 0);
      const pending = Number(data.pending ?? 0);
      const failed = Number(data.failed ?? 0);
      const reset = Number(data.reset ?? 0);
      const forced = Number(data.forced ?? 0);
      // Si reabrimos algo pero al procesar ya no quedaba nada pending
      // (cron/webhook se adelantó), el servidor manda un `message`
      // explicativo. Lo preferimos sobre el armado por contadores.
      const noOpReset =
        reset > 0 && forced === 0 && processed === 0 && pending === 0 && failed === 0;
      if (noOpReset && typeof data.message === "string" && data.message) {
        setRetryRefundMessage(data.message);
      } else if (reset === 0 && forced === 0) {
        setRetryRefundMessage(
          "No había reembolsos en estado fallido o pendiente para reintentar.",
        );
      } else {
        const acciones: string[] = [];
        if (reset > 0) acciones.push(`${reset} reabierto(s)`);
        if (forced > 0) acciones.push(`${forced} forzado(s)`);
        setRetryRefundMessage(
          `${acciones.join(", ")}. Resultado: ${processed} procesado(s), ${pending} pendiente(s), ${failed} fallido(s).`,
        );
      }
      setReservation((prev) =>
        prev
          ? {
              ...prev,
              refund_status:
                (data.refund_status as Reservation["refund_status"]) ??
                prev.refund_status,
              refund_id: data.refund_id ?? prev.refund_id ?? null,
            }
          : prev,
      );
    } catch (err) {
      console.error("Error retrying refund:", err);
      setRetryRefundError("Error de conexión al reintentar el reembolso");
    } finally {
      setRetryingRefund(false);
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

  const isManualAvailableBlock =
    reservation != null &&
    (reservation.source === "google_import" ||
      reservation.source === "admin") &&
    reservation.import_type === "manual_available";
  const showAdminInternalBlock = isAdmin && !isManualAvailableBlock;
  const showAdminPhotographerEditor =
    showAdminInternalBlock &&
    reservation != null &&
    !(
      (reservation.source === "google_import" ||
        reservation.source === "admin") &&
      reservation.import_type === "manual_client"
    );

  const canEditContact =
    reservation != null &&
    !isAdminLoading &&
    isSuperAdmin &&
    canSuperAdminEditReservationContact(reservation);

  const contactOrderLabel =
    reservation?.source === "admin"
      ? "Número de orden"
      : "Orden (web anterior)";

  const showAdminNotesEditor =
    reservation != null && showAdminNotesInContactSection(reservation);

  const alveroDetailPatch = useMemo(() => {
    if (!reservation) return {};
    return buildReservationDetailPatch(reservation, editForm, {
      includeContact: canEditContact,
      includeNotes: true,
      includePhotographer: true,
    });
  }, [
    reservation,
    editForm.name,
    editForm.email,
    editForm.phone,
    editForm.order_number,
    editForm.import_notes,
    editForm.photographer_studio,
    canEditContact,
  ]);

  const chuyDetailPatch = useMemo(() => {
    if (!reservation) return {};
    return buildReservationDetailPatch(reservation, editForm, {
      includeContact: canEditContact,
      includeNotes: showAdminNotesEditor,
    });
  }, [
    reservation,
    editForm.name,
    editForm.email,
    editForm.phone,
    editForm.order_number,
    editForm.import_notes,
    canEditContact,
    showAdminNotesEditor,
  ]);

  const canSaveAlveroDetail = Object.keys(alveroDetailPatch).length > 0;
  const canSaveChuyDetail = Object.keys(chuyDetailPatch).length > 0;

  useEffect(() => {
    if (canSaveAlveroDetail || canSaveChuyDetail) {
      setEditDetailError(null);
    }
  }, [canSaveAlveroDetail, canSaveChuyDetail]);

  const patchReservationDetails = async (
    fields: Record<string, string | null | undefined>,
  ) => {
    if (!reservation) return;
    if (Object.keys(fields).length === 0) {
      setEditDetailError("No hay cambios para guardar");
      setSaveDetailSuccess(false);
      return;
    }
    setEditDetailError(null);
    setSaveDetailSuccess(false);
    setSavingDetail(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
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
              name: updated.name ?? prev.name,
              email: updated.email ?? prev.email,
              phone: updated.phone ?? prev.phone,
              order_number: updated.order_number ?? prev.order_number ?? null,
              user_id: updated.user_id ?? prev.user_id ?? null,
              import_notes: updated.import_notes ?? prev.import_notes ?? null,
              import_notes_edited_at:
                updated.import_notes_edited_at ??
                prev.import_notes_edited_at ??
                null,
              import_notes_edited_by:
                updated.import_notes_edited_by ??
                prev.import_notes_edited_by ??
                null,
              photographer_studio:
                updated.photographer_studio ?? prev.photographer_studio ?? null,
            }
          : null,
      );
      setSaveDetailSuccess(true);
    } catch {
      setEditDetailError("Error de conexión");
    } finally {
      setSavingDetail(false);
    }
  };

  const hasRescheduleInfoBlock =
    (reservation?.reschedule_history?.length ?? 0) > 0 ||
    ((reservation?.reschedule_count ?? 0) > 0 &&
      (reservation?.reschedule_history?.length ?? 0) === 0);

  const showAdminActionButtons =
    isAdmin && reservation?.status === "confirmed";

  const adminFlowsIntoActionButtons =
    showAdminActionButtons &&
    showAdminInternalBlock &&
    !hasRescheduleInfoBlock;

  /** Evita hueco + doble borde entre bloque admin y la primera sección siguiente. */
  const fullBleedSectionClass = (firstAfterAdmin: boolean) =>
    firstAfterAdmin && showAdminInternalBlock
      ? "pt-4 -mx-6 sm:-mx-8 -mt-6"
      : "pt-4 border-t border-zinc-200 -mx-6 sm:-mx-8";

  // Determinar si el texto debe ser rojo (menos de 5 días hábiles)
  const isPastDeadline = businessDays !== null && businessDays < 5;
  const totalDiscounts = calculateTotalDiscounts();
  const hasDiscounts = totalDiscounts > 0;
  const isPaidAdditional = (h: {
    additional_payment_amount?: number | null;
    additional_payment_method?: string | null;
  }) =>
    (h.additional_payment_amount ?? 0) > 0 &&
    isPaidAdditionalPaymentMethod(h.additional_payment_method);
  const rescheduleHistoryWithPayment = (
    reservation?.reschedule_history ?? []
  ).filter((h) => isPaidAdditional(h));
  const reservationPaidAdditional = isPaidAdditional({
    additional_payment_amount: reservation?.additional_payment_amount,
    additional_payment_method: reservation?.additional_payment_method,
  });
  const hasPaidAdditionalPayment =
    reservationPaidAdditional || rescheduleHistoryWithPayment.length > 0;
  const showPriceBreakdown = hasDiscounts || hasPaidAdditionalPayment;
  const originalPriceForBreakdown = getPriceBeforePaidAdditionals(
    reservation?.price,
    reservation?.reschedule_history ?? [],
    {
      additional_payment_amount: reservation?.additional_payment_amount ?? null,
      additional_payment_method: reservation?.additional_payment_method ?? null,
    },
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

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="space-y-6 p-6 sm:p-8">
          {/* Estado de la reserva e ID */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
            <div>
              <p className="text-sm text-zinc-600 mb-1">Estado</p>
              <span
                className={`inline-block px-3 py-1.5 text-sm font-medium rounded-full ${getReservationStatusColor(
                  reservation.status,
                  {
                    rescheduleCount: reservation.reschedule_count,
                    sessionDate: reservation.date,
                  },
                )}`}
              >
                {getReservationStatusLabel(reservation.status, {
                  rescheduleCount: reservation.reschedule_count,
                  sessionDate: reservation.date,
                })}
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
              <ReservationSpaceUsage
                startTime={reservation.start_time}
                calendarDate={reservation.date}
                variant="detail"
              />
            </div>

            {!isAdmin && reservation.photographer_studio ? (
              <div>
                <p className="text-sm text-zinc-600 mb-1">Fotógrafo / estudio</p>
                <p className="text-lg font-medium text-[#103948] whitespace-pre-line">
                  {reservation.photographer_studio}
                </p>
              </div>
            ) : null}

            {/* Datos de contacto: editable solo para admin en citas de Alberto */}
            {isAdmin && (
              <div className="pt-4 border-t border-zinc-200 space-y-3">
                {(reservation.source === "google_import" || reservation.source === "admin") &&
                reservation.import_type === "manual_available" ? (
                  <>
                    <p className="text-sm text-zinc-600">Espacio reservado para Alvero (bloqueo de horario, sin cliente).</p>
                    {reservation.created_by && (
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">Creada por</p>
                        <p className="text-lg font-medium text-[#103948]">
                          {reservation.created_by.name?.trim() || reservation.created_by.email}
                        </p>
                      </div>
                    )}
                  </>
                ) : (reservation.source === "google_import" || reservation.source === "admin") &&
                reservation.import_type === "manual_client" ? (
                  <>
                    <ReservationContactFields
                      reservation={reservation}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      editable={canEditContact}
                      orderLabel={contactOrderLabel}
                    />
                    {canEditContact && (
                      <p className="text-xs text-zinc-500">
                        Puedes corregir nombre, email o teléfono si hubo un error al capturar la cita.
                      </p>
                    )}
                    <div>
                      <label
                        htmlFor="admin-photographer-studio-import"
                        className="text-sm text-zinc-600 mb-1 block"
                      >
                        Fotógrafo / estudio
                      </label>
                      <input
                        id="admin-photographer-studio-import"
                        type="text"
                        maxLength={500}
                        value={editForm.photographer_studio}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            photographer_studio: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                        placeholder="Ej. Estudio Luz o nombre del fotógrafo"
                      />
                    </div>
                    <AdminInternalNotesField
                      id="edit-notes-alvero"
                      value={editForm.import_notes}
                      onChange={(import_notes) =>
                        setEditForm((f) => ({ ...f, import_notes }))
                      }
                      label="Notas internas"
                      rows={4}
                      labelClassName="text-sm text-zinc-600 mb-1 block"
                      inputClassName={defaultDetailInputClass}
                      showAdminOnlyHint
                    />
                    {editDetailError && (
                      <p className="text-sm text-red-600">{editDetailError}</p>
                    )}
                    {saveDetailSuccess && (
                      <p className="text-sm text-green-600 font-medium">Detalles guardados correctamente.</p>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void patchReservationDetails(alveroDetailPatch)
                      }
                      disabled={savingDetail || !canSaveAlveroDetail}
                      className="rounded bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0f2d38] disabled:opacity-50"
                    >
                      {savingDetail
                        ? "Guardando…"
                        : canEditContact
                          ? "Guardar datos y notas"
                          : "Guardar notas"}
                    </button>
                  </>
                ) : (
                  <>
                    <ReservationContactFields
                      reservation={reservation}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      editable={canEditContact}
                      orderLabel={contactOrderLabel}
                    />
                    {reservation.source === "web" && (
                      <p className="text-xs text-zinc-500">
                        Los datos personales de reservas hechas en la página web no se pueden editar.
                      </p>
                    )}
                    {canEditContact && (
                      <p className="text-xs text-zinc-500">
                        Puedes corregir los datos del cliente si hubo un error al registrar la cita manual.
                      </p>
                    )}
                    {showAdminNotesEditor && (
                      <AdminInternalNotesField
                        id="edit-notes-chuy"
                        value={editForm.import_notes}
                        onChange={(import_notes) =>
                          setEditForm((f) => ({ ...f, import_notes }))
                        }
                        label="Notas internas"
                        rows={4}
                        labelClassName="text-sm text-zinc-600 mb-1 block"
                        inputClassName={defaultDetailInputClass}
                        showAdminOnlyHint
                      />
                    )}
                    {(canEditContact || showAdminNotesEditor) && (
                      <>
                        {editDetailError && (
                          <p className="text-sm text-red-600">{editDetailError}</p>
                        )}
                        {saveDetailSuccess && (
                          <p className="text-sm text-green-600 font-medium">
                            {canEditContact && showAdminNotesEditor
                              ? "Datos y notas guardados correctamente."
                              : showAdminNotesEditor
                                ? "Notas guardadas correctamente."
                                : "Datos guardados correctamente."}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void patchReservationDetails(chuyDetailPatch)
                          }
                          disabled={savingDetail || !canSaveChuyDetail}
                          className="rounded bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0f2d38] disabled:opacity-50"
                        >
                          {savingDetail
                            ? "Guardando…"
                            : canEditContact && showAdminNotesEditor
                              ? "Guardar datos y notas"
                              : showAdminNotesEditor
                                ? "Guardar notas"
                                : "Guardar datos del cliente"}
                        </button>
                      </>
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
                <ReservationDetailLastEdited reservation={reservation} />
              </div>
            )}
          </div>

          {/* Desglose de precios (descuentos y/o pago adicional por reagendamiento) */}
          {showPriceBreakdown && (
            <div className="border-t border-zinc-200 pt-4">
              <h3 className="text-lg font-semibold text-[#103948] mb-4">
                {PRICE_BREAKDOWN_SECTION_TITLE}
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
                          label={PRICE_BREAKDOWN_MONEDAS_LABEL}
                          amount={pointsDiscount}
                        />
                      );
                    })()}

                    {isValidDiscount(reservation.credits_used) && (
                      <DiscountRow
                        label={PRICE_BREAKDOWN_CREDITOS_LABEL}
                        amount={reservation.credits_used!}
                      />
                    )}
                  </>
                )}

                {!hasDiscounts && hasPaidAdditionalPayment && (
                  <div className="flex justify-between text-zinc-700">
                    <span>Precio de la reserva:</span>
                    <span>
                      ${formatCurrency(originalPriceForBreakdown)}
                    </span>
                  </div>
                )}

                {hasPaidAdditionalPayment &&
                  rescheduleHistoryWithPayment.map((h, idx) => (
                    <RescheduleAdditionalRow
                      key={idx}
                      label={`Pago adicional por reagendamiento${
                        rescheduleHistoryWithPayment.length > 1
                          ? ` (${idx + 1})`
                          : ""
                      }`}
                      amount={h.additional_payment_amount ?? 0}
                    />
                  ))}

                <div className="pt-5 border-t border-zinc-200 flex justify-between font-semibold text-lg">
                  <span>Total pagado:</span>
                  <span className="text-[#103948]">
                    ${formatCurrency(reservation.price)}
                  </span>
                </div>
                {reservation.payment_id && (
                  <div className="mt-2 flex justify-between gap-3 text-sm">
                    <span className="text-zinc-500">ID de pago:</span>
                    <span className="max-w-[58%] shrink-0 break-all text-right font-mono text-zinc-500">
                      {reservation.payment_id}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Precio sin descuentos ni pago adicional */}
          {!showPriceBreakdown && (
            <div className="border-t border-zinc-200 pt-5">
              <div className="flex justify-between font-semibold text-lg">
                <span>Precio total:</span>
                <span className="text-[#103948]">
                  ${formatCurrency(reservation.price)}
                </span>
              </div>
              {reservation.payment_id && (
                <div className="mt-2 flex justify-between gap-3 text-sm">
                  <span className="text-zinc-500">ID de pago:</span>
                  <span className="max-w-[58%] shrink-0 break-all text-right font-mono text-zinc-500">
                    {reservation.payment_id}
                  </span>
                </div>
              )}
            </div>
          )}

          {showAdminInternalBlock && (
            <div className="-mx-6 sm:-mx-8">
              <AdminReservationInternalInfo
                reservation={reservation}
                isSuperAdmin={isSuperAdmin}
                editForm={editForm}
                setEditForm={setEditForm}
                savingDetail={savingDetail}
                setSavingDetail={setSavingDetail}
                editDetailError={editDetailError}
                setEditDetailError={setEditDetailError}
                setReservation={setReservation}
                validatingPayment={validatingPayment}
                setValidatingPayment={setValidatingPayment}
                showPhotographerEditor={showAdminPhotographerEditor}
              />
            </div>
          )}

          {/* Un bloque completo por cada reagendamiento */}
          {(reservation.reschedule_history?.length ?? 0) > 0 &&
            (reservation.reschedule_history ?? []).map((h, idx) => (
              <div
                key={idx}
                className={fullBleedSectionClass(idx === 0)}
              >
                <div className="bg-orange-50 rounded-lg p-4 mx-6 sm:mx-8">
                  <h3 className="text-lg font-semibold text-orange-900 mb-3">
                    {RESCHEDULE_INFO_SECTION_TITLE}
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
                        {formatTimeRange(
                          h.previous_start_time,
                          undefined,
                          h.previous_date
                        )}
                      </p>
                    </div>
                    {(reservation.reschedule_history?.length ?? 0) > 1 && (
                      <div>
                        <p className="text-orange-700 font-medium mb-1">
                          Nueva fecha y horario:
                        </p>
                        <p className="text-orange-900">
                          {formatDisplayDate(h.new_date)} -{" "}
                          {formatTimeRange(
                            h.new_start_time,
                            undefined,
                            h.new_date
                          )}
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
                        {h.additional_payment_method && (
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
                        {!shouldShowRescheduleActor(
                          h.rescheduled_by,
                          reservation.user_id,
                          reservation.email,
                        ) &&
                          reservation.additional_payment_id &&
                          idx === (reservation.reschedule_history ?? []).length - 1 && (
                            <p className="text-orange-900 font-mono text-xs mt-1">
                              ID de pago: {reservation.additional_payment_id}
                            </p>
                          )}
                      </div>
                    )}
                    <p className="text-orange-900 font-semibold pt-1">
                      {formatRescheduleAttribution(
                        h.rescheduled_at,
                        h.rescheduled_by,
                        reservation.user_id,
                        reservation.email,
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}

          {/* Fallback: sin historial (reservas reagendadas antes de migración 15) */}
          {(reservation.reschedule_count ?? 0) > 0 &&
            (reservation.reschedule_history?.length ?? 0) === 0 && (
              <div className={fullBleedSectionClass(true)}>
                <div className="bg-orange-50 rounded-lg p-4 mx-6 sm:mx-8">
                  <h3 className="text-lg font-semibold text-orange-900 mb-3">
                    {RESCHEDULE_INFO_SECTION_TITLE}
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
                            {formatTimeRange(
                              reservation.original_start_time,
                              undefined,
                              reservation.original_date ?? undefined
                            )}
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
            <div className={fullBleedSectionClass(!hasRescheduleInfoBlock)}>
              <CancelledReservationDetails
                className="mx-6 sm:mx-8"
                cancelledAt={reservation.cancelled_at}
                refundAmount={reservation.refund_amount}
                refundId={reservation.refund_id}
                refundStatus={reservation.refund_status}
                cancelledBy={reservation.cancelled_by}
                reservationUserId={reservation.user_id}
                reservationEmail={reservation.email}
                adminSection={
                  isAdmin &&
                  (reservation.refund_status === "failed" ||
                    reservation.refund_status === "pending") ? (
                    <div className="space-y-2">
                      <p className="text-red-800">
                        <span className="font-medium text-red-900">
                          Acción de administrador:
                        </span>{" "}
                        {reservation.refund_status === "failed"
                          ? "reabre los intentos de reembolso a Conekta y los procesa inmediatamente. Útil tras corregir credenciales, fondos o el cargo en el dashboard de Conekta."
                          : "fuerza el procesamiento ahora del reembolso pendiente, sin esperar al siguiente intento programado. Útil cuando la fila quedó esperando un backoff y quieres feedback inmediato."}
                      </p>
                      <button
                        type="button"
                        onClick={handleRetryRefund}
                        disabled={retryingRefund}
                        className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0d2d38] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {retryingRefund
                          ? "Procesando…"
                          : reservation.refund_status === "failed"
                            ? "Reintentar reembolso"
                            : "Procesar reembolso ahora"}
                      </button>
                      {retryRefundMessage && (
                        <p className="text-red-800">{retryRefundMessage}</p>
                      )}
                      {retryRefundError && (
                        <p className="font-medium text-red-900">
                          {retryRefundError}
                        </p>
                      )}
                    </div>
                  ) : undefined
                }
              />
            </div>
          )}

          {/* Botones de acción */}
          {reservation.status === "confirmed" && (
            <div
              className={
                adminFlowsIntoActionButtons
                  ? "space-y-4 -mt-6 pt-5"
                  : "space-y-4 border-t border-zinc-200 pt-6"
              }
            >
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
                  <p className="mt-2 text-xs leading-snug text-zinc-600">
                    Como administrador puedes reagendar en cualquier momento y sin
                    límite de intentos. Si la nueva fecha tiene mayor costo, se
                    asignará como pago pendiente.
                  </p>
                ) : hasReachedRescheduleLimit ? (
                  <p className="mt-2 text-xs leading-snug text-zinc-600">
                    Ya has utilizado tu único intento de reagendamiento permitido
                    para esta reserva.
                  </p>
                ) : null}
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
                  <p className="mt-2 text-xs leading-snug text-zinc-600">
                    Como administrador puedes cancelar en cualquier momento.
                  </p>
                ) : null}
              </div>
              {!isAdmin && reservation.source !== "google_import" && (
                <p className="text-xs leading-snug text-zinc-600">
                  {hasReachedRescheduleLimit
                    ? "La cancelación solo está disponible con al menos 5 días hábiles de anticipación."
                    : "Reagendar y cancelar requieren al menos 5 días hábiles de anticipación."}
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
          )}

          </div>

          {reservation.status === "confirmed" &&
            reservation.user_id &&
            adminMeResolved && (
              <TransferMonedasPanel
                reservationId={reservation.id}
                adminReadOnly={isAdmin}
                variant="embedded"
              />
            )}

          {/* Pie: volver */}
          <div className="border-t border-zinc-200 px-6 pt-4 pb-5 sm:px-8 sm:pb-6">
            <Link
              href={isAdmin ? "/admin/reservaciones" : "/account"}
              className="block w-full rounded-lg border border-zinc-300 bg-white py-3 px-4 text-center font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
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
                const { totalConektaPaid, refundAmount } =
                  getCancellationRefundPreview({
                    payment_method: reservation.payment_method ?? null,
                    payment_id: reservation.payment_id ?? null,
                    price: reservation.price ?? 0,
                    additional_payment_id:
                      reservation.additional_payment_id ?? null,
                    additional_payment_amount:
                      reservation.additional_payment_amount ?? null,
                    additional_payment_method:
                      reservation.additional_payment_method ?? null,
                    reschedule_history: reservation.reschedule_history ?? [],
                  });

                return (
                  <div className="mb-4 p-4 bg-zinc-50 rounded-lg">
                    {totalConektaPaid > 0 ? (
                      <>
                        <p className="text-sm text-zinc-600 mb-2">
                          <strong>Reembolso:</strong> {REFUND_CANCEL_MODAL_POLICY}
                        </p>
                        <p className="text-lg font-semibold text-[#103948]">
                          Monto a reembolsar: $
                          {formatCurrency(refundAmount)} MXN
                        </p>
                        <p className="text-xs text-zinc-500 mt-2">
                          {REFUND_CANCEL_MODAL_TIMEFRAME_NOTE}
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
          durationMinutes={durationMinutesBetween(
            reservation.start_time,
            reservation.end_time,
          )}
          isRescheduling={rescheduling}
          externalError={rescheduleError}
        />
      )}
    </div>
  );
}
