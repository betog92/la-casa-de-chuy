"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import type { NavigateAction } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfDay,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import axios from "axios";
import "react-big-calendar/lib/css/react-big-calendar.css";

const getMonterreyDate = (): Date => {
  const now = new Date();
  const monterreyTime = toZonedTime(now, "America/Monterrey");
  return startOfDay(monterreyTime);
};

const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

/** Formato 12 horas para vistas Semana y Día (hh:mm AM/PM) */
const formats = {
  timeGutterFormat: "h:mm a",
  agendaTimeFormat: "h:mm a",
  agendaTimeRangeFormat: (
    { start, end }: { start: Date; end: Date },
    _culture?: string,
    local?: { format: (d: Date, f: string, c?: string) => string }
  ) => (local ? `${local.format(start, "h:mm a")} – ${local.format(end, "h:mm a")}` : ""),
  eventTimeRangeFormat: (
    { start, end }: { start: Date; end: Date },
    _culture?: string,
    local?: { format: (d: Date, f: string, c?: string) => string }
  ) => (local ? `${local.format(start, "h:mm a")} – ${local.format(end, "h:mm a")}` : ""),
};

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource?: { reservationId: number };
}

export default function AdminCalendarioPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [date, setDate] = useState(() => getMonterreyDate());
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => {
    const now = getMonterreyDate();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  });

  const fetchIdRef = useRef(0);

  const fetchEvents = useCallback(async (start: Date, end: Date, signal?: AbortSignal) => {
    const thisFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError("");
    try {
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");
      const res = await axios.get(
        `/api/admin/calendar-events?start=${startStr}&end=${endStr}`,
        { signal }
      );
      if (res.data.success) {
        const evts = (res.data.events ?? []).map((e: {
          id: number;
          title: string;
          start: string;
          end: string;
          resource?: { reservationId: number };
        }) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
          resource: e.resource ?? { reservationId: e.id },
        }));
        setEvents(evts);
      } else {
        setError(res.data.error || "Error al cargar eventos");
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.code === "ERR_CANCELED") return;
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || err.message || "Error al cargar"
          : "Error al cargar calendario"
      );
    } finally {
      if (thisFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEvents(range.start, range.end, ctrl.signal);
    return () => ctrl.abort();
  }, [range.start, range.end, fetchEvents]);

  const handleRangeChange = useCallback(
    (newRange: { start: Date; end: Date } | Date[]) => {
      if (Array.isArray(newRange) && newRange.length > 0) {
        const start = newRange[0] as Date;
        const end = (newRange[newRange.length - 1] as Date) ?? start;
        setRange({ start, end });
      } else if (newRange && !Array.isArray(newRange)) {
        setRange(newRange as { start: Date; end: Date });
      }
    },
    []
  );

  const handleViewChange = useCallback(
    (newView: "month" | "week" | "day" | "work_week" | "agenda") => {
      if (newView === "month" || newView === "week" || newView === "day") {
        setView(newView);
      }
    },
    []
  );

  // Límite de 6 meses hacia el futuro (como en el calendario de reservas)
  const maxDate = useMemo(() => addMonths(getMonterreyDate(), 6), []);

  const handleNavigate = useCallback(
    (newDate: Date) => {
      const newStart = startOfMonth(newDate);
      const maxStart = startOfMonth(maxDate);
      const clamped = newStart > maxStart ? maxDate : newDate;
      setDate(clamped);
    },
    [maxDate]
  );

  const isNextDisabled = useMemo(() => {
    const currentStart = startOfMonth(date);
    const maxStart = startOfMonth(maxDate);
    return currentStart >= maxStart;
  }, [date, maxDate]);

  const CustomToolbar = useCallback(
    (props: {
      date: Date;
      view: string;
      views: unknown;
      label: string;
      onNavigate: (action: NavigateAction, date?: Date) => void;
      onView: (view: string) => void;
      localizer: { messages: Record<string, string> };
    }) => {
      const { onNavigate, localizer, label, view, views } = props;
      const msgs = localizer.messages;
      const viewNames = Array.isArray(views)
        ? views
        : typeof views === "object" && views
          ? Object.keys(views as Record<string, unknown>).filter((k) => (views as Record<string, unknown>)[k])
          : [];
      return (
        <div className="rbc-toolbar">
          <span className="rbc-btn-group">
            <button
              type="button"
              onClick={() => onNavigate("TODAY" as NavigateAction)}
            >
              {msgs.today}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("PREV" as NavigateAction)}
            >
              {msgs.previous}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("NEXT" as NavigateAction)}
              disabled={isNextDisabled}
            >
              {msgs.next}
            </button>
          </span>
          <span className="rbc-toolbar-label">{label}</span>
          <span className="rbc-btn-group">
            {viewNames.length > 1 &&
              viewNames.map((name: string) => (
                <button
                  type="button"
                  key={name}
                  className={view === name ? "rbc-active" : ""}
                  onClick={() => props.onView(name)}
                >
                  {msgs[name as keyof typeof msgs] ?? name}
                </button>
              ))}
          </span>
        </div>
      );
    },
    [isNextDisabled]
  );

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      const id = event.resource?.reservationId ?? event.id;
      router.push(`/reservaciones/${id}`);
    },
    [router]
  );

  // Horarios del estudio: 11:00 - 19:15 (slots de 45 min, último termina 19:15)
  const minTime = useMemo(() => {
    const d = new Date();
    d.setHours(11, 0, 0, 0);
    return d;
  }, []);
  const maxTime = useMemo(() => {
    const d = new Date();
    d.setHours(19, 30, 0, 0); // Hasta 19:30 para ver el último slot
    return d;
  }, []);

  /** En vista Día, ocultar la hora en el título (ya está en el gutter) */
  const EventComponent = useCallback(
    ({ event, title }: { event: CalendarEvent; title?: string }) => {
      const text = view === "day" && typeof title === "string"
        ? title.replace(/^\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\s*-\s*/i, "")
        : (title ?? event.title);
      return <span>{text}</span>;
    },
    [view]
  );

  const messages = useMemo(() => ({
    today: "Hoy",
    previous: "Anterior",
    next: "Siguiente",
    month: "Mes",
    week: "Semana",
    day: "Día",
    agenda: "Agenda",
    date: "Fecha",
    time: "Hora",
    event: "Evento",
    noEventsInRange: "No hay reservas en este rango.",
  }), []);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Calendario
        </h1>
        <p className="mt-1 text-zinc-600">
          Vista de reservas. Haz clic en una para ver detalles.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
          </div>
        )}
        <div className="h-[600px] p-4">
          <Calendar
            localizer={localizer}
            formats={formats}
            events={events}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            style={{ height: "100%" }}
            view={view}
            date={date}
            onView={handleViewChange}
            onNavigate={handleNavigate}
            onRangeChange={handleRangeChange}
            onSelectEvent={handleSelectEvent}
            getNow={getMonterreyDate}
            messages={messages}
            culture="es"
            views={[Views.MONTH, Views.WEEK, Views.DAY]}
            components={
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { toolbar: CustomToolbar, event: EventComponent } as any
            }
            min={minTime}
            max={maxTime}
            step={45}
            timeslots={1}
            eventPropGetter={() => ({
              style: {
                backgroundColor: "#103948",
                borderRadius: "4px",
              },
            })}
          />
        </div>
      </div>
    </div>
  );
}
