import { format } from "date-fns";
import { es } from "date-fns/locale";

export type DayModalEventResource = {
  isVestidos?: boolean;
  source?: string;
  import_type?: string | null;
  stamp_card_code?: string | null;
};

export type DayModalEventLike = {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: DayModalEventResource;
};

const LEADING_TIME_RE = /^\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\s*-\s*/i;

/** Quita el prefijo de hora que la API antepone al título del calendario. */
export function stripLeadingTimeFromTitle(title: string): string {
  return title.replace(LEADING_TIME_RE, "").trim() || title;
}

export function formatDayModalTimeRange(
  start: Date,
  _end: Date,
  allDay?: boolean,
): string {
  if (allDay) return "Todo el día";
  return format(start, "h:mm a", { locale: es });
}

export function getDayModalTypeLabel(ev: DayModalEventLike): string {
  if (ev.resource?.isVestidos) return "Renta de vestidos";
  const importType = ev.resource?.import_type;
  const source = ev.resource?.source;
  if (importType === "manual_available") return "Bloqueo de agenda (Alvero)";
  if (importType === "manual_client") return "Reservación de Alvero";
  if (importType === "appointly") return "Reservación (página web vieja)";
  if (importType === "manual_other") return "Reservación manual";
  if (source === "admin" && !importType) {
    const code = ev.resource?.stamp_card_code?.trim();
    if (code) return `Sesión regalo tarjetero (${code})`;
    return "Reservación manual";
  }
  if (source === "google_import") return "Importada";
  if (source === "admin") return "Reservación";
  return "Reservación";
}

export function getDayModalPrimaryLabel(ev: DayModalEventLike): string {
  if (ev.resource?.isVestidos) {
    return ev.title.trim() || "Renta de vestido";
  }
  return stripLeadingTimeFromTitle(ev.title);
}
