import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
}

/**
 * Obtiene los slots disponibles para una fecha usando la función SQL
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

  return data as TimeSlot[];
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
