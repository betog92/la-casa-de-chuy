"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  addMonths,
  endOfMonth,
  format,
  isBefore,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import MonthHeatmapCalendar from "@/components/MonthHeatmapCalendar";
import DayAvailabilityPanel, {
  type DayDetail,
} from "@/components/admin/DayAvailabilityPanel";

const getMonterreyToday = (): Date => {
  const now = new Date();
  const z = toZonedTime(now, "America/Monterrey");
  z.setHours(0, 0, 0, 0);
  return z;
};

interface OverrideRow {
  date: string;
  is_closed: boolean;
  is_holiday: boolean;
  custom_price: number | null;
}

export default function AdminDisponibilidadPage() {
  const today = useMemo(() => getMonterreyToday(), []);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeMonth, setActiveMonth] = useState<Date>(startOfMonth(today));
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedDateString = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : null;

  const closedDates = useMemo(
    () => new Set(overrides.filter((o) => o.is_closed).map((o) => o.date)),
    [overrides]
  );
  const customizedDates = useMemo(
    () =>
      new Set(
        overrides
          .filter(
            (o) =>
              o.is_closed || o.is_holiday || o.custom_price != null
          )
          .map((o) => o.date)
      ),
    [overrides]
  );

  const monthSummary = useMemo(() => {
    const monthStr = format(activeMonth, "yyyy-MM");
    const inMonth = overrides.filter((o) => o.date.startsWith(monthStr));
    return {
      total: inMonth.length,
      closed: inMonth.filter((o) => o.is_closed).length,
      holidays: inMonth.filter((o) => o.is_holiday).length,
      customPriced: inMonth.filter((o) => o.custom_price != null).length,
    };
  }, [overrides, activeMonth]);

  // Refs para descartar respuestas obsoletas si el usuario cambia rápido
  // de mes o de día seleccionado.
  const overridesReqRef = useRef(0);
  const dayReqRef = useRef<{ id: number; date: string }>({ id: 0, date: "" });

  const loadOverrides = useCallback(async (monthStart: Date) => {
    const from = format(startOfMonth(monthStart), "yyyy-MM-dd");
    const to = format(endOfMonth(monthStart), "yyyy-MM-dd");
    const reqId = ++overridesReqRef.current;
    try {
      const res = await axios.get(
        `/api/admin/availability?dateFrom=${from}&dateTo=${to}`
      );
      if (reqId !== overridesReqRef.current) return;
      if (res.data?.success) {
        setOverrides(res.data.availability ?? []);
        setOverridesError(null);
      } else {
        setOverridesError(
          res.data?.error || "No se pudo cargar la configuración del mes"
        );
      }
    } catch (err) {
      if (reqId !== overridesReqRef.current) return;
      console.error("Error loading overrides:", err);
      setOverridesError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) ||
              "No se pudo cargar la configuración del mes"
          : "No se pudo cargar la configuración del mes"
      );
    }
  }, []);

  const loadDay = useCallback(async (dateString: string) => {
    const reqId = ++dayReqRef.current.id;
    dayReqRef.current.date = dateString;
    setLoadingDay(true);
    setDayError(null);
    try {
      const res = await axios.get(
        `/api/admin/availability/day?date=${encodeURIComponent(dateString)}`
      );
      if (
        reqId !== dayReqRef.current.id ||
        dateString !== dayReqRef.current.date
      ) {
        return;
      }
      if (!res.data?.success) {
        setDayError(res.data?.error || "Error al cargar el día");
        setDayDetail(null);
        return;
      }
      setDayDetail({
        date: res.data.date,
        availability: res.data.availability ?? null,
        slots: res.data.slots ?? [],
      });
    } catch (err) {
      if (
        reqId !== dayReqRef.current.id ||
        dateString !== dayReqRef.current.date
      ) {
        return;
      }
      setDayError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error al cargar el día"
          : "Error al cargar el día"
      );
      setDayDetail(null);
    } finally {
      if (
        reqId === dayReqRef.current.id &&
        dateString === dayReqRef.current.date
      ) {
        setLoadingDay(false);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedDateString) {
      loadDay(selectedDateString);
    }
  }, [selectedDateString, loadDay, refreshKey]);

  useEffect(() => {
    loadOverrides(activeMonth);
  }, [activeMonth, refreshKey, loadOverrides]);

  const handleMonthChange = useCallback((monthStart: Date) => {
    setActiveMonth((prev) => (isSameMonth(prev, monthStart) ? prev : monthStart));
  }, []);

  const isPastSelected = selectedDate
    ? isBefore(
        new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate()
        ),
        today
      )
    : false;

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const maxDate = useMemo(() => addMonths(today, 6), [today]);

  return (
    <div className="container mx-auto space-y-6">
      <div className="space-y-4">
        <div>
          <h1
            className="text-3xl font-bold text-[#103948]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Disponibilidad
          </h1>
          <p className="mt-1 text-zinc-600">
            Configura días cerrados, festivos, precios y horarios
            deshabilitados. Selecciona una fecha en el calendario para ver y
            editar su configuración.
          </p>
        </div>

        {/* Tira de stats del mes activo */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Configurados"
            value={monthSummary.total}
            tooltip="Días del mes con alguna configuración manual: cerrados, festivos o con precio personalizado."
          />
          <Stat
            label="Cerrados"
            value={monthSummary.closed}
            tooltip="Días marcados como cerrados (no aceptan reservas nuevas)."
          />
          <Stat
            label="Festivos"
            value={monthSummary.holidays}
            tooltip="Días marcados como festivos por el admin (aplican tarifa de festivo)."
          />
          <Stat
            label="Precio custom"
            value={monthSummary.customPriced}
            tooltip="Días con un precio personalizado guardado (anula la tarifa automática)."
          />
        </div>

        {overridesError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{overridesError}</span>
            <button
              type="button"
              onClick={() => loadOverrides(activeMonth)}
              className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.3fr_1fr] xl:grid-cols-[1.7fr_1fr] 2xl:grid-cols-[2fr_1fr]">
        {/* Calendario */}
        <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-5 h-fit">
          <MonthHeatmapCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            closedDates={closedDates}
            customizedDates={customizedDates}
            mode="admin"
            minDate={today}
            maxDate={maxDate}
            onMonthChange={handleMonthChange}
            refreshKey={refreshKey}
            compact={false}
          />

          {/* Leyenda */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-zinc-200 pt-3 text-xs text-zinc-600 sm:grid-cols-4">
            <LegendChip
              color="rgba(22, 163, 74, 0.38)"
              label="Alta disponibilidad"
            />
            <LegendChip
              color="rgba(234, 179, 8, 0.35)"
              label="Poca disponibilidad"
            />
            <LegendChip color="#fef2f2" label="Cerrado / sin slots" />
            <div className="flex items-center gap-2">
              <span className="relative inline-block h-3 w-3 rounded border border-zinc-300">
                <span className="absolute -right-0.5 -top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-white" />
              </span>
              Configuración manual
            </div>
          </div>
        </div>

        {/* Panel del día */}
        <div className="space-y-3">
          {dayError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {dayError}
            </div>
          )}
          {selectedDateString ? (
            <DayAvailabilityPanel
              date={selectedDateString}
              detail={dayDetail}
              loading={loadingDay}
              onChanged={triggerRefresh}
              isPast={isPastSelected}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              Selecciona una fecha en el calendario para verla y editarla.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number;
  tooltip?: string;
}) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5"
      title={tooltip}
    >
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-[#103948]">{value}</p>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded border border-zinc-300"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}
