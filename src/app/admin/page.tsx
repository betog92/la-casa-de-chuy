"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { AdminTablePagination } from "@/components/admin/AdminTablePagination";
import {
  AdminReservationMobileCard,
  buildReservationRowMeta,
  ReservationStatusBadge,
} from "@/components/admin/AdminReservationMobileCard";
import { ReservationColorLegend } from "@/components/admin/ReservationColorLegend";
import { ReservationTypeChip } from "@/components/admin/ReservationTypeChip";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  formatDisplayDateShort,
  formatTimeRange,
  formatCurrency,
  formatDisplayDateTimeCompact,
} from "@/utils/formatters";

interface RecentReservation {
  id: number;
  date: string;
  start_time: string;
  name: string;
  email: string;
  price: number;
  status: string;
  created_at: string | null;
  reschedule_count?: number;
  source?: string | null;
  import_type?: string | null;
  stamp_card_code?: string | null;
}

interface RevenueBreakdown {
  web: number;
  manual: number;
  total: number;
  webCount: number;
  manualCount: number;
}

interface Stats {
  today: {
    revenue: RevenueBreakdown;
    alveroSessions: number;
  };
  week: {
    revenue: RevenueBreakdown;
    alveroSessions: number;
  };
  pendingManualPayments: number;
  pendingManualPaymentsAmount: number;
}

function dashboardMoney(amount: number): string {
  return `$${formatCurrency(amount)}`;
}

function breakdownAmount(amount: number): string {
  if (amount <= 0) return "—";
  return dashboardMoney(amount);
}

function breakdownCountSuffix(count: number): string {
  if (count <= 0) return "";
  return ` (${count})`;
}

function MetricTooltip({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-200 text-[10px] font-semibold leading-none text-zinc-400 hover:border-zinc-300 hover:text-zinc-500"
    >
      ?
    </span>
  );
}

function SectionHeading({
  title,
  subtitle,
  tooltip,
}: {
  title: string;
  subtitle?: string;
  tooltip?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold text-[#103948]">{title}</h2>
        {tooltip ? <MetricTooltip text={tooltip} /> : null}
      </div>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

function PeriodLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="min-h-[2.25rem]">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{hint ?? "\u00A0"}</p>
    </div>
  );
}

function RevenueBreakdownInline({ revenue }: { revenue: RevenueBreakdown }) {
  const webHref = "/admin/reservaciones?source=web&status=confirmed";
  const manualHref =
    "/admin/reservaciones?source=admin&paymentStatus=paid&status=confirmed";

  return (
    <p className="mt-2 text-sm text-zinc-500">
      <Link
        href={webHref}
        className="transition-colors hover:text-[#103948] hover:underline"
      >
        Web{" "}
        <span
          className={`tabular-nums ${
            revenue.web > 0 ? "text-zinc-700" : "text-zinc-300"
          }`}
        >
          {breakdownAmount(revenue.web)}
          {revenue.webCount > 0 ? (
            <span className="text-zinc-400">
              {breakdownCountSuffix(revenue.webCount)}
            </span>
          ) : null}
        </span>
      </Link>
      <span className="mx-1.5 text-zinc-300">·</span>
      <Link
        href={manualHref}
        className="transition-colors hover:text-[#103948] hover:underline"
      >
        Manual{" "}
        <span
          className={`tabular-nums ${
            revenue.manual > 0 ? "text-zinc-700" : "text-zinc-300"
          }`}
        >
          {breakdownAmount(revenue.manual)}
          {revenue.manualCount > 0 ? (
            <span className="text-zinc-400">
              {breakdownCountSuffix(revenue.manualCount)}
            </span>
          ) : null}
        </span>
      </Link>
    </p>
  );
}

function RevenuePeriodColumn({
  label,
  hint,
  revenue,
}: {
  label: string;
  hint?: string;
  revenue: RevenueBreakdown;
}) {
  return (
    <div className="flex h-full flex-col">
      <PeriodLabel label={label} hint={hint} />
      <p className="mt-2 text-3xl font-bold text-green-700 tabular-nums">
        {dashboardMoney(revenue.total)}
      </p>
      <RevenueBreakdownInline revenue={revenue} />
    </div>
  );
}

function alveroCountLabel(count: number): string {
  return `${count} ${count === 1 ? "cita" : "citas"}`;
}

function AlveroPeriodColumn({
  label,
  hint,
  count,
}: {
  label: string;
  hint?: string;
  count: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <PeriodLabel label={label} hint={hint} />
      <p className="mt-2 text-3xl font-bold text-[#103948] tabular-nums">
        {count}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{alveroCountLabel(count)}</p>
    </div>
  );
}

function AlveroPanel({
  todayCount,
  weekCount,
}: {
  todayCount: number;
  weekCount: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 border-l-4 border-l-violet-300 bg-white p-5 shadow-sm">
      <div className="grid gap-6 sm:grid-cols-2">
        <AlveroPeriodColumn
          label="Hoy"
          hint="Registradas hoy"
          count={todayCount}
        />
        <div className="sm:border-l sm:border-zinc-100 sm:pl-6">
          <AlveroPeriodColumn
            label="Última semana"
            hint="Últimos 7 días"
            count={weekCount}
          />
        </div>
      </div>
    </div>
  );
}

function RevenuePanel({
  today,
  week,
  pendingManualPayments,
  pendingManualPaymentsAmount,
}: {
  today: { revenue: RevenueBreakdown };
  week: { revenue: RevenueBreakdown };
  pendingManualPayments: number;
  pendingManualPaymentsAmount: number;
}) {
  const pending = pendingManualPayments ?? 0;
  const pendingAmount = pendingManualPaymentsAmount ?? 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-6 sm:grid-cols-2">
        <RevenuePeriodColumn
          label="Hoy"
          hint="Registradas hoy"
          revenue={today.revenue}
        />
        <div className="sm:border-l sm:border-zinc-100 sm:pl-6">
          <RevenuePeriodColumn
            label="Última semana"
            hint="Últimos 7 días"
            revenue={week.revenue}
          />
        </div>
      </div>

      {pending > 0 && (
        <Link
          href="/admin/pagos-manuales"
          className="mt-4 flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm transition-colors hover:bg-amber-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-amber-900">
            {pending} {pending === 1 ? "pago manual" : "pagos manuales"} por
            validar
            {pendingAmount > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="font-semibold tabular-nums">
                  {dashboardMoney(pendingAmount)}
                </span>{" "}
                <span className="text-amber-700">por cobrar</span>
              </>
            ) : null}
            <span className="text-amber-700"> (no incluidos arriba)</span>
          </span>
          <span className="shrink-0 font-medium text-amber-900">Ver lista →</span>
        </Link>
      )}
    </div>
  );
}

const RECENT_PAGE_SIZE = 25;

function formatRegisteredAt(iso: string | null): { relative: string; full: string } {
  if (!iso) return { relative: "—", full: "" };
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return { relative: "—", full: "" };
    return {
      relative: formatDistanceToNow(d, { addSuffix: true, locale: es }),
      full: formatDisplayDateTimeCompact(iso) ?? "",
    };
  } catch {
    return { relative: "—", full: "" };
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentReservations, setRecentReservations] = useState<RecentReservation[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentOffset, setRecentOffset] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const recentTableRef = useRef<HTMLDivElement>(null);
  const skipRecentScrollRef = useRef(true);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await axios.get("/api/admin/stats");
        if (res.data.success) {
          setStats({
            today: res.data.today,
            week: res.data.week,
            pendingManualPayments: res.data.pendingManualPayments ?? 0,
            pendingManualPaymentsAmount:
              res.data.pendingManualPaymentsAmount ?? 0,
          });
        } else {
          setError(res.data.error || "Error al cargar estadísticas");
        }
      } catch (err) {
        setError(
          axios.isAxiosError(err)
            ? (err.response?.data?.error as string) || "Error al cargar"
            : "Error al cargar estadísticas",
        );
      } finally {
        setStatsLoading(false);
      }
    };

    void fetchStats();
  }, []);

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const params = new URLSearchParams({
        origin: "native",
        sort: "recent",
        limit: String(RECENT_PAGE_SIZE),
        offset: String(recentOffset),
      });
      const res = await axios.get(`/api/admin/reservations?${params}`);
      if (res.data.success) {
        setRecentReservations(res.data.reservations ?? []);
        setRecentTotal(res.data.total ?? 0);
      }
    } catch {
      setRecentReservations([]);
      setRecentTotal(0);
    } finally {
      setRecentLoading(false);
    }
  }, [recentOffset]);

  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  useEffect(() => {
    if (skipRecentScrollRef.current) {
      skipRecentScrollRef.current = false;
      return;
    }
    recentTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [recentOffset]);

  useEffect(() => {
    if (recentTotal <= 0) {
      if (recentOffset !== 0) setRecentOffset(0);
      return;
    }
    const maxOffset = Math.max(
      0,
      (Math.ceil(recentTotal / RECENT_PAGE_SIZE) - 1) * RECENT_PAGE_SIZE,
    );
    if (recentOffset > maxOffset) setRecentOffset(maxOffset);
  }, [recentTotal, recentOffset]);

  const loading = statsLoading;
  const recentTableBusy = recentLoading && recentReservations.length > 0;

  const recentRows = useMemo(
    () =>
      recentReservations.map((r) => {
        const formattedPrice = formatCurrency(r.price);
        return {
          reservation: r,
          formattedPrice,
          meta: buildReservationRowMeta(r, formattedPrice),
          registeredAt: formatRegisteredAt(r.created_at),
        };
      }),
    [recentReservations],
  );

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Panel de administración
        </h1>
        <p className="mt-1 text-zinc-600">Ingresos y últimas reservas.</p>
      </div>

      <section className="space-y-4">
        <SectionHeading
          title="Ingresos · La Casa de Chuy"
          subtitle="Web y manuales cobrados · por fecha de registro"
          tooltip="Ventas confirmadas de la página web y manuales ya cobradas. No incluye Alvero ni pagos manuales pendientes."
        />
        <RevenuePanel
          today={{ revenue: s.today.revenue }}
          week={{ revenue: s.week.revenue }}
          pendingManualPayments={s.pendingManualPayments}
          pendingManualPaymentsAmount={s.pendingManualPaymentsAmount ?? 0}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeading
            title="Alvero"
            subtitle="Estudio aparte · solo conteo de citas, sin ingresos"
            tooltip="Citas tipo Alvero registradas en el panel. Negocio independiente de La Casa de Chuy."
          />
          <Link
            href="/admin/reservaciones?importType=manual_client&status=confirmed"
            className="shrink-0 text-sm font-medium text-[#103948] hover:underline"
          >
            Ver citas →
          </Link>
        </div>
        <AlveroPanel
          todayCount={s.today.alveroSessions}
          weekCount={s.week.alveroSessions}
        />
      </section>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-lg font-semibold text-[#103948]">
              Reservas recientes
              {recentTotal > 0 ? (
                <span className="ml-1.5 font-normal text-zinc-500">({recentTotal})</span>
              ) : null}
            </h2>
          </div>
          <Link
            href="/admin/reservaciones"
            className="shrink-0 text-sm font-medium text-[#103948] hover:underline"
          >
            Ver todas →
          </Link>
        </div>

        {recentReservations.length > 0 ? (
          <div className="border-b border-zinc-100 px-4 py-3 sm:px-5">
            <ReservationColorLegend scope="native" />
          </div>
        ) : null}

        <div ref={recentTableRef} className="relative scroll-mt-4">
        <div
          className={`transition-opacity ${recentTableBusy ? "pointer-events-none opacity-50" : ""}`}
          aria-busy={recentLoading}
        >
          {recentLoading && recentReservations.length === 0 ? (
            <div className="flex justify-center px-5 py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
            </div>
          ) : recentReservations.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-500">
              No hay reservas nativas recientes. Las citas importadas están en{" "}
              <Link href="/admin/reservaciones?origin=imported" className="font-medium text-[#103948] hover:underline">
                Reservaciones → Importadas
              </Link>
              .
            </div>
          ) : (
            <>
            <ul className="md:hidden">
              {recentRows.map(({ reservation, formattedPrice, meta, registeredAt }) => (
                <AdminReservationMobileCard
                  key={reservation.id}
                  reservation={reservation}
                  formattedPrice={formattedPrice}
                  meta={meta}
                  variant="dashboard"
                  registeredAt={registeredAt}
                  onOpen={() => router.push(`/reservaciones/${reservation.id}`)}
                />
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="w-[14%] px-4 py-3 sm:px-5">Reserva</th>
                  <th className="w-[18%] px-4 py-3 sm:px-5">Registro</th>
                  <th className="w-[26%] px-4 py-3 sm:px-5">Cliente</th>
                  <th className="w-[24%] px-4 py-3 sm:px-5">Cita</th>
                  <th className="w-[10%] px-4 py-3 text-right sm:px-5">Total</th>
                  <th className="w-[14%] px-4 py-3 sm:px-5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentRows.map(({ reservation: r, meta, registeredAt }) => {
                  const { colorInput, row, total } = meta;

                  return (
                    <tr
                      key={r.id}
                      className={`cursor-pointer ${row.className}`}
                      style={row.style}
                      title={row.rowLabel}
                      aria-label={`Reserva #${r.id}: ${row.rowLabel}`}
                      onClick={() => router.push(`/reservaciones/${r.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/reservaciones/${r.id}`);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 sm:px-5">
                        <span className="inline-flex items-center">
                          #{r.id}
                          <ReservationTypeChip input={colorInput} />
                        </span>
                      </td>
                      <td className="overflow-hidden px-4 py-3 text-zinc-700 sm:px-5">
                        <span className="block">{registeredAt.relative}</span>
                        {registeredAt.full ? (
                          <span className="text-xs text-zinc-400">{registeredAt.full}</span>
                        ) : null}
                      </td>
                      <td className="overflow-hidden px-4 py-3 sm:px-5">
                        <span className="block truncate font-medium text-zinc-900">
                          {r.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                          {r.email}
                        </span>
                      </td>
                      <td className="overflow-hidden px-4 py-3 text-zinc-700 sm:px-5">
                        <span className="block leading-snug">
                          {formatDisplayDateShort(r.date)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {formatTimeRange(r.start_time, undefined, r.date)}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-medium sm:px-5 ${total.className}`}
                      >
                        {total.label}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <ReservationStatusBadge reservation={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>
        {recentTableBusy ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60"
            aria-hidden
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
          </div>
        ) : null}
        </div>
        <AdminTablePagination
          offset={recentOffset}
          pageSize={RECENT_PAGE_SIZE}
          total={recentTotal}
          loading={recentLoading}
          onOffsetChange={setRecentOffset}
        />
      </div>
    </div>
  );
}
