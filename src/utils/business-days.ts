import { isSameDay, getDay, addDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// =====================================================
// DÍAS FESTIVOS EN MÉXICO (2026)
// =====================================================
// Nota: Reutilizamos la misma lista de días festivos que en pricing.ts

const MEXICAN_HOLIDAYS = [
  // 2026 - Días Festivos Oficiales
  new Date(2026, 0, 1), // Año Nuevo
  new Date(2026, 1, 2), // Día de la Constitución (Lunes 2 de febrero)
  new Date(2026, 2, 16), // Natalicio de Benito Juárez (Lunes 16 de marzo)
  new Date(2026, 4, 1), // Día del Trabajo
  new Date(2026, 8, 16), // Día de la Independencia
  new Date(2026, 10, 16), // Día de la Revolución (Lunes 16 de noviembre)
  new Date(2026, 11, 25), // Navidad
  // 2026 - Días Especiales de Alta Demanda
  new Date(2026, 3, 2), // Jueves Santo
  new Date(2026, 3, 3), // Viernes Santo
  new Date(2026, 4, 10), // Día de las Madres
  new Date(2026, 11, 12), // Día de la Virgen de Guadalupe
  new Date(2026, 11, 24), // Nochebuena
  new Date(2026, 11, 31), // Fin de Año
] as const;

/**
 * Determina si un día es festivo en México
 */
function isHoliday(date: Date): boolean {
  return MEXICAN_HOLIDAYS.some((holiday) => isSameDay(date, holiday));
}

/**
 * Determina si un día es sábado o domingo
 */
function isWeekend(date: Date): boolean {
  const dayOfWeek = getDay(date);
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domingo, 6 = Sábado
}

/**
 * Determina si un día es hábil (no es sábado, domingo ni festivo)
 */
function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

/**
 * Obtiene el siguiente día hábil a partir de una fecha
 */
function getNextBusinessDay(date: Date): Date {
  let nextDay = addDays(date, 1);
  while (!isBusinessDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
}

/**
 * Obtiene la fecha actual en zona horaria de Monterrey, normalizada al inicio del día
 * Funciona tanto en cliente como en servidor
 * 
 * @returns Fecha actual en Monterrey al inicio del día (00:00:00)
 */
export function getMonterreyToday(): Date {
  const now = new Date();
  const monterreyTime = toZonedTime(now, "America/Monterrey");
  return startOfDay(monterreyTime);
}

/**
 * Calcula el número de días hábiles entre dos fechas (excluyendo sábados, domingos y días festivos)
 * 
 * IMPORTANTE: Cuenta desde mañana (excluyendo hoy), es decir, fromDate debe ser el día siguiente a hoy.
 * Si fromDate es sábado/domingo/festivo, se cuenta desde el próximo día hábil.
 * 
 * @param fromDate - Fecha de inicio (debe ser mañana o posterior)
 * @param toDate - Fecha de fin (inclusive)
 * @returns Número de días hábiles entre las fechas
 */
export function calculateBusinessDays(fromDate: Date, toDate: Date): number {
  // Normalizar las fechas a inicio del día para comparación precisa
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);

  // Si fromDate es posterior a toDate, retornar 0
  if (from > to) {
    return 0;
  }

  // Si fromDate es sábado/domingo/festivo, empezar desde el próximo día hábil
  const startDate = isBusinessDay(from) ? from : getNextBusinessDay(from);

  // Si después de ajustar startDate, es posterior a toDate, retornar 0
  if (startDate > to) {
    return 0;
  }

  let currentDate = startDate;
  let businessDaysCount = 0;

  // Contar días hábiles desde startDate hasta toDate (inclusive)
  while (currentDate <= to) {
    if (isBusinessDay(currentDate)) {
      businessDaysCount++;
    }
    currentDate = addDays(currentDate, 1);
  }

  return businessDaysCount;
}

