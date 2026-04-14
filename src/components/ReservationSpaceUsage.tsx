"use client";

import { formatSpaceUsageRanges } from "@/utils/formatters";

type Variant = "confirm" | "checkout" | "detail";

type Props = {
  startTime: string;
  /** Fecha de la reserva (yyyy-MM-dd); mejora la interpretación en Monterrey */
  calendarDate?: string | null;
  variant: Variant;
  /** Texto más pequeño en checkout (drawer móvil / sidebar) */
  compact?: boolean;
};

export function ReservationSpaceUsage({
  startTime,
  calendarDate,
  variant,
  compact = false,
}: Props) {
  const u = formatSpaceUsageRanges(
    startTime,
    undefined,
    undefined,
    calendarDate
  );

  const timeline = (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-200"
      role="img"
      aria-label={`Distribución del tiempo: ${u.interiorMinutes} minutos interior, ${u.exteriorMinutes} minutos jardín`}
    >
      <div
        className="h-full min-w-0 bg-zinc-600"
        style={{ flex: u.interiorMinutes }}
        aria-hidden
      />
      <div
        className="h-full min-w-0 bg-emerald-600"
        style={{ flex: u.exteriorMinutes }}
        aria-hidden
      />
    </div>
  );

  const rowText = compact ? "text-xs" : "text-sm";
  const chipClass =
    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums";

  const rows = (
    <ul
      className={`mt-3 list-none space-y-2.5 p-0 ${rowText} text-zinc-800`}
      aria-label="Desglose de tiempo en interior y jardín"
    >
      <li className="flex justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-zinc-700">
          <span aria-hidden>⏱</span>
          <span className="font-medium">Interior</span>
          <span
            className={`${chipClass} bg-zinc-200 text-zinc-800 ring-1 ring-zinc-300/90`}
          >
            {u.interiorMinutes} min
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums text-zinc-800">
          {u.interior}
        </span>
      </li>
      <li className="flex justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-zinc-700">
          <span aria-hidden>🌿</span>
          <span className="font-medium">Jardín</span>
          <span
            className={`${chipClass} bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80`}
          >
            {u.exteriorMinutes} min
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums text-zinc-800">
          {u.garden}
        </span>
      </li>
    </ul>
  );

  if (variant === "confirm") {
    return (
      <div className="mb-3">
        <div className="mb-3 flex justify-between gap-3">
          <span className="font-medium text-zinc-900">Horario</span>
          <div className="text-right">
            <span className="tabular-nums text-zinc-800">{u.total}</span>
            <span
              className={`ml-2 ${chipClass} bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/80`}
            >
              {u.totalMinutes} min
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 sm:p-3.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Cómo usamos el espacio
          </p>
          {timeline}
          {rows}
        </div>
      </div>
    );
  }

  if (variant === "checkout") {
    const pad = compact ? "p-3" : "p-3.5";
    const titleSize = compact ? "text-[11px]" : "text-xs";
    const totalSize = compact ? "text-sm" : "text-base";

    return (
      <div
        className={`rounded-lg border border-zinc-200 bg-zinc-50/90 ${pad} ring-1 ring-zinc-100/80`}
      >
        <p
          className={`${titleSize} mb-2 font-semibold uppercase tracking-wide text-zinc-500`}
        >
          Horario de tu sesión
        </p>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <span
            className={`font-semibold tabular-nums text-zinc-900 ${totalSize}`}
          >
            {u.total}
          </span>
          <span
            className={`${chipClass} bg-white text-zinc-600 ring-1 ring-zinc-200`}
          >
            {u.totalMinutes} min totales
          </span>
        </div>
        {timeline}
        {rows}
      </div>
    );
  }

  // detail (invitado / cuenta)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-lg font-medium tabular-nums text-[#103948]">
          {u.total}
        </p>
        <span
          className={`${chipClass} bg-[#103948]/10 text-[#103948] ring-1 ring-[#103948]/15`}
        >
          {u.totalMinutes} min
        </span>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 sm:p-3.5">
        <p className="mb-2 text-xs font-medium text-zinc-600">
          Interior y jardín
        </p>
        {timeline}
        {rows}
      </div>
    </div>
  );
}
