import { format, parse, addHours } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatea una fecha en formato legible en español
 * @example "2025-12-27" -> "Sábado, 27 de diciembre de 2025"
 */
export function formatDisplayDate(dateString: string): string {
  try {
    const date = parse(dateString, "yyyy-MM-dd", new Date());
    const formatted = format(date, "EEEE, d 'de' MMMM 'de' yyyy", {
      locale: es,
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return dateString;
  }
}

/**
 * Formatea un rango de hora (1 hora desde start_time)
 * @example "18:30" -> "6:30 pm - 7:30 pm"
 * NOTA: Aunque los slots técnicos en la BD son de 45 minutos, mostramos 1 hora al usuario
 * porque la sesión real de fotografía es de 1 hora completa.
 */
export function formatTimeRange(startTime: string): string {
  try {
    const [hours, minutes] = startTime.split(":").slice(0, 2).map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    const endDate = addHours(startDate, 1);

    const startFormatted = format(startDate, "h:mm a", {
      locale: es,
    }).toLowerCase();
    const endFormatted = format(endDate, "h:mm a", {
      locale: es,
    }).toLowerCase();

    return `${startFormatted} - ${endFormatted}`;
  } catch {
    return startTime;
  }
}

/**
 * Formatea un ID de reserva de forma amigable (número consecutivo)
 * @example 1 -> "1", 123 -> "123"
 */
export function formatReservationId(id: number): string {
  return id.toString();
}

/**
 * Formatea un número como moneda en formato mexicano
 * @example 1530 -> "$1,530.00"
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea el mensaje de días hábiles restantes
 * @example 1 -> "Queda 1 día hábil"
 * @example 4 -> "Quedan 4 días hábiles"
 * @example 0 -> "Quedan 0 días hábiles"
 */
export function formatBusinessDaysMessage(days: number | null): string {
  if (days === null) return "";
  const daysValue = Math.max(0, days); // Asegurar que no sea negativo
  if (daysValue === 1) {
    return "Queda 1 día hábil";
  }
  return `Quedan ${daysValue} días hábiles`;
}
