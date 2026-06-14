"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  getReservationStatusColor,
  getReservationStatusLabel,
} from "@/utils/reservation-status-display";
import {
  isImportTypeFilter,
  isOriginFilter,
  isSourceFilter,
} from "@/lib/admin/reservation-filters";
import { AdminTablePagination } from "@/components/admin/AdminTablePagination";
import { ReservationColorLegend } from "@/components/admin/ReservationColorLegend";
import { ReservationTypeChip } from "@/components/admin/ReservationTypeChip";
import {
  getAdminReservationTotalDisplay,
  getReservationRowPresentation,
  type ReservationColorInput,
} from "@/lib/admin/reservation-calendar-colors";

const PAGE_SIZE = 50;
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  ALVERO_DURATION_MIN,
  DEFAULT_DURATION_MIN,
  durationForVariant,
  isAlveroVariant,
} from "@/utils/reservation-variants";
import { addMinutesToTime } from "@/utils/reservation-helpers";
import { AdminInternalNotesField } from "@/components/admin/AdminInternalNotesField";
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
  stamp_card_code?: string | null;
}

interface VestidoSearchHit {
  googleEventId: string;
  displayTitle: string;
  date: string;
  description: string | null;
}

export default function AdminReservacionesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Cargando…</div>}>
      <AdminReservacionesPageInner />
    </Suspense>
  );
}

function AdminReservacionesPageInner() {
  const router = useRouter();
  const { isSuperAdmin } = useIsAdmin();
  // Lee filtros iniciales del URL (?search=, ?email=, ?status=, ?dateFrom=, ?dateTo=, ?origin=)
  // para que enlaces como /admin/reservaciones?search=foo@bar.com filtren al cargar.
  const sp = useSearchParams();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [vestidoEvents, setVestidoEvents] = useState<VestidoSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const tableSectionRef = useRef<HTMLDivElement>(null);
  const skipTableScrollRef = useRef(true);
  const [error, setError] = useState("");
  const originParam = sp.get("origin");
  const sourceParam = sp.get("source");
  const importTypeParam = sp.get("importType");
  const [filters, setFilters] = useState(() => ({
    dateFrom: sp.get("dateFrom") || "",
    dateTo: sp.get("dateTo") || "",
    status: sp.get("status") || "",
    // Aceptamos ?search= o ?email= (alias para enlaces desde /admin/clientes)
    search: sp.get("search") || sp.get("email") || "",
    paymentStatus: sp.get("paymentStatus") || "",
    origin: isOriginFilter(originParam) ? originParam : "",
    source: isSourceFilter(sourceParam) ? sourceParam : "",
    importType: isImportTypeFilter(importTypeParam) ? importTypeParam : "",
  }));
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => sp.get("search") || sp.get("email") || "",
  );
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  type NewReservationVariant = "cliente" | "reservado_alvero" | "cita_alvero" | "renta_vestido";

  const setNewFormVariant = (variant: NewReservationVariant) => {
    setNewForm((f) => {
      const keepsNotes =
        (variant === "cliente" || variant === "cita_alvero") &&
        (f.variant === "cliente" || f.variant === "cita_alvero");
      return {
        ...f,
        variant,
        import_notes: keepsNotes ? f.import_notes : "",
      };
    });
  };

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
    municipio: "",
    payment_state: "pending" as "pending" | "already_paid",
    /** Solo variant renta_vestido: cuadro azul en calendario (todo el día) */
    vestido_title: "",
    vestido_notes: "",
    import_notes: "",
    stamp_card_code: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Copy del calendario del cliente (solo para el modal)
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  const [pickerTime, setPickerTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  // Espacios "reservado_alvero" (manual_available) del día.
  // Solo se cargan cuando variant es `cita_alvero`. Al seleccionarlos,
  // el slot YA está ocupado por ese row y la submit hará UPDATE en sitio
  // (promoción) en lugar de INSERT.
  interface AlveroReservedSlot {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
  }
  const [alveroReservedSlots, setAlveroReservedSlots] = useState<
    AlveroReservedSlot[]
  >([]);
  // Si la selección actual viene de un "Espacio reservado", aquí va su id.
  // Si es null, es un slot libre normal (INSERT).
  const [selectedReplacesId, setSelectedReplacesId] = useState<number | null>(
    null,
  );
  const [pickerPrice, setPickerPrice] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [monthAvailability, setMonthAvailability] = useState<Map<string, number>>(new Map());
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const loadingMonthRef = useRef<Date | null>(null);
  const closedDatesLoadedRef = useRef(false);
  /** Evita que una respuesta lenta de otra fecha/variant pise slots actuales. */
  const availabilityRequestIdRef = useRef(0);
  /** Evita que una respuesta lenta de listado pise filtros/búsqueda actuales. */
  const fetchReservationsRequestIdRef = useRef(0);

  const minDate = useMemo(() => getMonterreyDate(), []);
  const maxDate = useMemo(() => {
    const d = addMonths(getMonterreyDate(), 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
      setOffset(0);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [filters.search]);

  const fetchReservations = useCallback(async (signal?: AbortSignal) => {
    const reqId = ++fetchReservationsRequestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.status) params.set("status", filters.status);
      if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
      if (filters.origin) params.set("origin", filters.origin);
      if (filters.source) params.set("source", filters.source);
      if (filters.importType) params.set("importType", filters.importType);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sort", "recent");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await axios.get(`/api/admin/reservations?${params}`, { signal });
      if (reqId !== fetchReservationsRequestIdRef.current) return;
      if (res.data.success) {
        setReservations(res.data.reservations ?? []);
        if (offset === 0) {
          setVestidoEvents(res.data.vestidoEvents ?? []);
        }
        setTotal(res.data.total ?? 0);
      } else {
        if (offset === 0) setVestidoEvents([]);
        setError(res.data.error || "Error al cargar");
      }
    } catch (err) {
      if (axios.isCancel(err) || (err as Error)?.name === "CanceledError") return;
      if (reqId !== fetchReservationsRequestIdRef.current) return;
      if (offset === 0) setVestidoEvents([]);
      setError(axios.isAxiosError(err) ? (err.response?.data?.error as string) || "Error" : "Error");
    } finally {
      if (reqId === fetchReservationsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    filters.dateFrom,
    filters.dateTo,
    filters.status,
    filters.paymentStatus,
    filters.origin,
    filters.source,
    filters.importType,
    debouncedSearch,
    offset,
  ]);

  const showVestidoHits = debouncedSearch.length > 0 && offset === 0;

  useEffect(() => {
    const controller = new AbortController();
    void fetchReservations(controller.signal);
    return () => controller.abort();
  }, [fetchReservations]);

  useEffect(() => {
    if (skipTableScrollRef.current) {
      skipTableScrollRef.current = false;
      return;
    }
    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [offset]);

  useEffect(() => {
    if (total <= 0) {
      if (offset !== 0) setOffset(0);
      return;
    }
    const maxOffset = Math.max(0, (Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE);
    if (offset > maxOffset) setOffset(maxOffset);
  }, [total, offset]);

  const tablePageBusy = loading && reservations.length > 0;

  useEffect(() => {
    if (!showNewModal) {
      availabilityRequestIdRef.current += 1;
      setSlotsLoading(false);
      return;
    }
    if (!pickerDate) {
      availabilityRequestIdRef.current += 1;
      setAvailableSlots([]);
      setPickerPrice(null);
      setAlveroReservedSlots([]);
      return;
    }
    const fetchAvailability = async () => {
      const requestId = ++availabilityRequestIdRef.current;
      setSlotsLoading(true);
      try {
        const supabase = createClient();
        const dateStr = format(pickerDate, "yyyy-MM-dd");
        // Solo pedimos espacios reservados de Alvero cuando la variante
        // es cita_alvero (es el único caso en que se pueden promover).
        const reservedFetch =
          newForm.variant === "cita_alvero"
            ? axios.get(
                `/api/admin/alvero-reserved-slots?date=${encodeURIComponent(dateStr)}`,
              )
            : Promise.resolve(null);
        // allSettled: si falla un fetch (e.g. reservados), no perdemos los
        // otros (slots libres, precio) que sí resolvieron.
        const [slotsRes, priceRes, reservedSettled] = await Promise.allSettled([
          getAvailableSlots(supabase, pickerDate),
          calculatePriceWithCustom(supabase, pickerDate),
          reservedFetch,
        ]);
        if (requestId !== availabilityRequestIdRef.current) return;
        if (slotsRes.status === "fulfilled") {
          setAvailableSlots(slotsRes.value);
        } else {
          console.error("Error cargando slots libres:", slotsRes.reason);
          setAvailableSlots([]);
        }
        if (priceRes.status === "fulfilled") {
          setPickerPrice(priceRes.value);
        } else {
          console.error("Error cargando precio:", priceRes.reason);
          setPickerPrice(null);
        }
        if (
          reservedSettled.status === "fulfilled" &&
          reservedSettled.value &&
          (reservedSettled.value as { data?: { success?: boolean; slots?: AlveroReservedSlot[] } })
            .data?.success
        ) {
          setAlveroReservedSlots(
            ((reservedSettled.value as { data: { slots?: AlveroReservedSlot[] } })
              .data.slots ?? []) as AlveroReservedSlot[],
          );
        } else {
          if (reservedSettled.status === "rejected") {
            console.error("Error cargando reservados Alvero:", reservedSettled.reason);
          }
          setAlveroReservedSlots([]);
        }
      } finally {
        if (requestId === availabilityRequestIdRef.current) {
          setSlotsLoading(false);
        }
      }
    };
    fetchAvailability();
    // newForm.variant en deps: si el admin cambia variant mientras
    // tiene pickerDate, refrescamos para mostrar/ocultar reservados.
    // showNewModal: no pedir slots con el modal cerrado (ahorra RPC y
    // evita dejar `slotsLoading` colgado si se cierra a mitad de carga).
  }, [showNewModal, pickerDate, newForm.variant]);

  const timeAvailabilityMap = useMemo(() => {
    if (!pickerDate || availableSlots.length === 0) return new Map<string, boolean>();
    const times = new Set(availableSlots.map((s) => s.start_time.substring(0, 5)));
    const isAlvero = isAlveroVariant(newForm.variant);
    return new Map(
      getSlotsForDay(pickerDate).map((t) => {
        const baseAvailable = times.has(t);
        if (!isAlvero) return [t, baseAvailable];
        // Para Alvero: el slot solo es válido si el siguiente también lo está.
        if (!baseAvailable) return [t, false];
        const next = addMinutesToTime(t, DEFAULT_DURATION_MIN);
        return [t, times.has(next)];
      }),
    );
  }, [availableSlots, pickerDate, newForm.variant]);

  const isTimeAvailable = useCallback(
    (time: string) => timeAvailabilityMap.get(time) ?? false,
    [timeAvailabilityMap]
  );

  useEffect(() => {
    if (!pickerTime) return;
    // Si la selección viene de un "Espacio reservado" (promoción),
    // validamos contra `alveroReservedSlots`; no debe limpiarse aunque
    // no esté en `timeAvailabilityMap` (que solo contiene slots libres).
    if (selectedReplacesId !== null) {
      const stillExists = alveroReservedSlots.some(
        (s) =>
          s.id === selectedReplacesId &&
          s.start_time.slice(0, 5) === pickerTime,
      );
      if (!stillExists) {
        setPickerTime(null);
        setSelectedReplacesId(null);
        setNewForm((f) => ({ ...f, startTime: "" }));
      }
      return;
    }
    if (!timeAvailabilityMap.get(pickerTime)) {
      setPickerTime(null);
      setNewForm((f) => ({ ...f, startTime: "" }));
    }
  }, [
    timeAvailabilityMap,
    pickerTime,
    selectedReplacesId,
    alveroReservedSlots,
  ]);

  // Al cambiar variant o fecha, una selección previa de "promoción"
  // deja de tener sentido (los ids cambian, o el variant ya no soporta
  // promoción). Limpiamos para evitar enviar `replaces_reservation_id`
  // con un valor obsoleto.
  useEffect(() => {
    setSelectedReplacesId(null);
  }, [newForm.variant, pickerDate]);

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
    // Selección de slot libre: nunca es promoción, limpia el id.
    setSelectedReplacesId(null);
    if (!pickerDate) return;
    setNewForm((f) => ({
      ...f,
      date: format(pickerDate, "yyyy-MM-dd"),
      startTime: time,
      // Solo cliente usa precio del calendario; Alvero/reservado permiten precio manual o 0.
      ...(f.variant === "cliente" &&
      pickerPrice !== null &&
      !f.stamp_card_code.trim()
        ? { price: pickerPrice }
        : f.variant === "cliente" && f.stamp_card_code.trim()
          ? { price: 0 }
          : {}),
    }));
  }, [pickerDate, pickerPrice]);

  // Selección de un "Espacio reservado para Alvero" → promoción en sitio.
  // Solo aplica para variant `cita_alvero`. No tocamos `price`: el admin
  // puede dejarlo en 0 o ingresarlo manualmente como en cualquier
  // cita_alvero.
  const handleReservedSlotSelect = useCallback(
    (slot: AlveroReservedSlot) => {
      const time = slot.start_time.slice(0, 5);
      setPickerTime(time);
      setSelectedReplacesId(slot.id);
      if (pickerDate) {
        setNewForm((f) => ({
          ...f,
          date: format(pickerDate, "yyyy-MM-dd"),
          startTime: time,
        }));
      }
    },
    [pickerDate],
  );

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
      // Excepción para `cita_alvero`: los días pueden tener 0 slots libres
      // y sin embargo tener "espacios reservados para Alvero" promocionables.
      // Permitimos seleccionarlos; el panel lateral mostrará los reservados
      // o un mensaje claro si tampoco hay reservados.
      const isCitaAlvero = newForm.variant === "cita_alvero";
      if (!isMonthLoaded && future && checkDate <= maxDate) return true;
      const hasNoSlots = isMonthLoaded && (slots === undefined || slots === 0);
      const blockNoSlots = hasNoSlots && future && !isCitaAlvero;
      return checkDate < today || checkDate > maxDate || closedDates.has(dateStr) || blockNoSlots;
    },
    [maxDate, closedDates, monthAvailability, isMonthLoadedForDate, newForm.variant]
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
      // Para cita_alvero, días con avail===0 pueden tener reservados
      // promocionables, así que no los marcamos como "cerrados".
      const isCitaAlvero = newForm.variant === "cita_alvero";
      const markClosed = isClosed || (avail === 0 && !isCitaAlvero);
      if (markClosed && future && checkDate <= maxDate && !isToday) return "heatmap-closed-or-unavailable";
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
    [closedDates, monthAvailability, maxDate, isMonthLoadedForDate, newForm.variant]
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
      municipio: "",
      payment_state: "pending",
      vestido_title: "",
      vestido_notes: "",
      import_notes: "",
      stamp_card_code: "",
    });
    setPickerDate(tomorrow);
    setPickerTime(null);
    setSelectedReplacesId(null);
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
    const { variant, date, startTime, name, email, phone, price, payment_method, sendEmail, order_number, municipio } = newForm;
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
        const notes = newForm.vestido_notes?.trim() ?? "";
        const res = await axios.post("/api/admin/google-calendar/vestidos", {
          date,
          title: newForm.vestido_title.trim(),
          isAllDay: true,
          ...(notes ? { description: notes } : {}),
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
      const stampCode = newForm.stamp_card_code?.trim() ?? "";
      if (stampCode) {
        if (price !== 0) {
          setCreateError("La sesión regalo con cupón debe tener precio $0.");
          return;
        }
      } else if (!price || price <= 0) {
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
        payload.sendEmail = sendEmail;
        const stampCode = newForm.stamp_card_code?.trim();
        if (stampCode) {
          payload.stamp_card_code = stampCode;
          payload.price = 0;
        } else {
          payload.price = price;
          payload.payment_method = payment_method;
          payload.payment_status =
            newForm.payment_state === "already_paid" ? "paid" : "pending";
        }
      } else if (variant === "reservado_alvero") {
        // API usa placeholders para nombre, email, teléfono y precio 0
      } else {
        payload.name = name!.trim();
        payload.order_number = order_number!.trim();
        const municipioTrim = municipio?.trim();
        if (municipioTrim) payload.municipio = municipioTrim;
        if (email?.trim()) payload.email = email.trim();
        if (phone?.trim()) payload.phone = phone.trim();
        if (price > 0) payload.price = price;
        // Promoción "en sitio" de un Espacio reservado para Alvero a
        // cita_alvero (UPDATE del row existente, no INSERT nuevo).
        if (selectedReplacesId !== null) {
          payload.replaces_reservation_id = selectedReplacesId;
        }
      }
      if (variant === "cliente" || variant === "cita_alvero") {
        const notes = newForm.import_notes?.trim();
        if (notes) payload.import_notes = notes;
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
          <p className="mt-1 text-zinc-600">
            {loading && reservations.length === 0
              ? "Cargando reservas…"
              : total === 0
                ? "Sin reservas con los filtros actuales"
                : `${total} reserva${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button type="button" onClick={openNewModal} className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d39]">
          Nueva reserva / evento
        </button>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Buscar (cliente, orden #, vestido…)
          </label>
          <input
            type="text"
            placeholder="Nombre, vestido #3839, email, teléfono…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Desde</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => {
              setOffset(0);
              setFilters((f) => ({ ...f, dateFrom: e.target.value }));
            }}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Hasta</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => {
              setOffset(0);
              setFilters((f) => ({ ...f, dateTo: e.target.value }));
            }}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Origen</label>
          <select
            value={filters.origin}
            onChange={(e) => {
              setOffset(0);
              setFilters((f) => ({ ...f, origin: e.target.value }));
            }}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            <option value="native">Nativas (web / admin)</option>
            <option value="imported">Importadas</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Estado</label>
          <select
            value={filters.status}
            onChange={(e) => {
              setOffset(0);
              setFilters((f) => ({ ...f, status: e.target.value }));
            }}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="confirmed">Confirmadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="completed">Completadas</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Pago</label>
          <select
            value={filters.paymentStatus}
            onChange={(e) => {
              setOffset(0);
              setFilters((f) => ({ ...f, paymentStatus: e.target.value }));
            }}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="pending">Pago pendiente</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {showVestidoHits && vestidoEvents.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-sky-200 bg-white shadow-sm">
          <div className="border-b border-sky-100 bg-sky-50/80 px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-[#103948]">
              Eventos de vestidos ({vestidoEvents.length})
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Calendario azul · abre el mes del evento
            </p>
          </div>
          <ul className="divide-y divide-zinc-100">
            {vestidoEvents.map((ev) => (
              <li key={ev.googleEventId}>
                <Link
                  href={`/admin/calendario?month=${ev.date.slice(0, 7)}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-sky-50/50 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      {ev.displayTitle}
                    </p>
                    {ev.description ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">
                        {ev.description}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm text-zinc-600">
                    {formatDisplayDateShort(ev.date)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        ref={tableSectionRef}
        className="scroll-mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
      >
        {loading && reservations.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
          </div>
        ) : (
          <div className="relative">
            {reservations.length > 0 ? (
              <div className="border-b border-zinc-100 px-4 py-3 sm:px-5">
                <ReservationColorLegend
                  scope={filters.origin === "native" ? "native" : "full"}
                />
              </div>
            ) : null}
            <div
              className={`overflow-x-auto transition-opacity ${tablePageBusy ? "pointer-events-none opacity-50" : ""}`}
              aria-busy={loading}
            >
            <table className="w-full min-w-[800px] table-fixed divide-y divide-zinc-200">
              <thead>
                <tr>
                  <th className="w-[14%] px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">ID</th>
                  <th className="w-[16%] px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Fecha / Hora</th>
                  <th className="w-[24%] px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Cliente</th>
                  <th className="w-[14%] px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Estado</th>
                  <th className="w-[14%] px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">Pago</th>
                  <th className="w-[12%] px-4 py-3 text-right text-xs font-medium uppercase text-zinc-500">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">No hay reservaciones con los filtros aplicados</td>
                  </tr>
                ) : (
                  reservations.map((r) => {
                    const colorInput: ReservationColorInput = {
                      source: r.source,
                      import_type: r.import_type,
                      stamp_card_code: r.stamp_card_code,
                    };
                    const row = getReservationRowPresentation(colorInput, {
                      statusLabel: getReservationStatusLabel(r.status, {
                        rescheduleCount: r.reschedule_count,
                        sessionDate: r.date,
                      }),
                    });
                    const total = getAdminReservationTotalDisplay(
                      colorInput,
                      r.status,
                      formatCurrency(r.price),
                    );

                    return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/reservaciones/${r.id}`)}
                      title={row.rowLabel}
                      aria-label={`Reserva #${r.id}: ${row.rowLabel}`}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/reservaciones/${r.id}`);
                        }
                      }}
                      className={`cursor-pointer ${row.className}`}
                      style={row.style}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                        {r.source === "google_import" && r.order_number?.trim() ? (
                          <span className="inline-flex flex-wrap items-center gap-x-1">
                            <span>#{r.order_number.trim()}</span>
                            <ReservationTypeChip input={colorInput} />
                          </span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center gap-x-1">
                            <span>#{r.id}</span>
                            <ReservationTypeChip input={colorInput} />
                            {r.order_number?.trim() && r.source !== "google_import" && (
                              <span className="text-zinc-500 font-normal">#{r.order_number.trim()}</span>
                            )}
                            {r.google_event_id && r.source !== "google_import" && (
                              <span className="text-zinc-500 font-normal">{r.google_event_id.startsWith("#") ? r.google_event_id : `#${r.google_event_id}`}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-900">
                        {formatDisplayDateShort(r.date)}
                        <br />
                        <span className="text-zinc-500">
                          {formatTimeRange(r.start_time, undefined, r.date)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate font-medium text-zinc-900">{r.name}</p>
                        <p className="truncate text-sm text-zinc-500">{r.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getReservationStatusColor(
                            r.status,
                            {
                              rescheduleCount: r.reschedule_count,
                              sessionDate: r.date,
                            },
                          )}`}
                        >
                          {getReservationStatusLabel(r.status, {
                            rescheduleCount: r.reschedule_count,
                            sessionDate: r.date,
                          })}
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
                      <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${total.className}`}>
                        {total.label}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
            {tablePageBusy ? (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60"
                aria-hidden
              >
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
              </div>
            ) : null}
          </div>
        )}
        <AdminTablePagination
          offset={offset}
          pageSize={PAGE_SIZE}
          total={total}
          loading={loading}
          onOffsetChange={setOffset}
        />
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
                    <input type="radio" name="variant" checked={newForm.variant === "cliente"} onChange={() => setNewFormVariant("cliente")} className="rounded-full border-zinc-300" />
                    <span className="text-sm">La casa de chuy</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "reservado_alvero"} onChange={() => setNewFormVariant("reservado_alvero")} className="rounded-full border-zinc-300" />
                    <span className="text-sm">Espacio reservado para Alvero</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "cita_alvero"} onChange={() => setNewFormVariant("cita_alvero")} className="rounded-full border-zinc-300" />
                    <span className="text-sm">Cita Alvero</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="variant" checked={newForm.variant === "renta_vestido"} onChange={() => { setPickerTime(null); setNewFormVariant("renta_vestido"); setNewForm((f) => ({ ...f, startTime: "" })); }} className="rounded-full border-zinc-300" />
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
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Título *</label>
                        <input
                          type="text"
                          value={newForm.vestido_title}
                          onChange={(e) => setNewForm((f) => ({ ...f, vestido_title: e.target.value }))}
                          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          placeholder="Ej. Renta vestido #3839, evento 24 abril"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Notas (opcional)</label>
                        <textarea
                          rows={4}
                          value={newForm.vestido_notes}
                          onChange={(e) => setNewForm((f) => ({ ...f, vestido_notes: e.target.value }))}
                          className="w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm"
                          placeholder="Contacto, vestido, depósito… (como la descripción en Google Calendar)"
                        />
                      </div>
                      <p className="text-xs text-zinc-500">
                        Se registra como evento de <strong>todo el día</strong> en el calendario (cuadro azul). Al crear se abrirá el calendario para revisarlo.
                      </p>
                    </div>
                  ) : slotsLoading ? (
                    <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500">Cargando horarios...</div>
                  ) : (
                    (() => {
                      const slotsForDay = getSlotsForDay(pickerDate);
                      const availableForDay = slotsForDay.filter((t) => isTimeAvailable(t));
                      const isAlvero = isAlveroVariant(newForm.variant);
                      // Promoción: solo aplica a cita_alvero. Los slots
                      // reservados ya están ocupados por un row
                      // `manual_available` y elegirlos hará UPDATE en sitio.
                      const reservedForDay =
                        newForm.variant === "cita_alvero"
                          ? alveroReservedSlots
                          : [];
                      const dateStr = format(pickerDate, "yyyy-MM-dd");
                      return (
                        <>
                          <h3 className="mb-2 text-sm font-semibold text-zinc-800">Horarios</h3>
                          <p className="mb-3 text-xs text-zinc-600">{format(pickerDate, "EEEE, d 'de' MMMM", { locale: es })}</p>
                          {isAlvero && (availableForDay.length > 0 || reservedForDay.length > 0) && (
                            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              Las {newForm.variant === "cita_alvero" ? "citas" : "reservas"} Alvero ocupan <strong>2 bloques consecutivos</strong> (90 min). Solo se muestran horarios donde el siguiente bloque también está libre.
                            </p>
                          )}

                          {reservedForDay.length > 0 && (
                            <div className="mb-4">
                              <div className="mb-2 flex items-center gap-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                  Espacios reservados disponibles
                                </h4>
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-amber-200">
                                  {reservedForDay.length}
                                </span>
                              </div>
                              <p className="mb-2 text-xs text-amber-900">
                                Bloques ya reservados para Alvero (sin cliente). Selecciónalos para asignarlos a esta cita.
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {reservedForDay.map((slot) => {
                                  const time = slot.start_time.slice(0, 5);
                                  const endHHmm = addMinutesToTime(
                                    time,
                                    ALVERO_DURATION_MIN,
                                  );
                                  const isSelected =
                                    selectedReplacesId === slot.id;
                                  return (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      onClick={() =>
                                        handleReservedSlotSelect(slot)
                                      }
                                      className={`rounded-lg border-2 px-3 py-2 text-center text-sm font-medium ${
                                        isSelected
                                          ? "border-amber-700 bg-amber-700 text-white"
                                          : "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500 hover:bg-amber-100"
                                      }`}
                                    >
                                      {formatTimeRange(time, endHHmm, dateStr)}
                                      <span
                                        className={`mt-0.5 block text-[10px] font-normal ${
                                          isSelected
                                            ? "text-amber-100"
                                            : "text-amber-700"
                                        }`}
                                      >
                                        Reservado #{slot.id}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {availableForDay.length > 0 && (
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                              {reservedForDay.length > 0
                                ? "Horarios libres"
                                : "Horarios disponibles"}
                            </h4>
                          )}
                          {availableForDay.length === 0 && reservedForDay.length === 0 ? (
                            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                              {isAlvero
                                ? "No hay 2 bloques consecutivos disponibles este día. Elige otro día."
                                : "No hay horarios disponibles este día."}
                            </p>
                          ) : availableForDay.length === 0 ? null : (
                            <div className="grid grid-cols-2 gap-2">
                              {availableForDay.map((time) => {
                                const durationMin = durationForVariant(newForm.variant);
                                const endHHmm =
                                  durationMin === ALVERO_DURATION_MIN
                                    ? addMinutesToTime(time, ALVERO_DURATION_MIN)
                                    : undefined;
                                const isSelected =
                                  pickerTime === time &&
                                  selectedReplacesId === null;
                                return (
                                  <button
                                    key={time}
                                    type="button"
                                    onClick={() => handleTimeSelect(time)}
                                    className={`rounded-lg border-2 px-3 py-2 text-center text-sm font-medium ${
                                      isSelected ? "border-[#103948] bg-[#103948] text-white" : "border-zinc-300 bg-white text-zinc-900 hover:border-[#103948] hover:bg-zinc-50"
                                    }`}
                                  >
                                    {formatTimeRange(
                                      time,
                                      endHHmm,
                                      dateStr,
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {newForm.variant === "cliente" && pickerPrice !== null && !newForm.stamp_card_code.trim() && (
                            <p className="mt-3 text-sm font-semibold text-zinc-900">Precio: {formatCurrency(pickerPrice)}</p>
                          )}
                          {newForm.variant === "cliente" && newForm.stamp_card_code.trim() && (
                            <p className="mt-3 text-sm font-semibold text-emerald-800">Sesión regalo — $0</p>
                          )}
                        </>
                      );
                    })()
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
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Cupón (tarjetero)</label>
                    <input
                      type="text"
                      value={newForm.stamp_card_code}
                      onChange={(e) => {
                        const code = e.target.value;
                        setNewForm((f) => ({
                          ...f,
                          stamp_card_code: code,
                          price: code.trim() ? 0 : pickerPrice ?? f.price,
                        }));
                      }}
                      className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                      placeholder="Ej. TARJ-0042"
                      maxLength={64}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Solo para sesión regalo.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Precio (MXN) *</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={newForm.stamp_card_code.trim() ? 0 : newForm.price || ""}
                      onChange={(e) =>
                        setNewForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))
                      }
                      disabled={!!newForm.stamp_card_code.trim()}
                      className="w-full rounded border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
                      required
                    />
                  </div>
                  {!newForm.stamp_card_code.trim() ? (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Método de pago *</label>
                        <select value={newForm.payment_method} onChange={(e) => setNewForm((f) => ({ ...f, payment_method: e.target.value as "efectivo" | "transferencia" }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
                          <option value="efectivo">Efectivo</option>
                          <option value="transferencia">Transferencia</option>
                        </select>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-medium text-zinc-600">Estado del pago</p>
                        {isSuperAdmin ? (
                          <>
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
                            <p className="mt-1 text-xs text-zinc-500">
                              Si aún no pagó, aparecerá en Pagos manuales para validar después.
                            </p>
                          </>
                        ) : (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            El pago quedará pendiente y la familia lo validará en Pagos manuales, aunque el cliente ya haya pagado en el momento.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      Sesión regalo: sin cobro ni validación en Pagos manuales.
                    </p>
                  )}
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
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Municipio (opcional)</label>
                    <input type="text" value={newForm.municipio} onChange={(e) => setNewForm((f) => ({ ...f, municipio: e.target.value }))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Ej. Monterrey" />
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

              {(newForm.variant === "cliente" || newForm.variant === "cita_alvero") && (
                <AdminInternalNotesField
                  id="new-reservation-internal-notes"
                  value={newForm.import_notes}
                  onChange={(import_notes) =>
                    setNewForm((f) => ({ ...f, import_notes }))
                  }
                />
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