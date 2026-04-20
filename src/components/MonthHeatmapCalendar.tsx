"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Calendar from "react-calendar";
import {
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/client";
import { getMonthAvailability } from "@/utils/availability";
import "react-calendar/dist/Calendar.css";

const normalizeDate = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const getMonterreyDate = (): Date => {
  const now = new Date();
  return normalizeDate(toZonedTime(now, "America/Monterrey"));
};

const isFutureDate = (date: Date): boolean => {
  const today = getMonterreyDate();
  return normalizeDate(date) >= today;
};

export interface MonthHeatmapCalendarProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  /** Set de fechas (yyyy-MM-dd) cerradas via availability.is_closed */
  closedDates?: Set<string>;
  /** Set de fechas (yyyy-MM-dd) con overrides activos: muestra badge */
  customizedDates?: Set<string>;
  /** Modo cliente: deshabilita pasadas, cerradas y sin slots. Modo admin: permite click en todas dentro de [minDate, maxDate]. */
  mode?: "client" | "admin";
  /** Sobrescribe minDate (default = hoy en Monterrey) */
  minDate?: Date;
  /** Sobrescribe maxDate (default = +6 meses) */
  maxDate?: Date;
  /** Notifica cambios de mes (después de cargar la disponibilidad) */
  onMonthChange?: (monthStart: Date) => void;
  /** Refresh token: cuando cambia, re-fetch del mes actual */
  refreshKey?: number;
  className?: string;
  /** Tiles más compactos (aspect-ratio menor, padding/font reducidos). Default true en admin. */
  compact?: boolean;
}

/**
 * Calendario mensual con heatmap de disponibilidad de slots,
 * basado en `react-calendar` y los estilos `heatmap-*` de globals.css.
 *
 * En modo admin permite seleccionar cualquier día dentro del rango (incluso
 * cerrados o sin slots) para abrir el panel de configuración. En modo cliente
 * conserva el comportamiento de la pantalla pública (deshabilita lo no reservable).
 */
export default function MonthHeatmapCalendar({
  selectedDate,
  onSelectDate,
  closedDates,
  customizedDates,
  mode = "client",
  minDate,
  maxDate,
  onMonthChange,
  refreshKey,
  className,
  compact,
}: MonthHeatmapCalendarProps) {
  const isCompact = compact ?? mode === "admin";
  const [mounted, setMounted] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState<Map<string, number>>(
    new Map()
  );
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const loadingMonthRef = useRef<Date | null>(null);

  const effectiveMinDate = useMemo(
    () => minDate ?? getMonterreyDate(),
    [minDate]
  );
  const effectiveMaxDate = useMemo(() => {
    const base = maxDate ?? addMonths(getMonterreyDate(), 6);
    const d = new Date(base);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [maxDate]);

  const loadMonth = useCallback(
    async (monthDate: Date) => {
      const normalized = startOfMonth(monthDate);
      loadingMonthRef.current = normalized;
      try {
        const supabase = createClient();
        const availability = await getMonthAvailability(
          supabase,
          normalized,
          endOfMonth(monthDate)
        );
        if (
          loadingMonthRef.current &&
          isSameMonth(loadingMonthRef.current, normalized)
        ) {
          setAvailabilityMap(availability);
          setCurrentMonth(normalized);
          onMonthChange?.(normalized);
        }
      } catch (err) {
        console.error("Error loading month availability:", err);
        if (
          loadingMonthRef.current &&
          isSameMonth(loadingMonthRef.current, normalized)
        ) {
          setAvailabilityMap(new Map());
          setCurrentMonth(normalized);
          onMonthChange?.(normalized);
        }
      } finally {
        if (
          loadingMonthRef.current &&
          isSameMonth(loadingMonthRef.current, normalized)
        ) {
          loadingMonthRef.current = null;
        }
      }
    },
    [onMonthChange]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadMonth(getMonterreyDate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Re-fetch cuando cambia refreshKey (después de guardar overrides)
  useEffect(() => {
    if (!mounted || refreshKey === undefined) return;
    const target = currentMonth ?? getMonterreyDate();
    loadMonth(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const isMonthLoadedForDate = useCallback(
    (date: Date): boolean => {
      if (!currentMonth) return false;
      return isSameMonth(currentMonth, startOfMonth(date));
    },
    [currentMonth]
  );

  const tileDisabled = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return false;
      const checkDate = normalizeDate(date);
      if (checkDate < normalizeDate(effectiveMinDate)) {
        return true;
      }
      if (checkDate > effectiveMaxDate) return true;

      if (mode === "admin") {
        // En admin, todo lo que esté dentro del rango es clickeable (incluso cerrados/sin slots)
        return false;
      }

      // mode === "client": misma lógica que /reservar
      const dateString = format(date, "yyyy-MM-dd");
      const future = isFutureDate(date);
      const isMonthLoaded = isMonthLoadedForDate(date);
      const slots = availabilityMap.get(dateString);
      if (!isMonthLoaded && future && checkDate <= effectiveMaxDate) {
        return true;
      }
      const hasNoSlots = isMonthLoaded && (slots === undefined || slots === 0);
      return (closedDates?.has(dateString) ?? false) || (hasNoSlots && future);
    },
    [
      mode,
      availabilityMap,
      closedDates,
      isMonthLoadedForDate,
      effectiveMinDate,
      effectiveMaxDate,
    ]
  );

  const tileClassName = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return "";
      const dateString = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyDate();
      const future = isFutureDate(date);
      const isToday = checkDate.getTime() === today.getTime();
      const isClosed = closedDates?.has(dateString) ?? false;
      const slots = availabilityMap.get(dateString);
      const hasOverride = customizedDates?.has(dateString) ?? false;

      const isMonthLoaded = isMonthLoadedForDate(date);
      if (!isMonthLoaded && future) {
        return hasOverride ? "has-override" : "";
      }

      const availableSlots = slots ?? 0;
      const classes: string[] = [];
      if (hasOverride) classes.push("has-override");

      if (isToday && availableSlots === 0 && !isClosed) {
        return classes.join(" ");
      }

      if (
        (isClosed || availableSlots === 0) &&
        future &&
        checkDate <= effectiveMaxDate &&
        !isToday
      ) {
        classes.push("heatmap-closed-or-unavailable");
        return classes.join(" ");
      }

      if (availableSlots > 0) {
        const maxSlots = date.getDay() === 0 ? 7 : 11;
        const percentage = (availableSlots / maxSlots) * 100;
        if (percentage >= 80) classes.push("heatmap-high");
        else if (percentage >= 50) classes.push("heatmap-medium");
        else if (percentage >= 25) classes.push("heatmap-low");
        else if (percentage > 0) classes.push("heatmap-minimal");
      }

      return classes.join(" ");
    },
    [
      closedDates,
      customizedDates,
      availabilityMap,
      isMonthLoadedForDate,
      effectiveMaxDate,
    ]
  );

  const handleChange = useCallback(
    (value: unknown) => {
      if (value instanceof Date) onSelectDate(value);
    },
    [onSelectDate]
  );

  if (!mounted) {
    return (
      <div className={`h-[420px] w-full animate-pulse rounded-lg bg-zinc-100 ${className ?? ""}`} />
    );
  }

  return (
    <Calendar
      onChange={handleChange}
      value={selectedDate}
      locale="es"
      minDate={effectiveMinDate}
      maxDate={effectiveMaxDate}
      tileDisabled={tileDisabled}
      tileClassName={tileClassName}
      onActiveStartDateChange={({ activeStartDate }) => {
        if (activeStartDate) {
          if (currentMonth && isSameMonth(currentMonth, activeStartDate)) return;
          loadMonth(activeStartDate);
        }
      }}
      showNeighboringMonth={false}
      className={`w-full rounded-lg border-0 ${isCompact ? "is-compact" : ""} ${className ?? ""}`}
    />
  );
}
