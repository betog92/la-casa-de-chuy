"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Calendar from "react-calendar";
import {
  format,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  isSameMonth,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import {
  formatDisplayDateShort,
  formatTimeRange,
  formatCurrency,
} from "@/utils/formatters";
import { createClient } from "@/lib/supabase/client";
import { getAvailableSlots, getMonthAvailability } from "@/utils/availability";
import { calculatePriceWithCustom } from "@/utils/pricing";
import type { TimeSlot } from "@/utils/availability";
import "react-calendar/dist/Calendar.css";

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

const normalizeDate = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonterreyDate = (): Date => {
  const now = new Date();
  const monterreyTime = toZonedTime(now, "America/Monterrey");
  return normalizeDate(monterreyTime);
};

const isFutureDate = (date: Date): boolean =>
  normalizeDate(date) >= getMonterreyDate();

const getSlotsForDay = (date: Date): string[] =>
  date.getDay() === 0 ? SUNDAY_SLOTS : WEEKDAY_SLOTS;

interface Reservation {
  id: number;
  email: string;
  name: string;
  phone: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  original_price: number;
  status: string;
  payment_id: string | null;
  payment_method?: string | null;
  payment_status?: "pending" | "paid" | "not_applicable" | null;
  created_at: string;
  reschedule_count?: number;
  discount_code: string | null;
  source?: string | null;
  import_type?: string | null;
  order_number?: string | null;
  google_event_id?: string | null;
}

const getStatusLabel = (status: string, rescheduleCount?: number): string => {
  if (status === "confirmed" && rescheduleCount && rescheduleCount > 0) return "Reagendada";
  const labels: Record<string, string> = {
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    completed: "Completada",
  };
  return labels[status] || status;
};

const getStatusColor = (status: string, rescheduleCount?: number): string => {
  if (status === "confirmed" && rescheduleCount && rescheduleCount > 0) return "bg-orange-100 text-orange-800";
  const colors: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    completed: "bg-blue-100 text-blue-800",
  };
  return colors[status] || "bg-zinc-100 text-zinc-800";
}

export default function AdminReservacionesPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", status: "", search: "", paymentStatus: "" });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  type NewReservationVariant = "cliente" | "reservado_alvero" | "cita_alvero" | "renta_vestido";
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({
    variant: "cliente" as NewReservationVariant,
    date: "",
    startTime: "",
    name: "",
    email: "",
    phone: "",
    price: 0,
    payment_method: "efectivo" as "efectivo" | "transferencia",
    sendEmail: true,
    order_number: "",
    payment_state: "pending" as "pending" | "already_paid",
    /** Solo variant renta_vestido: cuadro azul en calendario (todo el día) */
    vestido_title: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Copy del calendario del cliente (solo para el modal)
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  const [pickerTime, setPickerTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [pickerPrice, setPickerPrice] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [monthAvailability, setMonthAvailability] = useState<Map<string, number>>(new Map());
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const loadingMonthRef = useRef<Date | null>(null);
  const closedDatesLoadedRef = useRef(false);

  const minDate = useMemo(() => getMonterreyDate(), []);
  const maxDate = useMemo(() => {
    const d = addMonths(getMonterreyDate(), 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  useEffect(() => {
    axios.get("/api/admin/me").then((res) => {
      if (res.data?.success && res.data?.isSuperAdmin) setIsSuperAdmin(true);
    }).catch(() => {});
  }, []);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.status) params.set("status", filters.status);
      if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
      if (filters.search) params.set("search", filters.search);
      const res = await axios.get(`/api/admin/reservations?${params}`);
      if (res.data.success) {
        setReservations(res.data.reservations ?? []);
        setTotal(res.data.total ?? 0);
      } else {
        setError(res.data.error || "Error al cargar");
      }
    } catch (err) {
      setError(axios.isAxiosError(err) ? (err.response?.data?.error as string) || "Error" : "Error");
    } finally {
      setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo, filters.status, filters.paymentStatus, filters.search]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  useEffect(() => {
    if (!pickerDate) {
      setAvailableSlots([]);
      setPickerPrice(null);
      return;
    }
    const fetchAvailability = async () => {
      setSlotsLoading(true);
      try {
        const supabase = createClient();
        const [slots, price] = await Promise.all([
          getAvailableSlots(supabase, pickerDate),
          calculatePriceWithCustom(supabase, pickerDate),
        ]);
        setAvailableSlots(slots);
        setPickerPrice(price);
      } catch (err) {
        console.error(err);
      } finally {
        setSlotsLoading(false);
      }
    };
    fetchAvailability();
  }, [pickerDate]);

  const timeAvailabilityMap = useMemo(() => {
    if (!pickerDate || availableSlots.length === 0) return new Map<string, boolean>();
    const times = new Set(availableSlots.map((s) => s.start_time.substring(0, 5)));
    return new Map(getSlotsForDay(pickerDate).map((t) => [t, times.has(t)]));
  }, [availableSlots, pickerDate]);

  const isTimeAvailable = useCallback(
    (time: string) => timeAvailabilityMap.get(time) ?? false,
    [timeAvailabilityMap]
  );

  const isMonthLoadedForDate = useCallback(
    (date: Date) => currentMonth !== null && isSameMonth(currentMonth, startOfMonth(date)),
    [currentMonth]
  );

  const loadMonthAvailability = useCallback(async (monthDate: Date) => {
    const normalized = startOfMonth(monthDate);
    loadingMonthRef.current = normalized;
    try {
      const supabase = createClient();
      const availability = await getMonthAvailability(supabase, normalized, endOfMonth(monthDate));
      if (loadingMonthRef.current && isSameMonth(loadingMonthRef.current, normalized)) {
        setMonthAvailability(availability);
        setCurrentMonth(normalized);
      }
    } catch (err) {
      console.error("Error loading month availability:", err);
      if (loadingMonthRef.current && isSameMonth(loadingMonthRef.current, normalized)) {
        setMonthAvailability(new Map());
        setCurrentMonth(normalized);
      }
    } finally {
      if (loadingMonthRef.current && isSameMonth(loadingMonthRef.current, normalized)) {
        loadingMonthRef.current = null;
      }
    }
  }, []);

  const handleMonthChange = useCallback(
    (activeStartDate: Date) => {
      if (currentMonth && isSameMonth(currentMonth, activeStartDate)) return;
      loadMonthAvailability(activeStartDate);
    },
    [currentMonth, loadMonthAvailability]
  );

  const handleDateChange = useCallback((value: unknown) => {
    if (value instanceof Date) {
      setPickerTime(null);
      setPickerDate(value);
      setNewForm((f) => ({
        ...f,
        date: format(value, "yyyy-MM-dd"),
        startTime: f.variant === "renta_vestido" ? f.startTime : "",
        price: f.variant === "renta_vestido" ? f.price : 0,
      }));
    }
  }, []);

  const handleTimeSelect = useCallback((time: string) => {
    setPickerTime(time);
    if (pickerDate && pickerPrice !== null) {
      setNewForm((f) => ({
        ...f,
        date: format(pickerDate, "yyyy-MM-dd"),
        startTime: time,
        price: pickerPrice,
      }));
    }
  }, [pickerDate, pickerPrice]);

  const tileDisabled = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return false;
      const dateStr = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyDate();
      const future = isFutureDate(date);
      const isMonthLoaded = isMonthLoadedForDate(date);
      const slots = monthAvailability.get(dateStr);
      // Misma regla para todas las variantes (incl. renta de vestidos): hoy sin cupos queda deshabilitado, etc.
      if (!isMonthLoaded && future && checkDate <= maxDate) return true;
      const hasNoSlots = isMonthLoaded && (slots === undefined || slots === 0);
      return checkDate < today || checkDate > maxDate || closedDates.has(dateStr) || (hasNoSlots && future);
    },
    [maxDate, closedDates, monthAvailability, isMonthLoadedForDate]
  );

  const tileClassName = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      if (view !== "month") return "";
      const dateStr = format(date, "yyyy-MM-dd");
      const checkDate = normalizeDate(date);
      const today = getMonterreyDate();
      const future = isFutureDate(date);
      const isToday = checkDate.getTime() === today.getTime();
      const isClosed = closedDates.has(dateStr);
      const slots = monthAvailability.get(dateStr);
      const isMonthLoaded = isMonthLoadedForDate(date);
      if (!isMonthLoaded && future) return "";
      const avail = slots ?? 0;
      if (isToday && avail === 0) return "";
      if ((isClosed || avail === 0) && future && checkDate <= maxDate && !isToday) return "heatmap-closed-or-unavailable";
      if (avail > 0) {
        const maxSlots = date.getDay() === 0 ? 7 : 11;
        const pct = (avail / maxSlots) * 100;
        if (pct >= 80) return "heatmap-high";
        if (pct >= 50) return "heatmap-medium";
        if (pct >= 20) return "heatmap-low";
        if (pct > 0) return "heatmap-minimal";
      }
      return "";
    },
    [closedDates, monthAvailability, maxDate, isMonthLoadedForDate]
  );

  const openNewModal = () => {
    const today = getMonterreyDate();
    const tomorrow = addDays(today, 1);
    setNewForm({
      variant: "cliente",
      date: format(tomorrow, "yyyy-MM-dd"),
      startTime: "",
      name: "",
      email: "",
      phone: "",
      price: 0,
      payment_method: "efectivo",
      sendEmail: true,
      order_number: "",
      payment_state: "pending",
      vestido_title: "",
    });
    setPickerDate(tomorrow);
    setPickerTime(null);
    setCreateError("");
    setShowNewModal(true);
  };

  useEffect(() => {
    if (!showNewModal) return;
    closedDatesLoadedRef.current = false;
  }, [showNewModal]);

  useEffect(() => {
    if (!showNewModal) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowNewModal(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [showNewModal]);

  useEffect(() => {
    if (!showNewModal) return;
    const init = async () => {
      const supabase = createClient();
      const today = getMonterreyDate();
      if (!closedDatesLoadedRef.current) {
        closedDatesLoadedRef.current = true;
        try {
          const threeMonthsLater = addMonths(today, 3);
          const { data } = await supabase
            .from("availability")
            .select("date")
            .eq("is_closed", true)
            .gte("date", format(today, "yyyy-MM-dd"))
            .lte("date", format(threeMonthsLater, "yyyy-MM-dd"));
          if (data) setClosedDates(new Set(data.map((r) => r.date)));
        } catch (err) {
          console.error("Error loading closed dates:", err);
        }
      }
      const monthToLoad = pickerDate ? startOfMonth(pickerDate) : today;
      loadMonthAvailability(monthToLoad);
    };
    init();
  }, [showNewModal, pickerDate, loadMonthAvailability]);

  const submitNewReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    const { variant, date, startTime, name, email, phone, price, payment_method, sendEmail, order_number } = newForm;
    if (variant === "renta_vestido") {
      if (!date) {
        setCreateError("Selecciona una fecha.");
        return;
      }
      if (!newForm.vestido_title?.trim()) {
        setCreateError("Escribe un título o descripción para el evento.");
        return;
      }
      setCreateLoading(true);
      try {
        const res = await axios.post("/api/admin/google-calendar/vestidos", {
          date,
          title: newForm.vestido_title.trim(),
          isAllDay: true,
        });
        if (res.data?.success) {
          setShowNewModal(false);
          const monthStr = date.slice(0, 7);
          router.push(`/admin/calendario?month=${monthStr}`);
        } else {
          setCreateError(res.data?.error || "Error al crear el evento");
        }
      } catch (err) {
        setCreateError(axios.isAxiosError(err) ? (err.response?.data?.error as string) || "Error" : "Error");
      } finally {
        setCreateLoading(false);
      }
      return;
    }
    if (!date || !startTime) {
      setCreateError("Selecciona fecha y horario.");
      return;
    }
    if (variant === "cliente") {
      if (!name?.trim() || !email?.trim() || !phone?.trim()) {
        setCreateError("Completa nombre, email y teléfono.");
        return;
      }
      if (!price || price <= 0) {
        setCreateError("El precio debe ser mayor a 0.");
        return;
      }
    } else if (variant === "cita_alvero") {
      if (!name?.trim()) {
        setCreateError("Nombre requerido.");
        return;
      }
      if (!order_number?.trim()) {
        setCreateError("Número de orden requerido.");
        return;
      }
    }
    setCreateLoading(true);
    try {
      const payload: Record<string, unknown> = {
        variant,
        date,
        startTime: startTime.slice(0, 5),
      };
      if (variant === "cliente") {
        payload.name = name!.trim();
        payload.email = email!.trim();
        payload.phone = phone!.trim();
        payload.price = price;
        payload.payment_method = payment_method;
        payload.payment_status = newForm.payment_state === "already_paid" ? "paid" : "pending";
        payload.sendEmail = sendEmail;
      } else if (variant === "reservado_alvero") {
        // API usa placeholders para nombre, email, teléfono y precio 0
      } else {
        payload.name = name!.trim();
        payload.order_number = order_number!.trim();
        if (email?.trim()) payload.email = email.trim();
        if (phone?.trim()) payload.phone = phone.trim();
        if (price > 0) payload.price = price;
      }
      const res = await axios.post("/api/admin/reservations", payload);
      if (res.data.success && res.data.reservationId) {
        setShowNewModal(false);
        fetchReservations();
        router.push(`/reservaciones/${res.data.reservationId}`);
      } else {
        setCreateError(res.data.error || "Error al crear");
      }
    } catch (err) {
      setCreateError(axios.isAxiosError(err) ? (err.response?.data?.error as string) || "Error" : "Error");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#103948]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            Reservaciones
          </h1>
          <p className="mt-1 text-zinc-600">Listado de todas las reservas</p>
        </div>
        <button type="button" onClick={openNewModal} className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d39]">
          Nueva reserva / evento
        </button>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Buscar (nombre, email, teléfono, orden #)</label>
          <input
            type="text"
            placeholder="Nombre, email, teléfono o #6521..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Desde</label>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="rounded border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Hasta</label>
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="rounded border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Estado</label>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="confirmed">Confirmadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="completed">Completadas</option>
          </select>
        </div>
        {isSuperAdmin && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Pago</label>
            <select value={filters.paymentStatus} onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))} className="rounded border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="pending">Pago pendiente</option>
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Fecha / Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Pago</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-zinc-500">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">No hay reservaciones con los filtros aplicados</td>
                  </tr>
                ) : (
                  reservations.map((r, index) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/reservaciones/${r.id}`)}
                      className={`cursor-pointer transition-colors ${index % 2 === 1 ? "bg-zinc-100" : "bg-white"} hover:bg-zinc-200`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                        {r.source === "google_import" && r.order_number?.trim() ? (
                          <>
                            <span>#{r.order_number.trim()}</span>
                            <span className="ml-1.5 inline-flex rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">Importada</span>
                          </>
                        ) : (
                          <>
                            <span>#{r.id}</span>
                            {r.order_number?.trim() && r.source !== "google_import" && (
                              <span className="ml-1 text-zinc-500 font-normal">#{r.order_number.trim()}</span>
                            )}
                            {r.google_event_id && r.source !== "google_import" && (
                              <span className="ml-1 text-zinc-500 font-normal">{r.google_event_id.startsWith("#") ? r.google_event_id : `#${r.google_event_id}`}</span>
                            )}
                            {r.source === "google_import" && (
                              <span className="ml-1.5 inline-flex rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">Importada</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-900">
                        {formatDisplayDateShort(r.date)}
                        <br />
                        <span className="text-zinc-500">{formatTimeRange(r.start_time)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{r.name}</p>
                        <p className="text-sm text-zinc-500">{r.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(r.status, r.reschedule_count)}`}>
                          {getStatusLabel(r.status, r.reschedule_count)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.payment_status === "pending" && (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Pago pendiente</span>
                        )}
                        {(r.payment_status === "paid" || (r.source === "web" && (r.payment_method === "conekta" || r.payment_id))) && (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Pagado</span>
                        )}
                        {!(r.payment_status === "pending" || r.payment_status === "paid" || (r.source === "web" && (r.payment_method === "conekta" || r.payment_id))) && (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-zinc-900">{formatCurrency(r.price)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <div className="border-t border-zinc-200 px-4 py-2 text-sm text-zinc-500">Total: {total} reserva{total !== 1 ? "s" : ""}</div>
        )}
      </div>

      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="my-8 w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-[#103948]">Nueva reserva o evento</h2>
              <p className="text-sm text-zinc-500">Reservas de estudio o evento de renta de vestidos (calendario azul)</p>
            </div>
            <form onSubmit={submitNewReservation} className="space-y-4 p-6">
              {createError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-zinc-600">Tipo de reserva</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "cliente"} onChange={() => setNewForm((f) => ({ ...f, variant: "cliente" }))} className="rounded-full border-zinc-300" />
                    <span className="text-sm">La casa de chuy</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "reservado_alvero"} onChange={() => setNewForm((f) => ({ ...f, variant: "reservado_alvero" }))} className="rounded-full border-zinc-300" />
                    <span className="text-sm">Espacio reservado para Alvero</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "cita_alvero"} onChange={() => setNewForm((f) => ({ ...f, variant: "cita_alvero" }))} className="rounded-full border-zinc-300" />
                    <span className="text-sm">Cita Alvero</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "renta_vestido"} onChange={() => { setPickerTime(null); setNewForm((f) => ({ ...f, variant: "renta_vestido", startTime: "" })); }} className="rounded-full border-zinc-300" />
                    <span className="text-sm">Renta de vestidos</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-4 border-b border-zinc-100 pb-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-zinc-800">Selecciona una fecha</h3>
                  <Calendar
                    onChange={handleDateChange}
                    value={pickerDate}
                    locale="es"
                    minDate={minDate}
                    maxDate={maxDate}
                    tileDisabled={tileDisabled}
                    tileClassName={tileClassName}
                    onActiveStartDateChange={({ activeStartDate }) => activeStartDate && handleMonthChange(activeStartDate)}
                    className="w-full rounded-lg border-0"
                    showNeighboringMonth={false}
                  />
                </div>
                <div>
                  {!pickerDate ? (
                    <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500">Selecciona una fecha</div>
                  ) : newForm.variant === "renta_vestido" ? (
                    <div className="space-y-4">
                      <h3 className="mb-2 text-sm font-semibold text-zinc-800">Evento en calendario (vestidos)</h3>
                      <p className="text-xs text-zinc-600">{format(pickerDate, "EEEE, d 'de' MMMM", { locale: es })}</p>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Título / descripción *</label>
                        <input
                          type="text"
                          value={newForm.vestido_title}
                          onChange={(e) => setNewForm((f) => ({ ...f, vestido_title: e.target.value }))}
                          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          placeholder="Ej. Renta vestido #3839, evento 24 abril"
                        />
                      </div>
                      <p className="text-xs text-zinc-500">
                        Se registra como evento de <strong>todo el día</strong> en el calendario (cuadro azul). Al crear se abrirá el calendario para revisarlo.
                      </p>
                    </div>
                  ) : slotsLoading ? (
                    <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500">Cargando horarios...</div>
                  ) : (
                    <>
                      <h3 className="mb-2 text-sm font-semibold text-zinc-800">Horarios disponibles</h3>
                      <p className="mb-3 text-xs text-zinc-600">{format(pickerDate, "EEEE, d 'de' MMMM", { locale: es })}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {getSlotsForDay(pickerDate)
                          .filter((t) => isTimeAvailable(t))
                          .map((time) => (
                            <button
                              key={time}
                              type="button"
                              onClick={() => handleTimeSelect(time)}
                              className={`rounded-lg border-2 px-3 py-2 text-center text-sm font-medium ${
                                pickerTime === time ? "border-[#103948] bg-[#103948] text-white" : "border-zinc-300 bg-white text-zinc-900 hover:border-[#103948] hover:bg-zinc-50"
                              }`}
                            >
                              {formatTimeRange(time)}
                            </button>
                          ))}
                      </div>
                      {newForm.variant === "cliente" && pickerPrice !== null && (
                        <p className="mt-3 text-sm font-semibold text-zinc-900">Precio: {formatCurrency(pickerPrice)}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {newForm.variant === "cliente" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Nombre *</label>
                    <input type="text" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Ej. Juan Pérez" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Email *</label>
                    <input type="email" value={newForm.email} onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="cliente@ejemplo.com" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Teléfono *</label>
                    <input type="tel" value={newForm.phone} onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Ej. 8123456789" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Precio (MXN) *</label>
                    <input type="number" min={0} step={1} value={newForm.price || ""} onChange={(e) => setNewForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Método de pago *</label>
                    <select value={newForm.payment_method} onChange={(e) => setNewForm((f) => ({ ...f, payment_method: e.target.value as "efectivo" | "transferencia" }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-600">Estado del pago</p>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="radio" name="payment_state" checked={newForm.payment_state === "pending"} onChange={() => setNewForm((f) => ({ ...f, payment_state: "pending" }))} className="rounded-full border-zinc-300" />
                        <span className="text-sm">Cliente aún no ha pagado</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="radio" name="payment_state" checked={newForm.payment_state === "already_paid"} onChange={() => setNewForm((f) => ({ ...f, payment_state: "already_paid" }))} className="rounded-full border-zinc-300" />
                        <span className="text-sm">Cliente ya pagó (efectivo/transferencia)</span>
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Nancy podrá validar el pago después.</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={newForm.sendEmail} onChange={(e) => setNewForm((f) => ({ ...f, sendEmail: e.target.checked }))} className="rounded border-zinc-300" />
                    <span className="text-sm text-zinc-600">Enviar email de confirmación</span>
                  </label>
                </>
              )}

              {newForm.variant === "cita_alvero" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Nombre *</label>
                    <input type="text" value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Nombre del cliente" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Número de orden *</label>
                    <input type="text" value={newForm.order_number} onChange={(e) => setNewForm((f) => ({ ...f, order_number: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Ej. 6521" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Email (opcional)</label>
                    <input type="email" value={newForm.email} onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="cliente@ejemplo.com" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Teléfono (opcional)</label>
                    <input type="tel" value={newForm.phone} onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Ej. 8123456789" />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d39] disabled:opacity-60"
                >
                  {createLoading ? "Creando..." : newForm.variant === "renta_vestido" ? "Crear evento vestido" : "Crear reserva"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
