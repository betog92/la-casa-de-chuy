"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import type { NavigateAction } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfDay,
  endOfDay,
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

/** Colores de eventos del calendario (leyenda y eventPropGetter usan la misma fuente) */
const CALENDAR_COLORS = {
  reservation: "#103948",
  reservationOldWeb: "#0e7490",
  reservationManual: "#b91c1c",
  alveroReservation: "#6d28d9",
  alveroSpace: "#b45309",
  vestidos: "#0ea5e9",
} as const;

function getEventColor(event: { resource?: { isVestidos?: boolean; source?: string; import_type?: string | null } }): string {
  if (event.resource?.isVestidos) return CALENDAR_COLORS.vestidos;
  const source = event.resource?.source;
  const importType = event.resource?.import_type;
  if (source === "google_import" || source === "admin") {
    if (importType === "appointly") return CALENDAR_COLORS.reservationOldWeb;
    if (importType === "manual_client") return CALENDAR_COLORS.alveroReservation;
    if (importType === "manual_available") return CALENDAR_COLORS.alveroSpace;
    if (importType === "manual_other") return CALENDAR_COLORS.reservationManual;
    return source === "admin" ? CALENDAR_COLORS.reservation : CALENDAR_COLORS.reservationOldWeb;
  }
  return CALENDAR_COLORS.reservation;
}

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
  id: number | string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: { reservationId?: number; source?: string; import_type?: string | null; isVestidos?: boolean; googleEventId?: string };
}

interface GooglePreviewEvent {
  googleEventId: string;
  title: string;
  /** Título editado en la app (vestido_calendar_notes); viene del API al cargar. */
  title_override?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  originalStart: string;
  originalEnd: string;
  isAllDay: boolean;
}

export default function AdminCalendarioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Inicializar fecha desde URL para que al volver (Atrás) se restaure el mes (sin pasar del mes actual ni 6 meses adelante)
  const getInitialDate = useCallback(() => {
    const m = searchParams.get("month");
    const today = getMonterreyDate();
    const minD = startOfMonth(today);
    const maxD = addMonths(today, 6);
    if (!m || m.length < 6) return minD;
    const parts = m.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) return minD;
    const parsed = parse(`${year}-${String(month).padStart(2, "0")}-01`, "yyyy-MM-dd", new Date());
    if (Number.isNaN(parsed.getTime())) return minD;
    const d = startOfMonth(parsed);
    if (d < minD) return minD;
    if (d > maxD) return maxD;
    return d;
  }, [searchParams]);

  const initialDate = useMemo(() => getInitialDate(), [getInitialDate]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"month" | "week" | "day">("month");

  // Calendario de renta de vestidos (solo lectura; no es reservación)
  const [vestidosEvents, setVestidosEvents] = useState<GooglePreviewEvent[]>([]);
  /** Títulos editados en la app por google_event_id; se usan en la agenda en lugar del de Google. */
  const [vestidoTitleOverrides, setVestidoTitleOverrides] = useState<Record<string, string>>({});
  const [vestidoDetail, setVestidoDetail] = useState<{
    googleEventId: string;
    title: string;
    titleOverride: string | null;
    date: string;
    originalEnd: string;
    lastEditedAt: string | null;
    lastEditedBy: { id: string; name: string | null; email: string } | null;
  } | null>(null);
  const [vestidoNotesSaving, setVestidoNotesSaving] = useState(false);
  const [vestidoSaveSuccess, setVestidoSaveSuccess] = useState(false);

  /** En móvil, al tocar un día en vista mes se abre un modal centrado con los eventos del día */
  const [dayModal, setDayModal] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [date, setDate] = useState(initialDate);
  const [range, setRange] = useState<{ start: Date; end: Date }>(() => ({
    start: startOfMonth(initialDate),
    end: endOfMonth(initialDate),
  }));

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
          resource?: { reservationId: number; source?: string; import_type?: string | null };
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
    if (view === "month") {
      setRange({ start: startOfMonth(date), end: endOfMonth(date) });
    } else if (view === "week") {
      setRange({ start: startOfWeek(date, { locale: es }), end: endOfWeek(date, { locale: es }) });
    } else {
      setRange({ start: startOfDay(date), end: endOfDay(date) });
    }
  }, [view, date]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEvents(range.start, range.end, ctrl.signal);
    return () => ctrl.abort();
  }, [range.start, range.end, fetchEvents]);

  useEffect(() => {
    if (view === "month") setDate(initialDate);
  }, [initialDate, view]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get("/api/admin/google-calendar/vestidos");
        if (!cancelled && res.data?.events) setVestidosEvents(res.data.events);
      } catch {
        if (!cancelled) setVestidosEvents([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const vestidosAsCalendarEvents = useMemo((): CalendarEvent[] => {
    return vestidosEvents.map((ev) => {
      const isAllDay = ev.isAllDay ?? !ev.originalStart?.includes("T");
      const atNoon = parse(ev.date + "T12:00:00", "yyyy-MM-dd'T'HH:mm:ss", new Date());
      const startDay = startOfDay(atNoon);
      const start = isAllDay ? startDay : new Date(ev.originalStart);
      const end = isAllDay ? endOfDay(startDay) : new Date(ev.originalEnd);
      const title = vestidoTitleOverrides[ev.googleEventId] ?? ev.title_override ?? ev.title;
      return {
        id: `vestido-${ev.googleEventId}`,
        title,
        start,
        end,
        allDay: isAllDay,
        resource: { isVestidos: true, googleEventId: ev.googleEventId },
      };
    });
  }, [vestidosEvents, vestidoTitleOverrides]);

  const allDisplayEvents = useMemo(
    () => [...events, ...vestidosAsCalendarEvents],
    [events, vestidosAsCalendarEvents]
  );

  /** Eventos del modal día ordenados (vestidos primero, luego por hora); solo cuando dayModal está abierto */
  const sortedDayModalEvents = useMemo(() => {
    if (!dayModal || dayModal.events.length === 0) return [];
    return [...dayModal.events].sort((a, b) => {
      const aV = a.resource?.isVestidos ? 0 : 1;
      const bV = b.resource?.isVestidos ? 0 : 1;
      if (aV !== bV) return aV - bV;
      return a.start.getTime() - b.start.getTime();
    });
  }, [dayModal]);

  useEffect(() => {
    if (!vestidoDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVestidoDetail(null);
        setVestidoSaveSuccess(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [vestidoDetail]);

  useEffect(() => {
    if (!dayModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDayModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dayModal]);

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
        if (newView === "week" || newView === "day") {
          setDate(getMonterreyDate());
        }
      }
    },
    []
  );

  // Límite: no ir antes del mes actual ni más de 6 meses al futuro
  const minDate = useMemo(() => startOfMonth(getMonterreyDate()), []);
  const maxDate = useMemo(() => addMonths(getMonterreyDate(), 6), []);

  const handleNavigate = useCallback(
    (newDate: Date) => {
      const newStart = startOfMonth(newDate);
      const minStart = startOfMonth(minDate);
      const maxStart = startOfMonth(maxDate);
      let clamped = newDate;
      if (newStart < minStart) clamped = minDate;
      else if (newStart > maxStart) clamped = maxDate;
      setDate(clamped);
      const monthStr = format(startOfMonth(clamped), "yyyy-MM");
      router.replace(`/admin/calendario?month=${monthStr}`, { scroll: false });
    },
    [minDate, maxDate, router]
  );

  const today = useMemo(() => getMonterreyDate(), []);

  const isNextDisabled = useMemo(() => {
    if (view === "month") return startOfMonth(date).getTime() >= startOfMonth(maxDate).getTime();
    if (view === "week") return startOfWeek(date, { locale: es }).getTime() >= startOfWeek(maxDate, { locale: es }).getTime();
    return startOfDay(date).getTime() >= startOfDay(maxDate).getTime();
  }, [view, date, maxDate]);

  const isPrevDisabled = useMemo(() => {
    if (view === "month") return startOfMonth(date).getTime() <= startOfMonth(today).getTime();
    if (view === "week") return startOfWeek(date, { locale: es }).getTime() <= startOfWeek(today, { locale: es }).getTime();
    return startOfDay(date).getTime() <= startOfDay(today).getTime();
  }, [view, date, today]);

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
        <div className="rbc-toolbar mt-4 mb-4 px-1 sm:mt-2 sm:mb-3 sm:px-0" style={{ marginTop: "0", marginBottom: "0" }}>
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
              disabled={isPrevDisabled}
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
          <span className="rbc-toolbar-label" style={{ fontSize: "1.35rem", fontWeight: 600, color: "#103948" }}>
            {label}
          </span>
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
    [isNextDisabled, isPrevDisabled]
  );

  /** Abre la reservación (detalle) o el modal de vestido. Usado desde el calendario y desde el modal del día (móvil). */
  const openReservationOrVestido = useCallback(
    async (event: CalendarEvent) => {
      if (event.resource?.isVestidos && event.resource?.googleEventId) {
        const googleEventId = event.resource.googleEventId;
        const ev = vestidosEvents.find((e) => e.googleEventId === googleEventId);
        setVestidoDetail({
          googleEventId,
          title: event.title,
          titleOverride: null,
          date: ev?.date ?? "",
          originalEnd: ev?.originalEnd ?? "",
          lastEditedAt: null,
          lastEditedBy: null,
        });
        try {
          const res = await axios.get(
            `/api/admin/vestido-notes/${encodeURIComponent(googleEventId)}`
          );
          if (res.data?.success) {
            const override = res.data.title_override ?? null;
            setVestidoDetail((prev) =>
              prev
                ? {
                    ...prev,
                    titleOverride: override,
                    lastEditedAt: res.data.last_edited_at ?? null,
                    lastEditedBy: res.data.last_edited_by ?? null,
                  }
                : null
            );
            if (override != null && override.trim() !== "") {
              setVestidoTitleOverrides((prev) => ({ ...prev, [googleEventId]: override.trim() }));
            }
          }
        } catch {
          // Mantener modal con datos iniciales
        }
        return;
      }
      const id = event.resource?.reservationId ?? event.id;
      router.push(`/reservaciones/${id}`);
    },
    [router, vestidosEvents]
  );

  const handleSelectEvent = useCallback(
    async (event: CalendarEvent) => {
      // En móvil + vista mes o semana: siempre abrir el modal del día (la vista se ve muy chiquita)
      if (isMobile && (view === "month" || view === "week")) {
        const start = startOfDay(event.start);
        const end = endOfDay(event.start);
        const dayEvents = allDisplayEvents.filter(
          (ev) => ev.start < end && ev.end > start
        );
        setDayModal({ date: start, events: dayEvents });
        return;
      }
      await openReservationOrVestido(event);
    },
    [isMobile, view, allDisplayEvents, openReservationOrVestido]
  );

  /** En móvil + vista mes o semana: al tocar un día/slot, abrir modal con los eventos de ese día */
  const handleSelectSlot = useCallback(
    (slotInfo: { start: Date; end: Date; action: string }) => {
      if (!isMobile || (view !== "month" && view !== "week")) return;
      const slotStart = slotInfo.start;
      const dayStart = startOfDay(slotStart);
      const dayEnd = endOfDay(slotStart);
      const dayEvents = allDisplayEvents.filter(
        (ev) => ev.start < dayEnd && ev.end > dayStart
      );
      setDayModal({ date: dayStart, events: dayEvents });
    },
    [isMobile, view, allDisplayEvents]
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
    showMore: (total: number) => `+${total} más`,
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
        <div className="h-[70vh] sm:h-[650px] p-4 min-h-[400px]">
          <Calendar
            localizer={localizer}
            formats={formats}
            events={allDisplayEvents}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            allDayAccessor="allDay"
            style={{ height: "100%" }}
            popup={!isMobile}
            doShowMoreDrillDown={!isMobile}
            view={view}
            date={date}
            onView={handleViewChange}
            onNavigate={handleNavigate}
            onRangeChange={handleRangeChange}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            selectable={isMobile && (view === "month" || view === "week")}
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
            showMultiDayTimes={false}
            eventPropGetter={(event: CalendarEvent) => {
              if (event.resource?.isVestidos) {
                return {
                  style: {
                    backgroundColor: CALENDAR_COLORS.vestidos,
                    borderRadius: "4px",
                    opacity: 0.9,
                    borderStyle: "dashed",
                  },
                };
              }
              const importType = event.resource?.import_type;
              const source = event.resource?.source;
              let bgColor: string = CALENDAR_COLORS.reservation;
              if (source === "google_import" || source === "admin") {
                if (importType === "appointly") bgColor = CALENDAR_COLORS.reservationOldWeb;
                else if (importType === "manual_client") bgColor = CALENDAR_COLORS.alveroReservation;
                else if (importType === "manual_available") bgColor = CALENDAR_COLORS.alveroSpace;
                else if (importType === "manual_other") bgColor = CALENDAR_COLORS.reservationManual;
                else bgColor = source === "admin" ? CALENDAR_COLORS.reservation : CALENDAR_COLORS.reservationOldWeb;
              }
              return {
                style: {
                  backgroundColor: bgColor,
                  borderRadius: "4px",
                  opacity: source === "google_import" || (source === "admin" && importType) ? 0.85 : 1,
                },
              };
            }}
          />
        </div>
      </div>

      {/* Leyenda de colores */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 overflow-visible">
        <span className="font-medium text-zinc-500">Colores:</span>
        <span className="flex items-center gap-2 basis-full sm:basis-auto mt-0.5 sm:mt-0">
          <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: CALENDAR_COLORS.reservation }} aria-hidden />
          Reservación
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: CALENDAR_COLORS.reservationOldWeb }} aria-hidden />
          Reservación (página web vieja)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: CALENDAR_COLORS.reservationManual }} aria-hidden />
          Reservación manuales
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: CALENDAR_COLORS.alveroReservation }} aria-hidden />
          Reservación de Alvero
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: CALENDAR_COLORS.alveroSpace }} aria-hidden />
          Espacio reservado para Alvero
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 min-w-[0.75rem] shrink-0 rounded" style={{ backgroundColor: CALENDAR_COLORS.vestidos }} aria-hidden />
          Renta de vestidos
        </span>
      </div>

      {/* Modal día (móvil): al tocar un día en vista mes se abre centrado con los eventos */}
      {dayModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDayModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Eventos del día"
        >
          <div
            className="w-full md:max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-[#103948]">
                {format(dayModal.date, "EEEE d 'de' MMMM", { locale: es })}
              </h2>
              <button
                type="button"
                onClick={() => setDayModal(null)}
                className="rounded p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Cerrar"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2">
              {sortedDayModalEvents.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">No hay eventos este día.</p>
              ) : (
                <ul className="space-y-2">
                  {sortedDayModalEvents.map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDayModal(null);
                          openReservationOrVestido(ev);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                      >
                        <span
                          className="h-4 w-4 shrink-0 rounded"
                          style={{
                            backgroundColor: getEventColor(ev),
                            border: ev.resource?.isVestidos ? "1px dashed rgba(0,0,0,0.2)" : undefined,
                          }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{ev.title}</span>
                        {!ev.resource?.isVestidos && (
                          <span className="shrink-0 text-xs text-zinc-500">
                            {format(ev.start, "h:mm a", { locale: es })} – {format(ev.end, "h:mm a", { locale: es })}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {vestidoDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => { setVestidoDetail(null); setVestidoSaveSuccess(false); }}
        >
          <div
            className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-[#103948]">Renta de vestido</h2>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Título / descripción (editable)</label>
                <input
                  type="text"
                  value={vestidoDetail.titleOverride ?? vestidoDetail.title}
                  onChange={(e) =>
                    setVestidoDetail((p) =>
                      p ? { ...p, titleOverride: e.target.value || null } : null
                    )
                  }
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800"
                  placeholder="Ej. 3839 renta de vestido con cauda evento 24 abril"
                />
              </div>
              {vestidoDetail.lastEditedAt && vestidoDetail.lastEditedBy && (() => {
                const editedAt = new Date(vestidoDetail.lastEditedAt);
                if (Number.isNaN(editedAt.getTime())) return null;
                return (
                  <p className="mt-1 text-xs text-zinc-500">
                    Editado por última vez por {vestidoDetail.lastEditedBy.name ?? vestidoDetail.lastEditedBy.email}{" "}
                    el {format(editedAt, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })}.
                  </p>
                );
              })()}
            </div>
            <div className="flex flex-col gap-2 border-t border-zinc-200 px-6 py-4">
              {vestidoSaveSuccess && (
                <p className="text-sm text-green-600">Guardado correctamente.</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setVestidoDetail(null); setVestidoSaveSuccess(false); }}
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={vestidoNotesSaving}
                  onClick={async () => {
                  if (!vestidoDetail) return;
                  setVestidoNotesSaving(true);
                  setVestidoSaveSuccess(false);
                  try {
                    const res = await axios.patch(
                      `/api/admin/vestido-notes/${encodeURIComponent(vestidoDetail.googleEventId)}`,
                      {
                        title_override: (vestidoDetail.titleOverride ?? vestidoDetail.title).trim() || null,
                      }
                    );
                    if (res.data?.success) {
                      const newOverride = res.data.title_override ?? null;
                      setVestidoDetail((p) =>
                        p
                          ? {
                              ...p,
                              titleOverride: newOverride,
                              lastEditedAt: res.data.last_edited_at ?? null,
                              lastEditedBy: res.data.last_edited_by ?? null,
                            }
                          : null
                      );
                      setVestidoTitleOverrides((prev) => {
                        const next = { ...prev };
                        if (newOverride != null && newOverride.trim() !== "") {
                          next[vestidoDetail.googleEventId] = newOverride.trim();
                        } else {
                          delete next[vestidoDetail.googleEventId];
                        }
                        return next;
                      });
                      setVestidoSaveSuccess(true);
                      setTimeout(() => setVestidoSaveSuccess(false), 4000);
                    }
                  } finally {
                    setVestidoNotesSaving(false);
                  }
                  }}
                  className="flex-1 rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d39] disabled:opacity-60"
                >
                  {vestidoNotesSaving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}