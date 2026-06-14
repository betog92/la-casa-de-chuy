import type { CSSProperties } from "react";

/** Colores de eventos del calendario (leyenda, calendario y tablas usan la misma fuente). */
export const CALENDAR_COLORS = {
  reservation: "#103948",
  reservationOldWeb: "#0e7490",
  reservationManual: "#b91c1c",
  stampCard: "#059669",
  alveroReservation: "#6d28d9",
  alveroSpace: "#b45309",
  vestidos: "#0ea5e9",
} as const;

export type CalendarColorKey = keyof typeof CALENDAR_COLORS;

export type ReservationColorInput = {
  source?: string | null;
  import_type?: string | null;
  stamp_card_code?: string | null;
  isVestidos?: boolean;
};

export type TableLegendItem = {
  key: CalendarColorKey;
  label: string;
  color: string;
};

const TABLE_LEGEND_ITEMS: TableLegendItem[] = [
  { key: "reservation", label: "Reservación web", color: CALENDAR_COLORS.reservation },
  {
    key: "reservationOldWeb",
    label: "Reservación (página web vieja)",
    color: CALENDAR_COLORS.reservationOldWeb,
  },
  {
    key: "reservationManual",
    label: "Reservación manual",
    color: CALENDAR_COLORS.reservationManual,
  },
  {
    key: "stampCard",
    label: "Sesión regalo (tarjetero)",
    color: CALENDAR_COLORS.stampCard,
  },
  {
    key: "alveroReservation",
    label: "Reservación de Alvero",
    color: CALENDAR_COLORS.alveroReservation,
  },
];

const NATIVE_TABLE_LEGEND_KEYS: CalendarColorKey[] = [
  "reservation",
  "reservationManual",
  "stampCard",
  "alveroReservation",
];

const FULL_TABLE_LEGEND_KEYS: CalendarColorKey[] = [
  "reservation",
  "reservationOldWeb",
  "reservationManual",
  "stampCard",
  "alveroReservation",
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function getReservationCalendarColor(input: ReservationColorInput): string {
  if (input.isVestidos) return CALENDAR_COLORS.vestidos;
  const source = input.source;
  const importType = input.import_type;
  if (input.stamp_card_code?.trim()) return CALENDAR_COLORS.stampCard;
  if (source === "google_import" || source === "admin") {
    if (importType === "appointly") return CALENDAR_COLORS.reservationOldWeb;
    if (importType === "manual_client") return CALENDAR_COLORS.alveroReservation;
    if (importType === "manual_available") return CALENDAR_COLORS.alveroSpace;
    if (importType === "manual_other") return CALENDAR_COLORS.reservationManual;
    if (source === "admin" && !importType) return CALENDAR_COLORS.reservationManual;
    return source === "admin"
      ? CALENDAR_COLORS.reservation
      : CALENDAR_COLORS.reservationOldWeb;
  }
  return CALENDAR_COLORS.reservation;
}

/** Compatibilidad con eventos de react-big-calendar. */
export function getEventColor(event: {
  resource?: ReservationColorInput;
}): string {
  return getReservationCalendarColor(event.resource ?? {});
}

export function getReservationTypeLabel(
  input: ReservationColorInput,
  options?: { includeStampCode?: boolean },
): string {
  if (input.isVestidos) return "Renta de vestidos";

  const stampCode = input.stamp_card_code?.trim();
  if (stampCode) {
    if (options?.includeStampCode !== false) {
      return `Sesión regalo tarjetero (${stampCode})`;
    }
    return "Sesión regalo (tarjetero)";
  }

  const importType = input.import_type;
  const source = input.source;
  if (importType === "manual_available") return "Bloqueo de agenda (Alvero)";
  if (importType === "manual_client") return "Reservación de Alvero";
  if (importType === "appointly") return "Reservación (página web vieja)";
  if (importType === "manual_other") return "Reservación manual";
  if (source === "admin" && !importType) return "Reservación manual";
  if (source === "google_import") return "Importada";
  if (source === "web") return "Reservación web";
  if (source === "admin") return "Reservación";
  return "Reservación";
}

/** Etiqueta corta para la columna ID (sin depender solo del color). */
export function getReservationTypeAbbrev(input: ReservationColorInput): string {
  if (input.stamp_card_code?.trim()) return "Regalo";
  if (input.import_type === "manual_client") return "Alvero";
  if (input.import_type === "appointly") return "Web vieja";
  if (input.import_type === "manual_other") return "Manual";
  if (input.source === "admin" && !input.import_type) return "Manual";
  if (input.source === "google_import") return "Importada";
  if (input.source === "web") return "Web";
  return "Web";
}

export function getAdminReservationTotalDisplay(
  input: ReservationColorInput,
  status: string,
  formattedPrice: string,
): { label: string; className: string } {
  if (input.stamp_card_code?.trim()) {
    return {
      label: "Regalo",
      className: status === "cancelled" ? "text-zinc-500" : "text-emerald-700",
    };
  }
  if (status === "cancelled") {
    return { label: formattedPrice, className: "text-zinc-500" };
  }
  if (status === "completed") {
    return { label: formattedPrice, className: "text-zinc-700" };
  }
  return { label: formattedPrice, className: "text-green-700" };
}

export function getTableLegendItems(scope: "native" | "full" = "full"): TableLegendItem[] {
  const keys = scope === "native" ? NATIVE_TABLE_LEGEND_KEYS : FULL_TABLE_LEGEND_KEYS;
  return TABLE_LEGEND_ITEMS.filter((item) => keys.includes(item.key));
}

export type ReservationRowAccent = {
  className: string;
  style: CSSProperties;
};

export function getReservationRowAccent(
  input: ReservationColorInput,
): ReservationRowAccent {
  const color = getReservationCalendarColor(input);
  const bg = hexWithAlpha(color, 0.1);
  const bgHover = hexWithAlpha(color, 0.16);

  return {
    className:
      "border-l-4 transition-colors hover:[background-color:var(--reservation-row-hover)]",
    style: {
      borderLeftColor: color,
      backgroundColor: bg,
      ["--reservation-row-hover" as string]: bgHover,
    },
  };
}

export type ReservationRowPresentation = ReservationRowAccent & {
  typeLabel: string;
  rowLabel: string;
};

/** Agrupa color, tooltip y estilos de fila en una sola llamada por reserva. */
export function getReservationRowPresentation(
  input: ReservationColorInput,
  options?: {
    statusLabel?: string;
    includeStampCode?: boolean;
  },
): ReservationRowPresentation {
  const typeLabel = getReservationTypeLabel(input, {
    includeStampCode: options?.includeStampCode,
  });
  const accent = getReservationRowAccent(input);
  const rowLabel = options?.statusLabel
    ? `${typeLabel} · ${options.statusLabel}`
    : typeLabel;

  return {
    ...accent,
    typeLabel,
    rowLabel,
  };
}
