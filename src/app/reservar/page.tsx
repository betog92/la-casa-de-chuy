"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Calendar from "react-calendar";
import {
  format,
  addMonths,
  addHours,
  startOfMonth,
  endOfMonth,
  isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { getAvailableSlots, getMonthAvailability } from "@/utils/availability";
import { calculatePriceWithCustom, getDayType } from "@/utils/pricing";
import type { TimeSlot } from "@/utils/availability";
import "react-calendar/dist/Calendar.css";

// Horarios disponibles según día de la semana
// Cada slot es de 45 minutos consecutivos
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

// Helper functions (fuera del componente para mejor performance)
const normalizeDate = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const isFutureDate = (date: Date): boolean => {
  const today = normalizeDate(new Date());
  const checkDate = normalizeDate(date);
  return checkDate >= today;
};

export default function ReservarPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [monthAvailability, setMonthAvailability] = useState<
    Map<string, number>
  >(new Map());
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [loadingMonthAvailability, setLoadingMonthAvailability] =
    useState(false);
  const loadingMonthRef = useRef<Date | null>(null);

  // Obtener slots disponibles cuando se selecciona una fecha
  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([]);
      setPrice(null);
      return;
    }

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        // Obtener slots disponibles
        const slots = await getAvailableSlots(supabase, selectedDate);
        setAvailableSlots(slots);

        // Calcular precio
        const calculatedPrice = await calculatePriceWithCustom(
          supabase,
          selectedDate
        );
        setPrice(calculatedPrice);
      } catch (err) {
        setError("Error al cargar disponibilidad");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailability();
  }, [selectedDate]);

  const getSlotsForDay = useCallback(
    (date: Date): string[] =>
      date.getDay() === 0 ? SUNDAY_SLOTS : WEEKDAY_SLOTS,
    []
  );

  // Función para formatear el rango de hora en formato 12 horas - MEMOIZADA
  // NOTA: Aunque los slots técnicos en la BD son de 45 minutos, mostramos 1 hora al usuario
  // porque la sesión real de fotografía es de 1 hora completa.
  // Los 45 minutos del slot permiten tiempo de limpieza/preparación entre sesiones.
  const formatTimeRange = useCallback((startTime: string): string => {
    // Parsear la hora de inicio (formato "HH:mm")
    const [hours, minutes] = startTime.split(":").map(Number);

    // Crear una fecha base para hacer cálculos
    const baseDate = new Date();
    baseDate.setHours(hours, minutes, 0, 0);

    // Sumar 1 hora (sesión real de fotografía)
    const endDate = addHours(baseDate, 1);

    // Formatear ambas horas en formato 12 horas con su período AM/PM respectivo
    // Esto corrige el caso donde el rango cruza el mediodía (ej: 11:00 AM → 12:00 PM)
    const startFormatted = format(baseDate, "h:mm a").toLowerCase();
    const endFormatted = format(endDate, "h:mm a").toLowerCase();

    return `${startFormatted} - ${endFormatted}`;
  }, []);

  // Memoizar la disponibilidad de todos los horarios para evitar cálculos repetidos
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
  }, [availableSlots, selectedDate, getSlotsForDay]);

  const isTimeAvailable = useCallback(
    (time: string): boolean => timeAvailabilityMap.get(time) ?? false,
    [timeAvailabilityMap]
  );

  // Helper para verificar si el mes de una fecha está cargado
  const isMonthLoadedForDate = useCallback(
    (date: Date): boolean => {
      if (!currentMonth) return false;
      return isSameMonth(currentMonth, startOfMonth(date));
    },
    [currentMonth]
  );

  const loadMonthAvailability = useCallback(async (monthDate: Date) => {
    // Marcar que estamos cargando este mes específico
    loadingMonthRef.current = monthDate;
    setLoadingMonthAvailability(true);
    try {
      const supabase = createClient();
      const availability = await getMonthAvailability(
        supabase,
        startOfMonth(monthDate),
        endOfMonth(monthDate)
      );
      // Solo actualizar si todavía estamos cargando el mismo mes (evita race conditions)
      if (loadingMonthRef.current === monthDate) {
        setMonthAvailability(availability);
        setCurrentMonth(monthDate);
      }
    } catch (err) {
      console.error("Error loading month availability:", err);
      // Solo actualizar si todavía estamos cargando el mismo mes
      if (loadingMonthRef.current === monthDate) {
        setMonthAvailability(new Map());
      }
    } finally {
      // Solo limpiar loading si todavía estamos cargando el mismo mes
      if (loadingMonthRef.current === monthDate) {
        setLoadingMonthAvailability(false);
        loadingMonthRef.current = null;
      }
    }
  }, []);

  const handleMonthChange = useCallback(
    (activeStartDate: Date) => {
      if (
        currentMonth &&
        isSameMonth(currentMonth, activeStartDate) &&
        monthAvailability.size > 0
      ) {
        return;
      }
      loadMonthAvailability(activeStartDate);
    },
    [currentMonth, monthAvailability, loadMonthAvailability]
  );

  const handleDateChange = useCallback((value: unknown) => {
    if (value instanceof Date) {
      setLoading(true);
      setAvailableSlots([]);
      setPrice(null);
      setSelectedTime(null);
      setSelectedDate(value);
    }
  }, []);

  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time);
  }, []);

  // Manejar continuar al formulario
  const handleContinue = useCallback(() => {
    if (!selectedDate || !selectedTime || !price) return;

    const dateString = format(selectedDate, "yyyy-MM-dd");
    sessionStorage.setItem(
      "reservationData",
      JSON.stringify({ date: dateString, time: selectedTime, price })
    );
    router.push(`/reservar/formulario?date=${dateString}&time=${selectedTime}`);
  }, [selectedDate, selectedTime, price, router]);

  const minDate = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => {
    const date = addMonths(new Date(), 6);
    date.setHours(23, 59, 59, 999);
    return date;
  }, []);

  // Función para deshabilitar fechas pasadas, cerradas, sin disponibilidad o más de 6 meses
  const tileDisabled = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return false;

      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = normalizeDate(new Date());
      const future = isFutureDate(date);

      // Verificar si el mes está cargado antes de deshabilitar por 0 slots
      const isMonthLoaded = isMonthLoadedForDate(date);
      const slots = monthAvailability.get(dateString);

      // Si el mes no está cargado y es futuro, no deshabilitar por slots (evita deshabilitar prematuramente)
      const hasNoSlots = isMonthLoaded && (slots === undefined || slots === 0);

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
      if (view !== "month" || loadingMonthAvailability) return "";

      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const future = isFutureDate(date);
      const isClosed = closedDates.has(dateString);
      const slots = monthAvailability.get(dateString);

      // Verificar si el mes de esta fecha está cargado
      const isMonthLoaded = isMonthLoadedForDate(date);

      // Si el mes no está cargado, no aplicar estilos (evita flash rojo inicial)
      if (!isMonthLoaded && future) return "";

      // Si el mes está cargado pero slots es undefined, significa que tiene 0 slots
      // (la función SQL solo retorna días con slots > 0)
      const availableSlots = slots ?? 0;

      // Días cerrados o sin disponibilidad futuros → rojo
      if (
        (isClosed || availableSlots === 0) &&
        future &&
        checkDate <= maxDate
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
    [
      closedDates,
      monthAvailability,
      loadingMonthAvailability,
      maxDate,
      isMonthLoadedForDate,
    ]
  );

  // Inicialización del componente
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cargar datos iniciales al montar
  useEffect(() => {
    if (!mounted) return;

    const initialize = async () => {
      const supabase = createClient();
      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(today.getMonth() + 3);

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
      loadMonthAvailability(new Date());
    };

    initialize();
  }, [mounted, loadMonthAvailability]);

  const getDayTypeLabel = useCallback((date: Date | null): string => {
    if (!date) return "";
    const dayType = getDayType(date);
    const labels: Record<string, string> = {
      holiday: "Día Festivo",
      weekend: "Fin de Semana",
    };
    return labels[dayType] || "Día Normal";
  }, []);

  return (
    <div className="min-h-screen min-w-[390px] bg-gradient-to-b from-zinc-50 to-white py-6 sm:py-12">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="mx-auto">
          {/* Header */}
          <div className="mb-6 text-center sm:mb-8">
            <h1 className="mb-2 text-3xl font-bold text-zinc-900 sm:mb-4 sm:text-4xl">
              Reserva tu Sesión
            </h1>
            <p className="text-base text-zinc-600 sm:text-lg">
              Selecciona la fecha y hora que prefieras
            </p>
          </div>

          <div className="grid gap-4 sm:gap-8 lg:grid-cols-[1.3fr_1fr] xl:grid-cols-[1.7fr_1fr] 2xl:grid-cols-[2fr_1fr]">
            <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-6 max-h-[870px]">
              <h2 className="mb-3 text-lg font-semibold text-zinc-900 sm:mb-4 sm:text-2xl">
                Selecciona una Fecha
              </h2>
              {mounted ? (
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
                  className="w-full h-full rounded-lg border-0"
                  showNeighboringMonth={false}
                />
              ) : (
                <div className="flex h-[250px] items-center justify-center sm:h-[300px]">
                  <p className="text-sm text-zinc-500 sm:text-base">
                    Cargando calendario...
                  </p>
                </div>
              )}
            </div>

            {/* Horarios y Precio */}
            <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-6">
              {!selectedDate ? (
                <div className="flex h-full items-center justify-center text-center">
                  <p className="text-zinc-500">
                    Selecciona una fecha en el calendario
                  </p>
                </div>
              ) : loading ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-zinc-500">Cargando disponibilidad...</p>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-red-600">{error}</p>
                </div>
              ) : (
                <>
                  <h2 className="mb-3 text-lg font-semibold text-zinc-900 sm:mb-4 sm:text-2xl">
                    Horarios Disponibles
                  </h2>
                  <p className="mb-3 text-xs text-zinc-600 sm:mb-4 sm:text-sm">
                    {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
                  </p>

                  {/* Lista de horarios */}
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-2 sm:mb-6 sm:gap-3">
                    {getSlotsForDay(selectedDate)
                      .filter((time) => isTimeAvailable(time))
                      .map((time) => {
                        const isSelected = selectedTime === time;

                        return (
                          <button
                            key={time}
                            onClick={() => handleTimeSelect(time)}
                            className={`rounded-lg border-2 px-3 py-2 text-center text-sm font-semibold transition-all whitespace-nowrap sm:px-4 sm:py-3 sm:text-base ${
                              isSelected
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-900 hover:bg-zinc-50"
                            }`}
                          >
                            {formatTimeRange(time)}
                          </button>
                        );
                      })}
                  </div>

                  {/* Precio */}
                  {price && (
                    <div className="mb-4 rounded-lg bg-zinc-50 p-3 sm:mb-6 sm:p-4">
                      <div className="mb-2 flex flex-col gap-1 lg:flex-row lg:justify-between lg:items-center">
                        <span className="text-sm text-zinc-600 sm:text-base">
                          {getDayTypeLabel(selectedDate)}
                        </span>
                        <span className="text-xl font-bold text-zinc-900 sm:text-2xl">
                          ${price.toLocaleString("es-MX")} MXN
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Botón Continuar */}
                  <button
                    onClick={handleContinue}
                    disabled={!selectedTime || !price}
                    className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 sm:px-6 sm:py-4 sm:text-lg"
                  >
                    Continuar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
