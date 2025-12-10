import { format, isToday } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
}

/**
 * Convierte una hora en formato "HH:mm:ss" o "HH:mm" a minutos desde medianoche
 */
function timeToMinutes(timeString: string): number {
  const timeParts = timeString.substring(0, 5).split(":"); // "HH:mm"
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  return hours * 60 + minutes;
}

/**
 * Filtra slots pasados para el día actual
 * Si la fecha es hoy, solo retorna slots cuya hora de inicio sea mayor a la hora actual
 */
function filterPastSlotsForToday(slots: TimeSlot[], date: Date): TimeSlot[] {
  if (!isToday(date)) {
    return slots;
  }

  const now = new Date();
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

  return slots.filter((slot) => {
    const slotTimeInMinutes = timeToMinutes(slot.start_time);
    return slotTimeInMinutes > currentTimeInMinutes;
  });
}

/**
 * Obtiene los slots disponibles para una fecha usando la función SQL
 * Filtra automáticamente horarios pasados si la fecha es hoy
 */
export async function getAvailableSlots(
  supabase: SupabaseClient<Database>,
  date: Date
): Promise<TimeSlot[]> {
  const dateString = format(date, "yyyy-MM-dd");

  const { data, error } = await supabase.rpc("get_available_slots", {
    p_date: dateString,
  } as never);

  if (error || !data) {
    return [];
  }

  const slots = data as TimeSlot[];

  // Filtro adicional en frontend como medida de seguridad
  return filterPastSlotsForToday(slots, date);
}

/**
 * Verifica si un slot específico está disponible
 */
export async function checkSlotAvailability(
  supabase: SupabaseClient<Database>,
  date: Date,
  startTime: string
): Promise<boolean> {
  const dateString = format(date, "yyyy-MM-dd");

  const { data, error } = await supabase.rpc("is_slot_available", {
    p_date: dateString,
    p_start_time: startTime,
  } as never);

  if (error || data === null) {
    return false;
  }

  return data as boolean;
}

/**
 * Verifica si una fecha está cerrada
 */
export async function isDateClosed(
  supabase: SupabaseClient<Database>,
  date: Date
): Promise<boolean> {
  const dateString = format(date, "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("availability")
    .select("is_closed")
    .eq("date", dateString)
    .maybeSingle(); // Cambiar de .single() a .maybeSingle()

  if (error || !data) {
    return false; // Si no existe registro, asumimos que está abierto
  }

  return (data as { is_closed: boolean }).is_closed;
}

/**
 * Verifica si una fecha tiene slots disponibles
 */
export async function hasAvailableSlots(
  supabase: SupabaseClient<Database>,
  date: Date
): Promise<boolean> {
  const slots = await getAvailableSlots(supabase, date);
  return slots.length > 0;
}

/**
 * Obtiene la disponibilidad de slots para un rango de fechas
 * Retorna un Map con fecha (yyyy-MM-dd) -> cantidad de slots disponibles
 * Útil para visualizar disponibilidad en un calendario (heatmap)
 */
export async function getMonthAvailability(
  supabase: SupabaseClient<Database>,
  startDate: Date,
  endDate: Date
): Promise<Map<string, number>> {
  const startDateString = format(startDate, "yyyy-MM-dd");
  const endDateString = format(endDate, "yyyy-MM-dd");

  const { data, error } = await supabase.rpc("get_month_availability", {
    p_start_date: startDateString,
    p_end_date: endDateString,
  } as never);

  if (error || !data) {
    console.error("Error loading month availability:", error);
    return new Map();
  }

  // Convertir array a Map
  return new Map(
    (data as Array<{ date: string; available_slots: number }>).map((item) => [
      item.date,
      item.available_slots,
    ])
  );
}
