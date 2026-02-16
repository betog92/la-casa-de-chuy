"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  formatDisplayDate,
  formatTimeRange,
  formatCurrency,
} from "@/utils/formatters";

interface Stats {
  today: {
    totalReservations: number;
    confirmedReservations: number;
    cancelledReservations: number;
    completedReservations: number;
    revenue: number;
  };
  weekRevenue: number;
  upcoming: Array<{
    id: number;
    date: string;
    start_time: string;
    name: string;
    email: string;
    price: number;
    status: string;
  }>;
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
            : "Error al cargar estadísticas"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
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
          Resumen de reservas y actividad
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Confirmadas hoy
          </p>
          <p className="mt-1 text-2xl font-bold text-[#103948]">
            {s.today.confirmedReservations}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Ingresos hoy
          </p>
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
          <p className="text-sm font-medium text-zinc-500">
            Canceladas hoy
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {s.today.cancelledReservations}
          </p>
        </div>
      </div>

      {/* Próximas reservas */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#103948]">
            Próximas reservas
          </h2>
          <Link
            href="/admin/reservaciones"
            className="text-sm font-medium text-[#103948] hover:underline"
          >
            Ver todas
          </Link>
        </div>
        <div className="divide-y divide-zinc-100">
          {s.upcoming.length === 0 ? (
            <div className="px-5 py-8 text-center text-zinc-500">
              No hay reservas próximas
            </div>
          ) : (
            s.upcoming.map((r, index) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/reservaciones/${r.id}`)}
                className={`flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left transition-colors ${index % 2 === 1 ? "bg-zinc-100" : "bg-white"} hover:bg-zinc-200`}
              >
                <div>
                  <p className="font-medium text-zinc-900">
                    #{r.id} · {r.name}
                  </p>
                  <p className="text-sm text-zinc-500">{r.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-zinc-900">
                    {formatDisplayDate(r.date)} · {formatTimeRange(r.start_time)}
                  </p>
                  <p className="text-sm text-green-700">
                    {formatCurrency(r.price)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
