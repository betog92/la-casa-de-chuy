import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DEFAULT_DURATION_MIN } from "@/utils/reservation-variants";

/** Convierte "HH:mm" o "HH:mm:ss" en minutos desde 00:00. Vacío/inválido => 0. */
function timeToMinutes(time: string): number {
  if (!time) return 0;
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const safeH = Number.isFinite(h) ? h : 0;
  const safeM = Number.isFinite(m) ? m : 0;
  return safeH * 60 + safeM;
}

/**
 * Calcula el end_time sumando una duración (por defecto 45 min) al start_time.
 * @param startTime - Hora de inicio "HH:mm" (ej: "14:00")
 * @param durationMinutes - Duración total en minutos (default 45; Alvero usa 90)
 * @returns Hora de fin "HH:mm:ss"
 */
export function calculateEndTime(
  startTime: string,
  durationMinutes: number = DEFAULT_DURATION_MIN,
): string {
  const totalMinutes = timeToMinutes(startTime) + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes
    .toString()
    .padStart(2, "0")}:00`;
}

/** Suma N minutos a una hora "HH:mm" y devuelve "HH:mm" (sin segundos). */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${eh.toString().padStart(2, "0")}:${em.toString().padStart(2, "0")}`;
}

/**
 * Valida que un slot esté disponible antes de crear la reserva.
 * Usado para reservas de 1 bloque (45 min). Para Alvero (2 bloques) usar
 * `validateConsecutiveSlots`.
 */
export async function validateSlotAvailability(
  supabase: SupabaseClient<Database>,
  date: string,
  startTime: string
): Promise<boolean> {
  try {
    const normalizedTime = startTime.includes(":") && startTime.split(":").length === 2
      ? `${startTime}:00`
      : startTime;
    const { data, error } = await supabase.rpc("is_slot_available", {
      p_date: date,
      p_start_time: normalizedTime,
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
 * Valida `count` slots consecutivos de 45 min disponibles a partir de
 * `startTime` (ej.: para citas Alvero count = 2 → 90 min totales).
 * Devuelve true solo si TODOS los slots están disponibles.
 *
 * Las validaciones se hacen en paralelo (Promise.all) para reducir latencia.
 */
export async function validateConsecutiveSlots(
  supabase: SupabaseClient<Database>,
  date: string,
  startTime: string,
  count: number,
): Promise<boolean> {
  if (count <= 0) return false;
  if (count === 1) return validateSlotAvailability(supabase, date, startTime);
  const startHHmm = startTime.length >= 5 ? startTime.slice(0, 5) : startTime;
  const checks = Array.from({ length: count }, (_, i) =>
    validateSlotAvailability(
      supabase,
      date,
      addMinutesToTime(startHHmm, i * DEFAULT_DURATION_MIN),
    ),
  );
  const results = await Promise.all(checks);
  return results.every(Boolean);
}

/** Convierte hora "HH:mm" a "HH:mm:ss" (idempotente si ya trae segundos). */
export function formatTimeToSeconds(time: string): string {
  return time.includes(":") && time.split(":").length === 2
    ? `${time}:00`
    : time;
}

/**
 * Calcula la duración en minutos entre dos horas en formato HH:mm o HH:mm:ss.
 * Útil para reagendar: detecta si la reserva original era de 45 o 90 min.
 * Si los datos vienen vacíos/inválidos o el diff no es positivo, regresa el
 * default seguro de 45 min (1 bloque) para no romper flujos legacy.
 */
export function durationMinutesBetween(
  startTime: string,
  endTime: string,
): number {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  return diff > 0 ? diff : DEFAULT_DURATION_MIN;
}
