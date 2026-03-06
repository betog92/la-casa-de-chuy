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

  // Estado del preview de Google Calendar
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewEvents, setPreviewEvents] = useState<GooglePreviewEvent[] | null>(null);

  // Estado de la importación real
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; errors: { googleEventId: string; error: string }[] } | null>(null);

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

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewEvents(null);
    setSyncResult(null);
    try {
      const res = await axios.get("/api/admin/google-calendar/preview");
      if (res.data.success) {
        setPreviewEvents(res.data.events ?? []);
      } else {
        setPreviewError(res.data.error || "Error al obtener preview");
      }
    } catch (err) {
      setPreviewError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || err.message || "Error al obtener preview"
          : "Error al conectar con Google Calendar"
      );
    } finally {
      setPreviewLoading(false);
    }
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

  const handleSync = useCallback(async () => {
    if (!confirm("¿Confirmas la importación de las citas de Appointly desde Google Calendar? Esta acción insertará reservas en la base de datos.")) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await axios.post("/api/admin/google-calendar/sync");
      if (res.data.success) {
        setSyncResult({ imported: res.data.imported, skipped: res.data.skipped, errors: res.data.errors ?? [] });
        fetchEvents(range.start, range.end);
      } else {
        setPreviewError(res.data.error || "Error al sincronizar");
      }
    } catch (err) {
      setPreviewError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || err.message || "Error al sincronizar"
          : "Error al conectar con Google Calendar"
      );
    } finally {
      setSyncLoading(false);
    }
  }, [fetchEvents, range.start, range.end]);

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
        <div className="rbc-toolbar" style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
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

  const handleSelectEvent = useCallback(
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading || syncLoading}
            className="flex items-center gap-2 rounded-lg border border-[#103948] px-4 py-2 text-sm font-semibold text-[#103948] transition-colors hover:bg-[#103948] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Cargando...
              </>
            ) : (
              "Ver citas de Google Calendar"
            )}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncLoading || previewLoading}
            className="flex items-center gap-2 rounded-lg bg-[#103948] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d2d38] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Importando...
              </>
            ) : (
              "Importar citas (Appointly)"
            )}
          </button>
        </div>
      </div>

      {/* Panel de preview de Google Calendar */}
      {previewError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {previewError}
        </div>
      )}
      {previewEvents !== null && (
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold text-zinc-800">
              Preview — Google Calendar{" "}
              <span className="font-normal text-zinc-500">
                (hoy → +6 meses · {previewEvents.length} evento{previewEvents.length !== 1 ? "s" : ""})
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setPreviewEvents(null)}
              className="text-sm text-zinc-400 hover:text-zinc-700"
            >
              Cerrar
            </button>
          </div>
          {previewEvents.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">
              No se encontraron eventos en Google Calendar para este rango.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 max-h-72 overflow-y-auto">
              {previewEvents.map((ev) => (
                <div key={ev.googleEventId} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800">{ev.title}</p>
                    <p className="text-xs text-zinc-500">
                      {ev.date}
                      {ev.isAllDay ? (
                        <span className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700">Todo el día</span>
                      ) : (
                        <> · {ev.startTime.slice(0, 5)} – {ev.endTime.slice(0, 5)}</>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 font-mono">
                    {ev.googleEventId.slice(0, 10)}…
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-400">
            Estos datos son solo de lectura. Nada ha sido importado aún.
          </div>
        </div>
      )}

      {/* Resultado de la importación */}
      {syncResult !== null && (
        <div className={`rounded-lg border p-4 ${syncResult.errors.length > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
          <p className={`font-semibold ${syncResult.errors.length > 0 ? "text-amber-800" : "text-green-800"}`}>
            Importación completada
          </p>
          <ul className="mt-1 text-sm text-zinc-700 space-y-0.5">
            <li>Reservas importadas: <strong>{syncResult.imported}</strong></li>
            <li>Ya existían (omitidas): <strong>{syncResult.skipped}</strong></li>
            {syncResult.errors.length > 0 && (
              <li className="text-red-700">Errores: <strong>{syncResult.errors.length}</strong></li>
            )}
          </ul>
        </div>
      )}

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
        <div className="h-[650px] p-4">
          <Calendar
            localizer={localizer}
            formats={formats}
            events={allDisplayEvents}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            allDayAccessor="allDay"
            style={{ height: "100%" }}
            popup={true}
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
            showMultiDayTimes={false}
            eventPropGetter={(event: CalendarEvent) => {
              if (event.resource?.isVestidos) {
                return {
                  style: {
                    backgroundColor: "#0ea5e9",
                    borderRadius: "4px",
                    opacity: 0.9,
                    borderStyle: "dashed",
                  },
                };
              }
              const importType = event.resource?.import_type;
              const source = event.resource?.source;
              let bgColor = "#103948";
              if (source === "google_import") {
                if (importType === "appointly") bgColor = "#0e7490";
                else if (importType === "manual_client") bgColor = "#6d28d9";
                else if (importType === "manual_available") bgColor = "#b45309";
                else if (importType === "manual_other") bgColor = "#b91c1c";
                else bgColor = "#0e7490";
              }
              return {
                style: {
                  backgroundColor: bgColor,
                  borderRadius: "4px",
                  opacity: source === "google_import" ? 0.85 : 1,
                },
              };
            }}
          />
        </div>
      </div>

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