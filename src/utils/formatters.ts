import { format, parse, addHours } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatea una fecha en formato legible en español (con día de la semana).
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
 * Formatea una fecha en formato corto (sin día de la semana). Para listados.
 * @example "2025-12-27" -> "27 de diciembre de 2025"
 */
export function formatDisplayDateShort(dateString: string): string {
  try {
    const date = parse(dateString, "yyyy-MM-dd", new Date());
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
  } catch {
    return dateString;
  }
}

/**
 * Formatea un rango de hora.
 * Si se pasa endTime, lo usa directamente. Si no, suma 1 hora al start_time.
 * @example ("18:30") -> "6:30 pm - 7:30 pm"
 * @example ("17:45", "19:15") -> "5:45 pm - 7:15 pm"
 */
export function formatTimeRange(startTime: string, endTime?: string | null): string {
  try {
    const [hours, minutes] = startTime.split(":").slice(0, 2).map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);

    let endDate: Date;
    if (endTime) {
      const [endHours, endMinutes] = endTime.split(":").slice(0, 2).map(Number);
      endDate = new Date();
      endDate.setHours(endHours, endMinutes, 0, 0);
    } else {
      endDate = addHours(startDate, 1);
    }

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
