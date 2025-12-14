import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Calcula el end_time sumando 45 minutos al start_time
 * @param startTime - Hora de inicio en formato "HH:mm" (ej: "14:00")
 * @returns Hora de fin en formato "HH:mm:ss" (ej: "14:45:00")
 */
export function calculateEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + 45;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes
    .toString()
    .padStart(2, "0")}:00`;
}

/**
 * Valida que un slot esté disponible antes de crear la reserva
 * @param supabase - Cliente de Supabase
 * @param date - Fecha en formato "YYYY-MM-DD"
 * @param startTime - Hora de inicio en formato "HH:mm"
 * @returns true si el slot está disponible, false si no
 */
export async function validateSlotAvailability(
  supabase: SupabaseClient<Database>,
  date: string,
  startTime: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_slot_available", {
      p_date: date,
      p_start_time: startTime + ":00",
    } as never);

    if (error) {
      console.error("Error validando disponibilidad del slot:", error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error("Error al validar disponibilidad:", error);
    return false;
  }
}

/**
 * Convierte hora de formato "HH:mm" a "HH:mm:ss"
 * @param time - Hora en formato "HH:mm"
 * @returns Hora en formato "HH:mm:ss"
 */
export function formatTimeToSeconds(time: string): string {
  return time.includes(":") && time.split(":").length === 2
    ? `${time}:00`
    : time;
}
