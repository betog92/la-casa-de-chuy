"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Calendar from "react-calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { getAvailableSlots, isDateClosed } from "@/utils/availability";
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

        // Verificar si la fecha está cerrada
        const closed = await isDateClosed(supabase, selectedDate);
        if (closed) {
          setError("Esta fecha está cerrada");
          setAvailableSlots([]);
          setPrice(null);
          setLoading(false);
          return;
        }

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

  // Obtener slots según el día de la semana
  const getSlotsForDay = (date: Date): string[] => {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 ? SUNDAY_SLOTS : WEEKDAY_SLOTS; // 0 = Domingo
  };

  // Verificar si un horario está disponible
  const isTimeAvailable = (time: string): boolean => {
    if (availableSlots.length === 0) {
      return false;
    }

    return availableSlots.some((slot) => {
      const slotTime = slot.start_time.substring(0, 5);
      return slotTime === time;
    });
  };

  // Manejar selección de fecha
  const handleDateChange = (value: unknown) => {
    if (value instanceof Date) {
      setSelectedDate(value);
      setSelectedTime(null);
    }
  };

  // Manejar selección de hora
  const handleTimeSelect = (time: string) => {
    if (isTimeAvailable(time)) {
      setSelectedTime(time);
    }
  };

  // Manejar continuar al formulario
  const handleContinue = () => {
    if (selectedDate && selectedTime && price) {
      // Guardar en sessionStorage o pasar como query params
      const reservationData = {
        date: format(selectedDate, "yyyy-MM-dd"),
        time: selectedTime,
        price: price,
      };

      sessionStorage.setItem(
        "reservationData",
        JSON.stringify(reservationData)
      );
      router.push(
        `/reservar/formulario?date=${format(
          selectedDate,
          "yyyy-MM-dd"
        )}&time=${selectedTime}`
      );
    }
  };

  // Calcular fecha máxima (6 meses desde hoy)
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  maxDate.setHours(23, 59, 59, 999);

  // Función para deshabilitar fechas pasadas, cerradas o más de 6 meses
  const tileDisabled = ({ date, view }: { date: Date; view: string }) => {
    if (view !== "month") return false;

    const dateString = format(date, "yyyy-MM-dd");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // Deshabilitar fechas pasadas, más de 6 meses en el futuro, o cerradas
    const isPastDate = checkDate < today;
    const isTooFarFuture = checkDate > maxDate;
    const isClosed = closedDates.has(dateString);

    return isPastDate || isTooFarFuture || isClosed;
  };

  // Función para personalizar el contenido de cada fecha en el calendario
  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== "month") return null;

    const dateString = format(date, "yyyy-MM-dd");
    const isClosed = closedDates.has(dateString);

    if (isClosed) {
      return <div className="mt-1 text-xs text-red-500">Cerrado</div>;
    }

    return null;
  };

  // Asegurar que el componente solo se renderice en el cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cargar fechas cerradas al montar el componente
  useEffect(() => {
    if (!mounted) return;

    const loadClosedDates = async () => {
      try {
        const supabase = createClient();
        const today = new Date();
        const threeMonthsLater = new Date();
        threeMonthsLater.setMonth(today.getMonth() + 3);

        // Obtener fechas cerradas para los próximos 3 meses
        const { data, error } = await supabase
          .from("availability")
          .select("date")
          .eq("is_closed", true)
          .gte("date", format(today, "yyyy-MM-dd"))
          .lte("date", format(threeMonthsLater, "yyyy-MM-dd"));

        if (!error && data) {
          const closedSet = new Set(
            data.map((item) => (item as { date: string }).date)
          );
          setClosedDates(closedSet);
        }
      } catch (err) {
        console.error("Error loading closed dates:", err);
      }
    };

    loadClosedDates();
  }, [mounted]);

  // Obtener tipo de día para mostrar precio
  const getDayTypeLabel = (date: Date | null): string => {
    if (!date) return "";
    const dayType = getDayType(date);
    switch (dayType) {
      case "holiday":
        return "Día Festivo";
      case "weekend":
        return "Fin de Semana";
      default:
        return "Día Normal";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white py-6 sm:py-12">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-6 text-center sm:mb-8">
            <h1 className="mb-2 text-3xl font-bold text-zinc-900 sm:mb-4 sm:text-4xl">
              Reserva tu Sesión
            </h1>
            <p className="text-base text-zinc-600 sm:text-lg">
              Selecciona la fecha y hora que prefieras
            </p>
          </div>

          <div className="grid gap-4 sm:gap-8 lg:grid-cols-2">
            {/* Calendario */}
            <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-6">
              <h2 className="mb-3 text-lg font-semibold text-zinc-900 sm:mb-4 sm:text-2xl">
                Selecciona una Fecha
              </h2>
              {mounted ? (
                <Calendar
                  onChange={handleDateChange}
                  value={selectedDate}
                  locale="es"
                  minDate={new Date()}
                  maxDate={maxDate}
                  tileDisabled={tileDisabled}
                  tileContent={tileContent}
                  className="w-full rounded-lg border-0"
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
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-3 sm:gap-3">
                    {getSlotsForDay(selectedDate).map((time) => {
                      const available = isTimeAvailable(time);
                      const isSelected = selectedTime === time;

                      return (
                        <button
                          key={time}
                          onClick={() => handleTimeSelect(time)}
                          disabled={!available}
                          className={`rounded-lg border-2 px-3 py-2 text-center text-sm font-semibold transition-all sm:px-4 sm:py-3 sm:text-base ${
                            isSelected
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : available
                              ? "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-900 hover:bg-zinc-50"
                              : "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed"
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>

                  {/* Precio */}
                  {price && (
                    <div className="mb-4 rounded-lg bg-zinc-50 p-3 sm:mb-6 sm:p-4">
                      <div className="mb-2 flex justify-between items-center">
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
