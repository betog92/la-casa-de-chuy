import {
  format,
  parse,
  addHours,
  addMinutes,
  addDays,
} from "date-fns";
import { es } from "date-fns/locale";
import { formatInTimeZone, toDate } from "date-fns-tz";

/** Zona horaria del negocio para mostrar horas de reserva de forma consistente. */
export const APP_TIMEZONE = "America/Monterrey";

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Ancla solo para horas “sueltas” (sin fecha de reserva); Monterrey sin DST en esta fecha. */
const TIME_ANCHOR_FALLBACK_DATE = "2000-06-15";

/** Minutos de interior y jardín en una reserva estándar (checkout / confirmación). */
const DEFAULT_INTERIOR_MINUTES = 45;
const DEFAULT_EXTERIOR_MINUTES = 15;

function resolveCalendarDate(calendarDate?: string | null): string {
  if (calendarDate && CALENDAR_DATE_RE.test(calendarDate)) {
    return calendarDate;
  }
  return TIME_ANCHOR_FALLBACK_DATE;
}

/**
 * Interpreta HH:mm[:ss] como reloj en Monterrey en la fecha calendario (yyyy-MM-dd)
 * y devuelve el instante UTC equivalente.
 */
function monterreyWallInstant(
  time: string,
  calendarDate: string
): Date | null {
  const trimmed = time.trim();
  const parts = trimmed.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  const s = parts.length >= 3 ? Math.trunc(Number(parts[2])) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) {
    return null;
  }
  const hh = String(Math.trunc(h)).padStart(2, "0");
  const mm = String(Math.trunc(m)).padStart(2, "0");
  const ss = String(Math.max(0, Math.min(59, s))).padStart(2, "0");
  const isoLocal = `${calendarDate}T${hh}:${mm}:${ss}`;
  try {
    const d = toDate(isoLocal, { timeZone: APP_TIMEZONE });
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function formatMonterreyClock(d: Date): string {
  return formatInTimeZone(d, APP_TIMEZONE, "h:mm a", {
    locale: es,
  }).toLowerCase();
}

/** Inicio del día calendario 00:00 en Monterrey (yyyy-MM-dd). */
function startOfCalendarDayMonterrey(dateString: string): Date | null {
  if (!CALENDAR_DATE_RE.test(dateString)) return null;
  try {
    const d = toDate(`${dateString}T00:00:00`, { timeZone: APP_TIMEZONE });
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Hora en formato 12h (es) interpretada en **America/Monterrey** el día `calendarDate` (yyyy-MM-dd).
 */
export function formatDisplayTimeInMonterrey(
  time: string,
  calendarDate?: string | null
): string {
  try {
    const day = resolveCalendarDate(calendarDate);
    const inst = monterreyWallInstant(time, day);
    if (!inst) return time.trim();
    return formatMonterreyClock(inst);
  } catch {
    return time.trim();
  }
}

/**
 * Rangos legibles (12h, locale es) para interior + jardín a partir de la hora de inicio.
 * Acepta "HH:mm" o "HH:mm:ss". Las horas se interpretan en **America/Monterrey** el día `calendarDate`
 * (yyyy-MM-dd); si no se pasa, se usa una ancla fija solo para el reloj.
 */
export type SpaceUsageRanges = {
  total: string;
  interior: string;
  garden: string;
  totalMinutes: number;
  interiorMinutes: number;
  exteriorMinutes: number;
};

export function formatSpaceUsageRanges(
  startTime: string,
  interiorMinutes = DEFAULT_INTERIOR_MINUTES,
  exteriorMinutes = DEFAULT_EXTERIOR_MINUTES,
  calendarDate?: string | null
): SpaceUsageRanges {
  try {
    const day = resolveCalendarDate(calendarDate);
    const start = monterreyWallInstant(startTime, day);
    if (!start) {
      throw new Error("Invalid time");
    }

    const interiorEnd = addMinutes(start, interiorMinutes);
    const exteriorEnd = addMinutes(interiorEnd, exteriorMinutes);

    const fmt = (d: Date) => formatMonterreyClock(d);

    return {
      total: `${fmt(start)} - ${fmt(exteriorEnd)}`,
      interior: `${fmt(start)} - ${fmt(interiorEnd)}`,
      garden: `${fmt(interiorEnd)} - ${fmt(exteriorEnd)}`,
      totalMinutes: interiorMinutes + exteriorMinutes,
      interiorMinutes,
      exteriorMinutes,
    };
  } catch {
    return {
      total: startTime,
      interior: "—",
      garden: "—",
      totalMinutes: interiorMinutes + exteriorMinutes,
      interiorMinutes,
      exteriorMinutes,
    };
  }
}

/**
 * Formatea una fecha en formato legible en español (con día de la semana).
 * El día calendario se interpreta en **America/Monterrey**.
 * @example "2025-12-27" -> "Sábado, 27 de diciembre de 2025"
 */
export function formatDisplayDate(dateString: string): string {
  try {
    const d = startOfCalendarDayMonterrey(dateString);
    if (!d) return dateString;
    const formatted = formatInTimeZone(
      d,
      APP_TIMEZONE,
      "EEEE, d 'de' MMMM 'de' yyyy",
      { locale: es }
    );
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return dateString;
  }
}

/**
 * Formatea una fecha en formato corto (sin día de la semana). Para listados.
 * El día calendario se interpreta en **America/Monterrey**.
 * @example "2025-12-27" -> "27 de diciembre de 2025"
 */
export function formatDisplayDateShort(dateString: string): string {
  try {
    const d = startOfCalendarDayMonterrey(dateString);
    if (!d) return dateString;
    return formatInTimeZone(d, APP_TIMEZONE, "d 'de' MMMM 'de' yyyy", {
      locale: es,
    });
  } catch {
    return dateString;
  }
}

/**
 * Formatea un rango de hora en **America/Monterrey**.
 * Si se pasa endTime, lo interpreta el mismo día `calendarDate` salvo que quede antes que start (entonces día siguiente).
 * Si no hay endTime, suma 1 hora al inicio.
 * @param calendarDate Fecha de la reserva (yyyy-MM-dd). Si falta, ancla fija solo para interpretar el reloj.
 */
export function formatTimeRange(
  startTime: string,
  endTime?: string | null,
  calendarDate?: string | null
): string {
  try {
    const day = resolveCalendarDate(calendarDate);
    const start = monterreyWallInstant(startTime, day);
    if (!start) {
      return startTime;
    }

    let end: Date;
    if (endTime) {
      const endParsed = monterreyWallInstant(endTime, day);
      if (!endParsed) {
        return startTime;
      }
      if (endParsed.getTime() < start.getTime()) {
        const base = parse(day, "yyyy-MM-dd", new Date());
        const nextStr = format(addDays(base, 1), "yyyy-MM-dd");
        const endAlt = monterreyWallInstant(endTime, nextStr);
        end = endAlt ?? endParsed;
      } else {
        end = endParsed;
      }
      // Datos raros (fin antes que inicio aún tras día siguiente): evitar rango invertido
      if (end.getTime() < start.getTime()) {
        end = addHours(start, 1);
      }
    } else {
      end = addHours(start, 1);
    }

    return `${formatMonterreyClock(start)} - ${formatMonterreyClock(end)}`;
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
