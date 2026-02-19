"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Calendar from "react-calendar";
import {
  format,
  addMonths,
  startOfDay,
  startOfMonth,
  endOfMonth,
  isSameMonth,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { getAvailableSlots, getMonthAvailability } from "@/utils/availability";
import { formatTimeRange } from "@/utils/formatters";
import type { TimeSlot } from "@/utils/availability";
import "react-calendar/dist/Calendar.css";

export interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: string, startTime: string) => void;
  currentDate: string;
  currentStartTime?: string;
  isRescheduling?: boolean;
  externalError?: string | null;
  /** Paso admin: aviso de pago pendiente y confirmar */
  adminPaymentStep?: { date: string; startTime: string; additionalAmount: number } | null;
  onConfirmAdminPayment?: () => void;
}

// Horarios disponibles según día de la semana
const WEEKDAY_SLOTS = [
  "11:00",
  "11:45",
  "12:30",
  "13:15",
  "14:00",
  "14:45",
  "15:30",
  "16:15",
  "17:00",
  "17:45",
  "18:30",
];

const SUNDAY_SLOTS = [
  "11:00",
  "11:45",
  "12:30",
  "13:15",
  "14:00",
  "14:45",
  "15:30",
];

// Helper functions
const normalizeDate = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const getMonterreyDate = (): Date => {
  const now = new Date();
  const monterreyTime = toZonedTime(now, "America/Monterrey");
  return normalizeDate(monterreyTime);
};

const getSlotsForDay = (date: Date): string[] =>
  date.getDay() === 0 ? SUNDAY_SLOTS : WEEKDAY_SLOTS;

export default function RescheduleModal({
  isOpen,
  onClose,
  onConfirm,
  currentDate,
  currentStartTime,
  isRescheduling = false,
  externalError = null,
  adminPaymentStep = null,
  onConfirmAdminPayment,
}: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [monthAvailability, setMonthAvailability] = useState<
    Map<string, number>
  >(new Map());
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const loadingMonthRef = useRef<Date | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Helper para verificar si el mes está cargado
  const isMonthLoadedForDate = useCallback(
    (date: Date): boolean => {
      if (!currentMonth) return false;
      return isSameMonth(currentMonth, startOfMonth(date));
    },
    [currentMonth]
  );

  // Cargar disponibilidad del mes
  const loadMonthAvailability = useCallback(async (monthDate: Date) => {
    const normalizedMonthDate = startOfMonth(monthDate);
    loadingMonthRef.current = normalizedMonthDate;
    try {
      const supabase = createClient();
      const availability = await getMonthAvailability(
        supabase,
        normalizedMonthDate,
        endOfMonth(monthDate)
      );
      if (
        loadingMonthRef.current &&
        isSameMonth(loadingMonthRef.current, normalizedMonthDate)
      ) {
        setMonthAvailability(availability);
        setCurrentMonth(normalizedMonthDate);
      }
    } catch (err) {
      console.error("Error loading month availability:", err);
      if (
        loadingMonthRef.current &&
        isSameMonth(loadingMonthRef.current, normalizedMonthDate)
      ) {
        setMonthAvailability(new Map());
        setCurrentMonth(normalizedMonthDate);
      }
    } finally {
      if (
        loadingMonthRef.current &&
        isSameMonth(loadingMonthRef.current, normalizedMonthDate)
      ) {
        loadingMonthRef.current = null;
      }
    }
  }, []);

  // Manejar cambio de mes en el calendario
  const handleMonthChange = useCallback(
    (activeStartDate: Date) => {
      if (currentMonth && isSameMonth(currentMonth, activeStartDate)) {
        return;
      }
      loadMonthAvailability(activeStartDate);
    },
    [currentMonth, loadMonthAvailability]
  );

  // Resetear estado cuando el modal se abre
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(null);
      setSelectedTime(null);
      setAvailableSlots([]);
      setError(null);
      setConfirmed(false);

      // Cargar datos iniciales del heatmap
      const initialize = async () => {
        const supabase = createClient();
        const today = getMonterreyDate();
        const threeMonthsLater = addMonths(today, 3);

        // Cargar fechas cerradas
        try {
          const { data } = await supabase
            .from("availability")
            .select("date")
            .eq("is_closed", true)
            .gte("date", format(today, "yyyy-MM-dd"))
            .lte("date", format(threeMonthsLater, "yyyy-MM-dd"));

          if (data) {
            setClosedDates(new Set(data.map((item) => item.date)));
          }
        } catch (err) {
          console.error("Error loading closed dates:", err);
        }

        // Cargar disponibilidad del mes actual
        loadMonthAvailability(today);
      };

      initialize();
    }
  }, [isOpen, loadMonthAvailability]);

  // Obtener slots disponibles cuando se selecciona una fecha
  useEffect(() => {
    if (!selectedDate || !isOpen) {
      setAvailableSlots([]);
      return;
    }

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const slots = await getAvailableSlots(supabase, selectedDate);
        setAvailableSlots(slots);
      } catch (err) {
        setError("Error al cargar disponibilidad");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, isOpen]);

  // Memoizar la disponibilidad de todos los horarios
  const timeAvailabilityMap = useMemo(() => {
    if (!selectedDate || availableSlots.length === 0) {
      return new Map<string, boolean>();
    }

    const availableTimes = new Set(
      availableSlots.map((slot) => slot.start_time.substring(0, 5))
    );

    return new Map(
      getSlotsForDay(selectedDate).map((time) => [
        time,
        availableTimes.has(time),
      ])
    );
  }, [availableSlots, selectedDate]);

  const isTimeAvailable = useCallback(
    (time: string): boolean => {
      const isAvailable = timeAvailabilityMap.get(time) ?? false;

      // Si no está disponible según la API, retornar false
      if (!isAvailable) return false;

      // Si la fecha seleccionada es la misma que la fecha actual de la reserva
      // y el horario es el mismo que el horario actual de la reserva, deshabilitarlo
      if (selectedDate && currentStartTime) {
        const selectedDateString = format(selectedDate, "yyyy-MM-dd");
        if (selectedDateString === currentDate) {
          // Normalizar formato de tiempo (puede venir como "HH:MM:SS" o "HH:MM")
          const currentTimeNormalized = currentStartTime.substring(0, 5); // "HH:MM"
          const timeNormalized = time.substring(0, 5); // "HH:MM"

          // Si es el mismo horario, no está disponible
          if (timeNormalized === currentTimeNormalized) {
            return false;
          }
        }
      }

      return isAvailable;
    },
    [timeAvailabilityMap, selectedDate, currentDate, currentStartTime]
  );

  const handleDateChange = useCallback(
    (value: unknown) => {
      if (value instanceof Date) {
        const normalizedNewDate = normalizeDate(value);
        const normalizedCurrentDate = selectedDate
          ? normalizeDate(selectedDate)
          : null;

        if (
          normalizedCurrentDate &&
          normalizedCurrentDate.getTime() === normalizedNewDate.getTime()
        ) {
          return;
        }

        setSelectedTime(null);
        setSelectedDate(value);
      }
    },
    [selectedDate]
  );

  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedDate || !selectedTime || !confirmed) return;

    const dateString = format(selectedDate, "yyyy-MM-dd");
    // El error externo se limpiará desde el parent cuando se llame a onConfirm
    onConfirm(dateString, selectedTime);
  }, [selectedDate, selectedTime, confirmed, onConfirm]);

  const handleClose = useCallback(() => {
    setSelectedDate(null);
    setSelectedTime(null);
    setAvailableSlots([]);
    setError(null);
    onClose();
  }, [onClose]);

  // Calcular fechas límite (esto debe estar antes del early return)
  const minDate = getMonterreyDate();
  const maxDate = addMonths(getMonterreyDate(), 6);
  maxDate.setHours(23, 59, 59, 999);

  // Función para deshabilitar fechas (debe estar antes del early return)
  const tileDisabled = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return false;
      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyDate();
      const future = checkDate >= today;

      // Verificar si el mes está cargado antes de deshabilitar por 0 slots
      const isMonthLoaded = isMonthLoadedForDate(date);
      const slots = monthAvailability.get(dateString);

      // Si el mes no está cargado y es futuro, deshabilitar (mientras carga)
      if (!isMonthLoaded && future && checkDate <= maxDate) {
        return true;
      }

      // Si el mes está cargado pero slots es undefined o 0, deshabilitar
      const hasNoSlots = isMonthLoaded && (slots === undefined || slots === 0);

      // Ya no deshabilitamos toda la fecha de la reserva
      // Solo se deshabilitará el horario específico en isTimeAvailable

      return (
        checkDate < today ||
        checkDate > maxDate ||
        closedDates.has(dateString) ||
        (hasNoSlots && future)
      );
    },
    [maxDate, closedDates, monthAvailability, isMonthLoadedForDate]
  );

  // Función para aplicar clases CSS según disponibilidad (heatmap)
  const tileClassName = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return "";

      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyDate();
      const future = checkDate >= today;
      const isToday = checkDate.getTime() === today.getTime();
      const isClosed = closedDates.has(dateString);
      const slots = monthAvailability.get(dateString);

      // Verificar si el mes de esta fecha está cargado
      const isMonthLoaded = isMonthLoadedForDate(date);

      // Si el mes no está cargado, no aplicar estilos (evita flash rojo inicial)
      if (!isMonthLoaded && future) return "";

      // Si el mes está cargado pero slots es undefined, significa que tiene 0 slots
      const availableSlots = slots ?? 0;

      // Si es el día actual y no tiene slots, no aplicar estilo rojo (ya está deshabilitado)
      if (isToday && availableSlots === 0) {
        return "";
      }

      // Días cerrados o sin disponibilidad futuros → rojo
      if (
        (isClosed || availableSlots === 0) &&
        future &&
        checkDate <= maxDate &&
        !isToday
      ) {
        return "heatmap-closed-or-unavailable";
      }

      // Calcular heatmap según porcentaje de disponibilidad
      if (availableSlots > 0) {
        const maxSlots = date.getDay() === 0 ? 7 : 11;
        const percentage = (availableSlots / maxSlots) * 100;

        if (percentage >= 80) return "heatmap-high";
        if (percentage >= 50) return "heatmap-medium";
        if (percentage >= 20) return "heatmap-low";
        if (percentage > 0) return "heatmap-minimal";
      }

      return "";
    },
    [closedDates, monthAvailability, maxDate, isMonthLoadedForDate]
  );

  // Early return debe estar DESPUÉS de todos los hooks
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-[#103948]">
              Reagendar Reserva
            </h2>
            <button
              onClick={handleClose}
              className="text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
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

          {adminPaymentStep ? (
            <div className="space-y-4">
              <p className="text-zinc-700">
                Esta acción requiere{" "}
                <span className="font-semibold text-[#103948]">
                  ${adminPaymentStep.additionalAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>{" "}
                adicionales. Se asignará como pago pendiente. ¿Estás seguro?
              </p>
              {externalError && (
                <p className="text-sm text-red-600">{externalError}</p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isRescheduling}
                  onClick={() => onConfirmAdminPayment?.()}
                  className="rounded-lg border-2 border-[#103948] bg-[#103948] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0d2d38] disabled:opacity-50"
                >
                  {isRescheduling ? "Confirmando..." : "Sí, asignar como pendiente"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Calendario */}
            <div>
              <h3 className="text-lg font-semibold text-[#103948] mb-4">
                Selecciona una Fecha
              </h3>
              <Calendar
                onChange={handleDateChange}
                value={selectedDate}
                locale="es"
                minDate={minDate}
                maxDate={maxDate}
                tileDisabled={tileDisabled}
                tileClassName={tileClassName}
                onActiveStartDateChange={({ activeStartDate }) => {
                  if (activeStartDate) {
                    handleMonthChange(activeStartDate);
                  }
                }}
                className="w-full rounded-lg border-0"
                showNeighboringMonth={false}
              />
            </div>

            {/* Horarios */}
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold text-[#103948] mb-4">
                Selecciona un Horario
              </h3>
              {!selectedDate ? (
                <div className="flex items-center justify-center text-center border border-zinc-200 rounded-lg p-8 min-h-[300px]">
                  <p className="text-zinc-500">
                    Selecciona una fecha en el calendario
                  </p>
                </div>
              ) : loading ? (
                <div className="flex h-full items-center justify-center border border-zinc-200 rounded-lg p-8">
                  <p className="text-zinc-500">Cargando disponibilidad...</p>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center border border-zinc-200 rounded-lg p-8">
                  <p className="text-red-600">{error}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-600 mb-4">
                    {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
                  </p>

                  <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                    {getSlotsForDay(selectedDate)
                      .filter((time) => isTimeAvailable(time))
                      .map((time) => {
                        const isSelected = selectedTime === time;

                        return (
                          <button
                            key={time}
                            onClick={() => handleTimeSelect(time)}
                            disabled={isRescheduling}
                            className={`rounded-lg border-2 px-4 py-3 text-center text-sm font-semibold transition-all ${
                              isSelected
                                ? "border-[#103948] bg-[#103948] text-white"
                                : "border-zinc-300 bg-white text-zinc-900 hover:border-[#103948] hover:bg-zinc-50"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {formatTimeRange(time)}
                          </button>
                        );
                      })}

                    {getSlotsForDay(selectedDate).filter((time) =>
                      isTimeAvailable(time)
                    ).length === 0 && (
                      <div className="text-center py-8 text-zinc-500">
                        <p>No hay horarios disponibles para esta fecha</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mostrar error externo si existe */}
          {externalError && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-red-700">{externalError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="mt-6 space-y-4">
            {/* Checkbox de confirmación */}
            <div className="flex items-start gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
              <input
                type="checkbox"
                id="confirm-reschedule"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={isRescheduling}
                className="mt-0.5 h-4 w-4 text-[#103948] border-zinc-300 rounded focus:ring-[#103948] focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label
                htmlFor="confirm-reschedule"
                className={`text-sm text-zinc-700 cursor-pointer ${
                  isRescheduling ? "opacity-50" : ""
                }`}
              >
                <strong>
                  Entiendo que solo tengo una oportunidad de reagendar.
                </strong>{" "}
                Al confirmar, no podré volver a reagendar esta reserva.
              </label>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleClose}
                disabled={isRescheduling}
                className="px-6 py-2 rounded-lg border border-zinc-300 bg-white font-medium text-zinc-700 transition-colors hover:bg-zinc-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={
                  !selectedDate || !selectedTime || !confirmed || isRescheduling
                }
                className="px-6 py-2 rounded-lg bg-[#103948] font-medium text-white transition-colors hover:bg-[#0d2d38] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {isRescheduling ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Reagendando...</span>
                  </>
                ) : (
                  "Confirmar Reagendamiento"
                )}
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
