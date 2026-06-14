import { ReservationTypeChip } from "@/components/admin/ReservationTypeChip";
import {
  getAdminReservationTotalDisplay,
  getReservationRowPresentation,
  type ReservationColorInput,
} from "@/lib/admin/reservation-calendar-colors";
import {
  formatDisplayDateCompact,
  formatTimeRange,
} from "@/utils/formatters";
import {
  getReservationStatusColor,
  getReservationStatusLabel,
} from "@/utils/reservation-status-display";

export type AdminReservationRowData = {
  id: number;
  date: string;
  start_time: string;
  name: string;
  email: string;
  price: number;
  status: string;
  reschedule_count?: number;
  payment_status?: "pending" | "paid" | "not_applicable" | null;
  payment_method?: string | null;
  payment_id?: string | null;
  source?: string | null;
  import_type?: string | null;
  stamp_card_code?: string | null;
  order_number?: string | null;
  google_event_id?: string | null;
};

export type AdminReservationRegisteredAt = {
  relative: string;
  full: string;
};

type AdminReservationMobileCardProps = {
  reservation: AdminReservationRowData;
  formattedPrice: string;
  onOpen: () => void;
  meta?: ReturnType<typeof buildReservationRowMeta>;
  /** list = reservaciones (fecha + pago); dashboard = registro + cita */
  variant?: "list" | "dashboard";
  registeredAt?: AdminReservationRegisteredAt;
};

export function buildReservationRowMeta(
  reservation: AdminReservationRowData,
  formattedPrice: string,
) {
  const colorInput: ReservationColorInput = {
    source: reservation.source,
    import_type: reservation.import_type,
    stamp_card_code: reservation.stamp_card_code,
  };
  const row = getReservationRowPresentation(colorInput, {
    statusLabel: getReservationStatusLabel(reservation.status, {
      rescheduleCount: reservation.reschedule_count,
      sessionDate: reservation.date,
    }),
  });
  const total = getAdminReservationTotalDisplay(
    colorInput,
    reservation.status,
    formattedPrice,
  );
  return { colorInput, row, total };
}

export function getReservationDisplayId(r: AdminReservationRowData): string {
  if (r.source === "google_import" && r.order_number?.trim()) {
    return r.order_number.trim();
  }
  return String(r.id);
}

export function ReservationPaymentBadge({
  reservation: r,
  hideWhenEmpty = false,
}: {
  reservation: AdminReservationRowData;
  hideWhenEmpty?: boolean;
}) {
  if (r.payment_status === "pending") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Pago pendiente
      </span>
    );
  }
  if (
    r.payment_status === "paid" ||
    (r.source === "web" && (r.payment_method === "conekta" || r.payment_id))
  ) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        Pagado
      </span>
    );
  }
  if (hideWhenEmpty) return null;
  return <span className="text-xs text-zinc-400">—</span>;
}

export function ReservationStatusBadge({
  reservation: r,
}: {
  reservation: AdminReservationRowData;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getReservationStatusColor(
        r.status,
        {
          rescheduleCount: r.reschedule_count,
          sessionDate: r.date,
        },
      )}`}
    >
      {getReservationStatusLabel(r.status, {
        rescheduleCount: r.reschedule_count,
        sessionDate: r.date,
      })}
    </span>
  );
}

function CardFieldLabel({ children }: { children: string }) {
  return (
    <span className="text-xs font-medium text-zinc-400">{children}</span>
  );
}

function CardSessionLine({ reservation: r }: { reservation: AdminReservationRowData }) {
  return (
    <>
      {formatDisplayDateCompact(r.date)}
      <span className="text-zinc-400"> · </span>
      {formatTimeRange(r.start_time, undefined, r.date)}
    </>
  );
}

export function AdminReservationMobileCard({
  reservation: r,
  formattedPrice,
  onOpen,
  meta,
  variant = "list",
  registeredAt,
}: AdminReservationMobileCardProps) {
  const { colorInput, row, total } =
    meta ?? buildReservationRowMeta(r, formattedPrice);
  const displayId = getReservationDisplayId(r);
  const isDashboard = variant === "dashboard";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={row.rowLabel}
        aria-label={`Reserva #${displayId}: ${row.rowLabel}`}
        className={`w-full touch-manipulation border-b border-zinc-100 px-4 py-3 text-left transition-colors active:[background-color:var(--reservation-row-hover)] sm:px-5 ${row.className}`}
        style={row.style}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-sm font-semibold text-zinc-900">
            #{displayId}
            <ReservationTypeChip input={colorInput} />
            {r.order_number?.trim() &&
              r.source !== "google_import" &&
              r.order_number.trim() !== String(r.id) && (
                <span className="text-xs font-normal text-zinc-500">
                  #{r.order_number.trim()}
                </span>
              )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span className={`text-sm font-semibold ${total.className}`}>
              {total.label}
            </span>
            <span className="text-base leading-none text-zinc-300" aria-hidden>
              ›
            </span>
          </span>
        </div>

        {isDashboard && registeredAt ? (
          <div className="mt-1.5">
            <p className="text-sm text-zinc-700">
              <CardFieldLabel>Registro</CardFieldLabel>
              <span className="text-zinc-400"> · </span>
              {registeredAt.relative}
            </p>
            {registeredAt.full ? (
              <p className="mt-0.5 text-xs text-zinc-400">{registeredAt.full}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-zinc-700">
            <CardFieldLabel>Cita</CardFieldLabel>
            <span className="text-zinc-400"> · </span>
            <CardSessionLine reservation={r} />
          </p>
        )}

        <p className="mt-1 font-medium text-zinc-900">{r.name}</p>
        <p className="truncate text-xs text-zinc-500">{r.email}</p>

        {isDashboard ? (
          <p className="mt-1.5 text-sm text-zinc-700">
            <CardFieldLabel>Cita</CardFieldLabel>
            <span className="text-zinc-400"> · </span>
            <CardSessionLine reservation={r} />
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ReservationStatusBadge reservation={r} />
          {!isDashboard ? (
            <ReservationPaymentBadge reservation={r} hideWhenEmpty />
          ) : null}
        </div>
      </button>
    </li>
  );
}
