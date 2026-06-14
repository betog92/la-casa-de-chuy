import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getReservationTypeLabel } from "@/lib/admin/reservation-calendar-colors";

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
  return getReservationTypeLabel(
    {
      isVestidos: ev.resource?.isVestidos,
      source: ev.resource?.source,
      import_type: ev.resource?.import_type,
      stamp_card_code: ev.resource?.stamp_card_code,
    },
    { includeStampCode: true },
  );
}

export function getDayModalPrimaryLabel(ev: DayModalEventLike): string {
  if (ev.resource?.isVestidos) {
    return ev.title.trim() || "Renta de vestido";
  }
  return stripLeadingTimeFromTitle(ev.title);
}
