"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { formatCurrency, formatDisplayDateShort } from "@/utils/formatters";

type LoyaltyLevel = "Elite" | "VIP" | "Frecuente" | "Inicial";

interface CustomerSummary {
  userId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  hasAccount: boolean;
  isPhotographer: boolean;
  studioName: string | null;
  createdAt: string | null;
  reservationCount: number;
  totalSpent: number;
  lastReservationDate: string | null;
  loyaltyLevel: LoyaltyLevel;
  loyaltyPoints: number;
  credits: number;
  receivedSessionsCount: number;
}

interface Stats {
  totalCustomers: number;
  totalPhotographers: number;
  totalSpent: number;
}

type TypeFilter = "all" | "customer" | "photographer";
type SortField =
  | "spent"
  | "reservations"
  | "recent"
  | "name"
  | "level"
  | "points"
  | "credits";

const PAGE_SIZE = 25;

const levelStyles: Record<LoyaltyLevel, string> = {
  Elite: "bg-amber-100 text-amber-800 border-amber-300",
  VIP: "bg-purple-100 text-purple-800 border-purple-300",
  Frecuente: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Inicial: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

const formatPhoneShort = (phone: string | null): string => {
  if (!phone) return "—";
  const cleaned = phone.replace(/\s|-|\(|\)/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
  }
  return phone;
};

export default function AdminClientesPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortField>("spent");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get("/api/admin/customers", {
          params: {
            search: debouncedSearch,
            type,
            sort,
            direction,
            limit: PAGE_SIZE,
            offset,
          },
        });
        if (res.data?.success) {
          setCustomers(res.data.customers || []);
          setStats(res.data.stats || null);
          setTotal(res.data.total || 0);
        } else {
          setError(res.data?.error || "Error al cargar clientes");
        }
      } catch (err) {
        setError(
          axios.isAxiosError(err)
            ? (err.response?.data?.error as string) || "Error al cargar"
            : "Error al cargar clientes"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [debouncedSearch, type, sort, direction, offset]);

  const handleSortClick = (field: SortField) => {
    if (sort === field) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      // Para "name" preferimos ascendente; el resto descendente por default
      setDirection(field === "name" ? "asc" : "desc");
    }
    setOffset(0);
  };

  const sortIndicator = (field: SortField) =>
    sort === field ? (direction === "asc" ? " ▲" : " ▼") : "";

  const handleRowClick = (c: CustomerSummary) => {
    if (c.userId) {
      router.push(`/admin/clientes/${c.userId}`);
    } else {
      // Invitado: redirigir a búsqueda en reservaciones por email
      router.push(
        `/admin/reservaciones?search=${encodeURIComponent(c.email)}`
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const totalSpentFmt = useMemo(
    () => (stats ? formatCurrency(stats.totalSpent) : "—"),
    [stats]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Clientes y fotógrafos
        </h1>
        <p className="mt-1 text-zinc-600">
          Quién ha reservado, qué beneficios tiene y a dónde han ido a parar.
        </p>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Clientes registrados
          </p>
          <p className="mt-1 text-3xl font-bold text-[#103948]">
            {stats?.totalCustomers ?? "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Personas que han reservado o tienen cuenta
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Fotógrafos</p>
          <p className="mt-1 text-3xl font-bold text-amber-700">
            {stats?.totalPhotographers ?? "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Cuentas marcadas como fotógrafo o estudio
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Total facturado (histórico)
          </p>
          <p className="mt-1 text-3xl font-bold text-green-700">
            {totalSpentFmt}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Suma de reservas confirmadas y completadas
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email, teléfono o estudio…"
              className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
            />
            <div className="flex gap-1 rounded-lg border border-zinc-300 bg-white p-1">
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "customer", label: "Clientes" },
                  { id: "photographer", label: "Fotógrafos" },
                ] as { id: TypeFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setType(opt.id);
                    setOffset(0);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    type === opt.id
                      ? "bg-[#103948] text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm text-zinc-500">
            {loading ? "Cargando…" : `${total} resultado${total === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr className="text-left text-zinc-600">
              <th
                className="cursor-pointer select-none px-4 py-3 font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("name")}
              >
                Cliente{sortIndicator("name")}
              </th>
              <th className="px-4 py-3 font-semibold">Contacto</th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("reservations")}
              >
                Reservas{sortIndicator("reservations")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("spent")}
              >
                Total gastado{sortIndicator("spent")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("level")}
              >
                Nivel{sortIndicator("level")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("points")}
                title="Monedas Chuy disponibles (1 Moneda = $1 MXN)"
              >
                Monedas{sortIndicator("points")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("credits")}
              >
                Créditos{sortIndicator("credits")}
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-semibold hover:text-[#103948]"
                onClick={() => handleSortClick("recent")}
              >
                Última visita{sortIndicator("recent")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {error ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-red-600"
                >
                  {error}
                </td>
              </tr>
            ) : loading && customers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-zinc-500"
                >
                  No se encontraron clientes con los filtros actuales
                </td>
              </tr>
            ) : (
              customers.map((c, idx) => {
                const displayName =
                  c.name?.trim() ||
                  c.studioName?.trim() ||
                  c.email.split("@")[0];
                return (
                  <tr
                    key={`${c.userId || "guest"}-${c.email}`}
                    onClick={() => handleRowClick(c)}
                    className={`cursor-pointer transition-colors ${
                      idx % 2 === 1 ? "bg-zinc-50" : "bg-white"
                    } hover:bg-[#103948]/5`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900">
                            {displayName}
                          </span>
                          {c.isPhotographer && (
                            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Fotógrafo
                            </span>
                          )}
                          {!c.hasAccount && (
                            <span
                              title="Cliente invitado, sin cuenta registrada"
                              className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
                            >
                              Invitado
                            </span>
                          )}
                        </div>
                        {c.studioName && c.isPhotographer && c.name && (
                          <span className="text-xs text-zinc-500">
                            {c.studioName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      <div className="flex flex-col">
                        <span className="text-sm">{c.email}</span>
                        <span className="text-xs text-zinc-500">
                          {formatPhoneShort(c.phone)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-900">
                      {c.reservationCount}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">
                      {formatCurrency(c.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          levelStyles[c.loyaltyLevel]
                        }`}
                      >
                        {c.loyaltyLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700">
                      {c.hasAccount ? (
                        c.loyaltyPoints > 0 ? (
                          <span className="font-medium text-[#103948]">
                            {c.loyaltyPoints}
                          </span>
                        ) : (
                          <span className="text-zinc-400">0</span>
                        )
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700">
                      {c.hasAccount ? (
                        c.credits > 0 ? (
                          <span className="font-medium text-[#103948]">
                            {formatCurrency(c.credits)}
                          </span>
                        ) : (
                          <span className="text-zinc-400">$0</span>
                        )
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700">
                      {c.lastReservationDate
                        ? formatDisplayDateShort(c.lastReservationDate)
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-zinc-600">
            Página {currentPage} de {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() =>
                setOffset(
                  Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE)
                )
              }
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
