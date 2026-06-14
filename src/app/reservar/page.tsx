"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Calendar from "react-calendar";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { getAvailableSlots, getMonthAvailability } from "@/utils/availability";
import {
  applyLastMinuteDiscount,
  calculatePrice,
  getDayOverride,
  getDayType,
  isLastMinuteEligible,
  LAST_MINUTE_DISCOUNT_PERCENT,
} from "@/utils/pricing";
import { getMonterreyToday } from "@/utils/business-days";
import { formatTimeRange, formatCurrency } from "@/utils/formatters";
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
  const today = getMonterreyToday();
  const checkDate = normalizeDate(date);
  return checkDate >= today;
};

function BookingSpinner({ label }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3"
    >
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent"
        aria-hidden
      />
      {label ? (
        <p className="text-sm text-zinc-500 sm:text-base">{label}</p>
      ) : null}
    </div>
  );
}

export default function ReservarPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [displayPrice, setDisplayPrice] = useState<number | null>(null);
  const [lastMinuteApplied, setLastMinuteApplied] = useState(false);
  const [isPromotionalPrice, setIsPromotionalPrice] = useState(false);
  const [isHolidayOverride, setIsHolidayOverride] = useState(false);
  const [standardPrice, setStandardPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [monthLoading, setMonthLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [monthAvailability, setMonthAvailability] = useState<
    Map<string, number>
  >(new Map());
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const monthRequestIdRef = useRef(0);
  const monthFetchTargetRef = useRef<Date | null>(null);

  // Obtener slots disponibles cuando se selecciona una fecha
  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([]);
      setBasePrice(null);
      setDisplayPrice(null);
      setLastMinuteApplied(false);
      setIsPromotionalPrice(false);
      setIsHolidayOverride(false);
      setStandardPrice(null);
      return;
    }

    let cancelled = false;

    const fetchAvailability = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        const [slots, override] = await Promise.all([
          getAvailableSlots(supabase, selectedDate),
          getDayOverride(supabase, selectedDate),
        ]);

        if (cancelled) return;

        const holidayOverride = override?.isHoliday ?? false;
        const calculatedBase = calculatePrice(
          selectedDate,
          override?.customPrice ?? null,
          holidayOverride
        );
        const tariffPrice = calculatePrice(
          selectedDate,
          null,
          holidayOverride
        );
        const promotional =
          override?.customPrice != null && calculatedBase < tariffPrice;
        const lastMinute = applyLastMinuteDiscount(
          selectedDate,
          calculatedBase
        );

        setAvailableSlots(slots);
        setBasePrice(calculatedBase);
        setDisplayPrice(lastMinute.price);
        setLastMinuteApplied(lastMinute.applied);
        setIsPromotionalPrice(promotional);
        setIsHolidayOverride(holidayOverride);
        setStandardPrice(tariffPrice);
      } catch (err) {
        if (cancelled) return;
        setError("Error al cargar disponibilidad");
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAvailability();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const getSlotsForDay = useCallback(
    (date: Date): string[] =>
      date.getDay() === 0 ? SUNDAY_SLOTS : WEEKDAY_SLOTS,
    []
  );

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
    const normalizedMonthDate = startOfMonth(monthDate);

    if (
      monthFetchTargetRef.current &&
      isSameMonth(monthFetchTargetRef.current, normalizedMonthDate)
    ) {
      return;
    }

    monthFetchTargetRef.current = normalizedMonthDate;
    const requestId = ++monthRequestIdRef.current;
    setMonthLoading(true);

    try {
      const supabase = createClient();
      const availability = await getMonthAvailability(
        supabase,
        normalizedMonthDate,
        endOfMonth(monthDate),
      );
      if (requestId !== monthRequestIdRef.current) return;
      setMonthAvailability(availability);
      setCurrentMonth(normalizedMonthDate);
    } catch (err) {
      console.error("Error loading month availability:", err);
      if (requestId !== monthRequestIdRef.current) return;
      setMonthAvailability(new Map());
      setCurrentMonth(normalizedMonthDate);
    } finally {
      if (requestId === monthRequestIdRef.current) {
        monthFetchTargetRef.current = null;
        setMonthLoading(false);
      }
    }
  }, []);

  const handleMonthChange = useCallback(
    (activeStartDate: Date) => {
      // Verificar si el mes ya está cargado usando currentMonth
      // No usar monthAvailability.size porque meses sin disponibilidad retornan Map vacío
      if (currentMonth && isSameMonth(currentMonth, activeStartDate)) {
        return;
      }
      loadMonthAvailability(activeStartDate);
    },
    [currentMonth, loadMonthAvailability]
  );

  const handleDateChange = useCallback(
    (value: unknown) => {
      if (value instanceof Date) {
        // Normalizar ambas fechas para comparar solo año, mes y día
        const normalizedNewDate = normalizeDate(value);
        const normalizedCurrentDate = selectedDate
          ? normalizeDate(selectedDate)
          : null;

        // Si es la misma fecha, no hacer nada (evitar recarga innecesaria)
        if (
          normalizedCurrentDate &&
          normalizedCurrentDate.getTime() === normalizedNewDate.getTime()
        ) {
          return;
        }

        setLoading(true);
        setAvailableSlots([]);
        setBasePrice(null);
        setDisplayPrice(null);
        setLastMinuteApplied(false);
        setIsPromotionalPrice(false);
        setIsHolidayOverride(false);
        setStandardPrice(null);
        setSelectedTime(null);
        setSelectedDate(value);
      }
    },
    [selectedDate]
  );

  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time);
  }, []);

  // Manejar continuar al formulario
  const handleContinue = useCallback(() => {
    if (!selectedDate || !selectedTime || basePrice == null || displayPrice == null)
      return;

    const dateString = format(selectedDate, "yyyy-MM-dd");
    // Precio base: el formulario aplica último minuto con isLastMinute: true
    sessionStorage.setItem(
      "reservationData",
      JSON.stringify({ date: dateString, time: selectedTime, price: basePrice })
    );
    router.push(`/reservar/formulario?date=${dateString}&time=${selectedTime}`);
  }, [selectedDate, selectedTime, basePrice, displayPrice, router]);

  // Usar fecha de Monterrey para minDate y maxDate
  // Se recalculan en cada render para asegurar fecha actual
  // Esto previene que minDate quede desactualizado si el componente permanece montado pasada la medianoche
  const minDate = getMonterreyToday();

  const maxDate = addMonths(getMonterreyToday(), 6);
  maxDate.setHours(23, 59, 59, 999);

  // Función para deshabilitar fechas pasadas, cerradas, sin disponibilidad o más de 6 meses
  const tileDisabled = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return false;

      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyToday();
      const future = isFutureDate(date);

      // Verificar si el mes está cargado antes de deshabilitar por 0 slots
      const isMonthLoaded = isMonthLoadedForDate(date);
      const slots = monthAvailability.get(dateString);

      // Si el mes no está cargado y es futuro, deshabilitar (mientras carga)
      if (!isMonthLoaded && future && checkDate <= maxDate) {
        return true;
      }

      // Si el mes está cargado pero slots es undefined o 0, deshabilitar
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

  const getTileAvailability = useCallback(
    (date: Date) => {
      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyToday();
      const future = isFutureDate(date);
      const isToday = checkDate.getTime() === today.getTime();
      const isClosed = closedDates.has(dateString);
      const slots = monthAvailability.get(dateString);
      const isMonthLoaded = isMonthLoadedForDate(date);
      const availableSlots = slots ?? 0;

      return {
        dateString,
        checkDate,
        today,
        future,
        isToday,
        isClosed,
        isMonthLoaded,
        availableSlots,
      };
    },
    [closedDates, monthAvailability, isMonthLoadedForDate]
  );

  // Función para aplicar clases CSS según disponibilidad (heatmap) + promo último minuto
  const tileClassName = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return "";

      const {
        checkDate,
        today,
        future,
        isToday,
        isClosed,
        isMonthLoaded,
        availableSlots,
      } = getTileAvailability(date);

      if (!isMonthLoaded && future) return "";

      if (isToday && availableSlots === 0) {
        return "";
      }

      const classes: string[] = [];

      if (
        (isClosed || availableSlots === 0) &&
        future &&
        checkDate <= maxDate &&
        !isToday
      ) {
        classes.push("heatmap-closed-or-unavailable");
      } else if (availableSlots > 0) {
        const maxSlots = date.getDay() === 0 ? 7 : 11;
        const percentage = (availableSlots / maxSlots) * 100;

        if (percentage >= 80) classes.push("heatmap-high");
        else if (percentage >= 50) classes.push("heatmap-medium");
        else if (percentage >= 25) classes.push("heatmap-low");
        else if (percentage > 0) classes.push("heatmap-minimal");
      }

      if (availableSlots > 0 && isLastMinuteEligible(date)) {
        classes.push("last-minute-promo");
      }

      return classes.join(" ");
    },
    [getTileAvailability, maxDate]
  );

  const tileContent = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return null;

      const { future, isMonthLoaded, availableSlots } = getTileAvailability(date);
      if (!isMonthLoaded && future) return null;
      if (availableSlots <= 0 || !isLastMinuteEligible(date)) return null;

      return (
        <span className="last-minute-promo-badge">
          -{LAST_MINUTE_DISCOUNT_PERCENT}%
        </span>
      );
    },
    [getTileAvailability]
  );

  const formatLongDate = useCallback(
    (_locale: string | undefined, date: Date) => {
      const label = format(date, "EEEE, d 'de' MMMM 'de' yyyy", {
        locale: es,
      });
      const { isMonthLoaded, availableSlots } = getTileAvailability(date);
      if (
        isMonthLoaded &&
        availableSlots > 0 &&
        isLastMinuteEligible(date)
      ) {
        return `${label}. ${LAST_MINUTE_DISCOUNT_PERCENT}% de descuento último minuto`;
      }
      return label;
    },
    [getTileAvailability]
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
      const today = getMonterreyToday();
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
  }, [mounted, loadMonthAvailability]);

  const isHolidayTariff = useMemo(() => {
    if (!selectedDate) return false;
    return isHolidayOverride || getDayType(selectedDate) === "holiday";
  }, [selectedDate, isHolidayOverride]);

  const getTariffContext = useCallback(
    (date: Date | null): string | null => {
      if (!date) return null;
      if (isPromotionalPrice) return "precio promocional";
      if (isHolidayOverride || getDayType(date) === "holiday") {
        return "tarifa festiva";
      }
      if (getDayType(date) === "sunday") return "tarifa de domingo";
      return null;
    },
    [isPromotionalPrice, isHolidayOverride]
  );

  const priceContextLabel = useMemo(() => {
    if (lastMinuteApplied) return "Descuento último minuto";
    if (isPromotionalPrice) return "Precio promocional";
    if (!selectedDate) return "Precio regular";
    if (isHolidayTariff) return "Tarifa festiva";
    if (getDayType(selectedDate) === "sunday") return "Tarifa de domingo";
    return "Precio regular";
  }, [
    lastMinuteApplied,
    isPromotionalPrice,
    selectedDate,
    isHolidayTariff,
  ]);

  const strikethroughPrice = useMemo(() => {
    if (lastMinuteApplied && basePrice != null) return basePrice;
    if (isPromotionalPrice && standardPrice != null) return standardPrice;
    return null;
  }, [lastMinuteApplied, isPromotionalPrice, basePrice, standardPrice]);

  const priceContextSubline = useMemo(() => {
    if (!lastMinuteApplied || basePrice == null || displayPrice == null) {
      return null;
    }
    const savings = formatCurrency(basePrice - displayPrice);
    const tariff = getTariffContext(selectedDate);
    return tariff
      ? `Sobre ${tariff} · ahorras $${savings} MXN`
      : `Ahorras $${savings} MXN`;
  }, [
    lastMinuteApplied,
    basePrice,
    displayPrice,
    getTariffContext,
    selectedDate,
  ]);

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
            <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-6 h-fit">
              <h2 className="mb-3 text-lg font-semibold text-zinc-900 sm:mb-4 sm:text-2xl">
                Selecciona una Fecha
              </h2>
              {mounted ? (
                <div className="relative">
                  {monthLoading ? (
                    <div
                      className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/75"
                      aria-busy="true"
                      aria-live="polite"
                    >
                      <BookingSpinner label="Cargando calendario..." />
                    </div>
                  ) : null}
                  <div className={monthLoading ? "pointer-events-none" : undefined}>
                  <Calendar
                    onChange={handleDateChange}
                    value={selectedDate}
                    locale="es"
                    minDate={minDate}
                    maxDate={maxDate}
                    tileDisabled={tileDisabled}
                    tileClassName={tileClassName}
                    tileContent={tileContent}
                    formatLongDate={formatLongDate}
                    onActiveStartDateChange={({ activeStartDate }) => {
                      if (activeStartDate) {
                        handleMonthChange(activeStartDate);
                      }
                    }}
                    className="w-full rounded-lg border-0"
                    showNeighboringMonth={false}
                  />
                  {/* Leyenda — desktop: disponibilidad + promo en fila aparte */}
                  <div className="mt-4 hidden border-t border-zinc-200 pt-4 lg:block">
                    <div className="grid grid-cols-5 gap-x-3 gap-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 shrink-0 rounded border border-zinc-300"
                          style={{ backgroundColor: "rgba(22, 163, 74, 0.38)" }}
                        />
                        <span className="text-xs text-zinc-600">Alta</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 shrink-0 rounded border border-zinc-300"
                          style={{
                            backgroundColor: "rgba(132, 204, 22, 0.45)",
                          }}
                        />
                        <span className="text-xs text-zinc-600">Moderada</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 shrink-0 rounded border border-zinc-300"
                          style={{ backgroundColor: "rgba(234, 179, 8, 0.35)" }}
                        />
                        <span className="text-xs text-zinc-600">Poca</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 shrink-0 rounded border border-zinc-300"
                          style={{
                            backgroundColor: "rgba(249, 115, 22, 0.35)",
                          }}
                        />
                        <span className="text-xs text-zinc-600">Muy poca</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 shrink-0 rounded border"
                          style={{
                            backgroundColor: "#fef2f2",
                            borderColor: "#ef4444",
                          }}
                        />
                        <span className="text-xs text-zinc-600">
                          Sin disponibilidad
                        </span>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              ) : (
                <div
                  className="flex h-[250px] items-center justify-center sm:h-[300px]"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <BookingSpinner label="Cargando calendario..." />
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
                <div
                  className="flex h-full min-h-[200px] items-center justify-center"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <BookingSpinner label="Cargando disponibilidad..." />
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
                  <div className="mb-3 sm:mb-4">
                    <p className="text-xs capitalize text-zinc-700 sm:text-sm">
                      {format(selectedDate, "EEEE, d 'de' MMMM", {
                        locale: es,
                      })}
                    </p>
                  </div>

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
                                ? "border-[#103948] bg-[#103948] text-white"
                                : "border-zinc-300 bg-white text-zinc-900 hover:border-[#103948] hover:bg-zinc-50"
                            }`}
                          >
                            {formatTimeRange(
                              time,
                              undefined,
                              format(selectedDate, "yyyy-MM-dd")
                            )}
                          </button>
                        );
                      })}
                  </div>

                  {/* Precio */}
                  {displayPrice != null && basePrice != null && (
                    <div
                      className={`mb-4 rounded-lg border bg-zinc-50 p-3 sm:mb-6 sm:p-4 ${
                        lastMinuteApplied
                          ? "border-zinc-200 border-l-4 border-l-amber-400"
                          : "border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-800 sm:text-base">
                            {priceContextLabel}
                          </p>
                          {priceContextSubline ? (
                            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
                              {priceContextSubline}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          {strikethroughPrice != null ? (
                            <p className="text-sm text-zinc-400 line-through">
                              ${formatCurrency(strikethroughPrice)}
                            </p>
                          ) : null}
                          <p className="text-xl font-bold tabular-nums text-zinc-900 sm:text-2xl">
                            ${formatCurrency(displayPrice)}
                            <span className="ml-1 text-sm font-normal text-zinc-500">
                              MXN
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Botón Continuar */}
                  <button
                    onClick={handleContinue}
                    disabled={!selectedTime || displayPrice == null}
                    className="w-full rounded-lg bg-[#103948] px-4 py-3 text-base font-semibold text-white transition-all hover:bg-[#0d2d38] disabled:cursor-not-allowed disabled:bg-zinc-400 sm:px-6 sm:py-4 sm:text-lg"
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
