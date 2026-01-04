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
 * Formatea un ID de reserva de forma amigable (primeros 4 caracteres)
 * @example "7e6126fe-251a-4087-843e-72c8af5f3671" -> "7E61"
 */
export function formatReservationId(id: string): string {
  return id.slice(0, 4).toUpperCase();
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



