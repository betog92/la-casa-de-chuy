"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  formatDisplayDate,
  formatTimeRange,
  formatCurrency,
} from "@/utils/formatters";

interface RecentReservation {
  id: number;
  date: string;
  start_time: string;
  name: string;
  email: string;
  price: number;
  status: string;
  payment_status: string | null;
  created_at: string | null;
}

interface Stats {
  today: {
    totalReservations: number;
    confirmedReservations: number;
    cancelledReservations: number;
    completedReservations: number;
    revenue: number;
  };
  weekRevenue: number;
  recentReservations: RecentReservation[];
}

function reservationStatusLabel(status: string): string {
  switch (status) {
    case "confirmed":
      return "Confirmada";
    case "completed":
      return "Completada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function paymentStatusLabel(p: string | null): string {
  switch (p) {
    case "paid":
      return "Pagado";
    case "pending":
      return "Pendiente";
    case "not_applicable":
      return "N/A";
    default:
      return p ?? "—";
  }
}

function reservationStatusPillClass(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "completed":
      return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    case "cancelled":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
  }
}

function paymentPillClass(p: string | null): string {
  switch (p) {
    case "paid":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    default:
      return "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200";
  }
}

function formatRegisteredAt(iso: string | null): { relative: string; full: string } {
  if (!iso) return { relative: "—", full: "" };
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return { relative: "—", full: "" };
    return {
      relative: formatDistanceToNow(d, { addSuffix: true, locale: es }),
      full: format(d, "d MMM yyyy · HH:mm", { locale: es }),
    };
  } catch {
    return { relative: "—", full: "" };
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get("/api/admin/stats");
        if (res.data.success) {
          setStats(res.data);
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
        setLoading(false);
      }
    };

    void fetchStats();
  }, []);

  if (loading) {
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
        <p className="mt-1 text-zinc-600">
          Resumen de ventas y últimas reservas registradas (orden cronológico).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Confirmadas hoy</p>
          <p className="mt-1 text-2xl font-bold text-[#103948]">
            {s.today.confirmedReservations}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Ingresos hoy</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatCurrency(s.today.revenue)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Ingresos última semana
          </p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatCurrency(s.weekRevenue)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Canceladas hoy</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {s.today.cancelledReservations}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-lg font-semibold text-[#103948]">
              Reservas recientes
            </h2>
            <p className="text-sm text-zinc-500">
              Las últimas altas en el sistema, como un listado de pedidos.
            </p>
          </div>
          <Link
            href="/admin/reservaciones"
            className="shrink-0 text-sm font-medium text-[#103948] hover:underline"
          >
            Ver todas
          </Link>
        </div>

        <div className="overflow-x-auto">
          {s.recentReservations.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-500">
              No hay reservas recientes para mostrar (con fecha de registro).
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 sm:px-5">Reserva</th>
                  <th className="px-4 py-3 sm:px-5">Registro</th>
                  <th className="px-4 py-3 sm:px-5">Cliente</th>
                  <th className="px-4 py-3 sm:px-5">Cita</th>
                  <th className="px-4 py-3 text-right sm:px-5">Total</th>
                  <th className="px-4 py-3 sm:px-5">Estado</th>
                  <th className="px-4 py-3 sm:px-5">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {s.recentReservations.map((r) => {
                  const reg = formatRegisteredAt(r.created_at);
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer transition-colors hover:bg-zinc-50"
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
                        #{r.id}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        <span className="block">{reg.relative}</span>
                        {reg.full ? (
                          <span className="text-xs text-zinc-400">{reg.full}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <span className="font-medium text-zinc-900">
                          {r.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {r.email}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        <span className="block">
                          {formatDisplayDate(r.date)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {formatTimeRange(r.start_time, undefined, r.date)}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-medium sm:px-5 ${
                          r.status === "cancelled"
                            ? "text-zinc-500"
                            : "text-green-700"
                        }`}
                      >
                        {formatCurrency(r.price)}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${reservationStatusPillClass(r.status)}`}
                        >
                          {reservationStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentPillClass(r.payment_status)}`}
                        >
                          {paymentStatusLabel(r.payment_status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
