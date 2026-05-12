"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import {
  formatCurrency,
  formatDisplayDateShort,
  formatTimeRange,
} from "@/utils/formatters";

type PaymentStatus = "pending" | "paid";

interface ManualPaymentRow {
  id: number;
  date: string | null;
  start_time: string | null;
  name: string;
  email: string;
  phone: string | null;
  price: number;
  status: string;
  payment_status: PaymentStatus | null;
  payment_method: string | null;
  payment_validated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type RangePreset = "30" | "90" | "all";

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "all", label: "Histórico completo" },
];

const STATUS_FILTERS: { value: PaymentStatus; label: string }[] = [
  { value: "pending", label: "Pendientes" },
  { value: "paid", label: "Validados" },
];

const FETCH_LIMIT = 100;

function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m === "efectivo") return "Efectivo";
  if (m === "transferencia") return "Transferencia";
  if (m === "conekta") return "Conekta";
  if (m === "pendiente") return "Por definir";
  return method;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
  } catch {
    return "—";
  }
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "";
    return format(d, "d MMM yyyy · HH:mm", { locale: es });
  } catch {
    return "";
  }
}

/**
 * Marca como amber un pago pendiente cuya antigüedad ya pasó cierto umbral
 * (3 días por default). Útil para que el admin priorice los más viejos.
 */
function isStale(iso: string | null, days = 3): boolean {
  if (!iso) return false;
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() > days * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function AdminManualPaymentsPage() {
  const [rows, setRows] = useState<ManualPaymentRow[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [paidInWindow, setPaidInWindow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangePreset>("30");
  const [activeStatuses, setActiveStatuses] = useState<PaymentStatus[]>([
    "pending",
  ]);
  // `null` = aún no sabemos el rol (evita flicker de "Solo super admin"
  // durante los ~ms iniciales que tarda /api/admin/me en responder).
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [busyRowId, setBusyRowId] = useState<number | null>(null);
  const [rowFeedback, setRowFeedback] = useState<
    Record<number, { type: "ok" | "error"; message: string }>
  >({});
  // Banner top-level para mostrar el resultado de la última validación
  // cuando la fila desaparece de la vista actual (caso típico: filtro
  // "Pendientes" + éxito → la fila pasa a 'paid' y se va).
  const [topMessage, setTopMessage] = useState<
    { type: "ok" | "error"; message: string } | null
  >(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const topMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (topMessageTimerRef.current) {
        clearTimeout(topMessageTimerRef.current);
        topMessageTimerRef.current = null;
      }
    };
  }, []);

  const flashTopMessage = useCallback(
    (msg: { type: "ok" | "error"; message: string }) => {
      if (topMessageTimerRef.current) {
        clearTimeout(topMessageTimerRef.current);
      }
      setTopMessage(msg);
      topMessageTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setTopMessage(null);
        topMessageTimerRef.current = null;
      }, 5000);
    },
    [],
  );

  useEffect(() => {
    axios
      .get("/api/admin/me")
      .then((res) => {
        if (!mountedRef.current) return;
        const allowed =
          res.data?.success === true && res.data?.isSuperAdmin === true;
        setIsSuperAdmin(allowed);
      })
      .catch(() => {
        if (mountedRef.current) setIsSuperAdmin(false);
      });
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", activeStatuses.join(","));
    if (range === "all") params.set("all", "1");
    else params.set("days", range);
    params.set("limit", String(FETCH_LIMIT));
    return params.toString();
  }, [range, activeStatuses]);

  const fetchRows = useCallback(
    async (signal?: AbortSignal) => {
      const reqId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(
          `/api/admin/manual-payments?${queryString}`,
          { signal },
        );
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        if (!res.data?.success) {
          setError(res.data?.error || "Error al cargar pagos manuales");
          return;
        }
        const incoming = (res.data.rows ?? []) as ManualPaymentRow[];
        setRows(incoming);
        setPendingTotal(Number(res.data.pendingTotal ?? 0));
        setPaidInWindow(Number(res.data.paidInWindow ?? 0));
        // Limpia feedback de filas que ya no están en la vista.
        setRowFeedback((prev) => {
          const visibleIds = new Set(incoming.map((r) => r.id));
          let changed = false;
          const next: typeof prev = {};
          for (const [idStr, value] of Object.entries(prev)) {
            const idNum = Number(idStr);
            if (visibleIds.has(idNum)) next[idNum] = value;
            else changed = true;
          }
          return changed ? next : prev;
        });
      } catch (err) {
        if (axios.isCancel(err) || (err as Error)?.name === "CanceledError") {
          return;
        }
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        setError(
          axios.isAxiosError(err)
            ? (err.response?.data?.error as string) ||
                "Error de conexión al cargar pagos manuales"
            : "Error inesperado al cargar pagos manuales",
        );
      } finally {
        if (mountedRef.current && reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [queryString],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchRows(controller.signal);
    return () => controller.abort();
  }, [fetchRows]);

  const toggleStatus = (status: PaymentStatus) => {
    setActiveStatuses((prev) => {
      if (prev.includes(status)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== status);
      }
      return [...prev, status];
    });
  };

  const handleValidate = async (row: ManualPaymentRow) => {
    if (isSuperAdmin !== true) return;
    if (busyRowId !== null) return;
    setBusyRowId(row.id);
    setRowFeedback((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    try {
      const res = await axios.patch(
        `/api/admin/reservations/${row.id}/payment-status`,
      );
      if (!mountedRef.current) return;
      const data = res.data ?? {};
      if (!data.success) {
        const errMsg = data.error || "Error al validar el pago";
        setRowFeedback((prev) => ({
          ...prev,
          [row.id]: { type: "error", message: errMsg },
        }));
        flashTopMessage({
          type: "error",
          message: `#${row.id}: ${errMsg}`,
        });
        return;
      }
      // El feedback inline se borrará al refrescar si la fila pasa a
      // estar fuera del filtro; por eso emitimos también un banner
      // top-level para que el admin tenga confirmación visible.
      setRowFeedback((prev) => ({
        ...prev,
        [row.id]: { type: "ok", message: "Pago validado correctamente." },
      }));
      flashTopMessage({
        type: "ok",
        message: `Pago de #${row.id} (${row.name?.trim() || "cliente"}) validado correctamente.`,
      });
      if (mountedRef.current) await fetchRows();
    } catch (err) {
      if (!mountedRef.current) return;
      const errMsg = axios.isAxiosError(err)
        ? (err.response?.data?.error as string) || "Error de conexión"
        : "Error inesperado";
      setRowFeedback((prev) => ({
        ...prev,
        [row.id]: { type: "error", message: errMsg },
      }));
      flashTopMessage({
        type: "error",
        message: `#${row.id}: ${errMsg}`,
      });
    } finally {
      if (mountedRef.current) setBusyRowId(null);
    }
  };

  const totalsByStatus = useMemo(() => {
    const acc = { pending: 0, paid: 0 };
    for (const r of rows) {
      if (r.payment_status === "pending") acc.pending += 1;
      else if (r.payment_status === "paid") acc.paid += 1;
    }
    return acc;
  }, [rows]);

  const orderHint = useMemo(() => {
    const onlyP =
      activeStatuses.length === 1 && activeStatuses[0] === "pending";
    const onlyPd =
      activeStatuses.length === 1 && activeStatuses[0] === "paid";
    if (onlyP) return "Pendientes más antiguos primero (prioridad de validación).";
    if (onlyPd) return "Validados más recientes primero (por fecha de validación).";
    return "Ordenado por actividad reciente (registro o validación).";
  }, [activeStatuses]);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Pagos manuales
        </h1>
        <p className="mt-1 text-zinc-600">
          Reservas creadas desde el panel (efectivo / transferencia / otro)
          que requieren validación de pago.{" "}
          {isSuperAdmin === false && (
            <span className="text-zinc-500">
              Solo la super administradora puede marcar como pagado.
            </span>
          )}
        </p>
      </div>

      {topMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`sticky top-2 z-10 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm ${
            topMessage.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <span>{topMessage.message}</span>
          <button
            type="button"
            onClick={() => {
              if (topMessageTimerRef.current) {
                clearTimeout(topMessageTimerRef.current);
                topMessageTimerRef.current = null;
              }
              setTopMessage(null);
            }}
            className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
            aria-label="Cerrar"
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Pendientes (global)
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              pendingTotal > 0 ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {pendingTotal}
          </p>
          <p className="text-xs text-zinc-400">
            Igual que la tarjeta del dashboard (sin ventana de fechas).
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Pendientes</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">
            {totalsByStatus.pending}
          </p>
          <p className="text-xs text-zinc-400">
            En la tabla (máx. {FETCH_LIMIT} filas cargadas).
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            Validados en ventana
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {paidInWindow}
          </p>
          <p className="text-xs text-zinc-400">
            {range === "all" ? "histórico" : `últimos ${range} días`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-600">Rango:</span>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                range === opt.value
                  ? "bg-[#103948] text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-600">Estado:</span>
          {STATUS_FILTERS.map((opt) => {
            const active = activeStatuses.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatus(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#103948] text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-semibold text-[#103948]">
              {rows.length} resultado{rows.length === 1 ? "" : "s"}
            </h2>
            <p className="text-xs text-zinc-500">{orderHint}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchRows()}
            disabled={loading}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Refrescar"}
          </button>
        </div>

        {error && (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-5"
          >
            {error}
          </div>
        )}

        {!loading && rows.length >= FETCH_LIMIT && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-5">
            Se alcanzó el límite de {FETCH_LIMIT} resultados. Ajusta los
            filtros (estado o rango) para ver el resto.
          </div>
        )}

        <div className="overflow-x-auto">
          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-500">
              No hay pagos manuales con los filtros seleccionados.
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Reserva
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Cita
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Método
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right sm:px-5"
                  >
                    Monto
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Antigüedad
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-5">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const feedback = rowFeedback[row.id];
                  const stale =
                    row.payment_status === "pending" && isStale(row.created_at);
                  return (
                    <tr key={row.id} className="align-top hover:bg-zinc-50">
                      <td className="px-4 py-3 sm:px-5">
                        <Link
                          href={`/reservaciones/${row.id}`}
                          prefetch={false}
                          className="font-medium text-[#103948] hover:underline"
                        >
                          #{row.id}
                        </Link>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {row.status === "cancelled"
                            ? "Cancelada"
                            : row.status === "completed"
                              ? "Completada"
                              : "Confirmada"}
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <div className="font-medium text-zinc-900">
                          {row.name?.trim() || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {row.email || "—"}
                        </div>
                        {row.phone && (
                          <div className="mt-0.5 text-xs text-zinc-400">
                            {row.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        {row.date ? (
                          <>
                            <div>{formatDisplayDateShort(row.date)}</div>
                            {row.start_time && (
                              <div className="text-xs text-zinc-500">
                                {formatTimeRange(
                                  row.start_time,
                                  undefined,
                                  row.date,
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        {paymentMethodLabel(row.payment_method)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-900 sm:px-5">
                        {formatCurrency(Number(row.price ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        <div
                          className={
                            stale ? "font-medium text-amber-700" : ""
                          }
                          title={formatAbsolute(row.created_at)}
                        >
                          {formatRelative(row.created_at)}
                        </div>
                        {row.payment_status === "paid" &&
                          row.payment_validated_at && (
                            <div
                              className="mt-0.5 text-xs text-emerald-700"
                              title={formatAbsolute(row.payment_validated_at)}
                            >
                              Validado{" "}
                              {formatRelative(row.payment_validated_at)}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        {row.payment_status === "paid" ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                            Validado
                          </span>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              stale
                                ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                                : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                            }`}
                          >
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        {row.payment_status === "pending" ? (
                          isSuperAdmin === true ? (
                            <button
                              type="button"
                              onClick={() => void handleValidate(row)}
                              disabled={busyRowId !== null}
                              className="rounded-lg bg-[#103948] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0c2c38] disabled:opacity-50"
                            >
                              {busyRowId === row.id
                                ? "Validando…"
                                : "Marcar pagado"}
                            </button>
                          ) : isSuperAdmin === false ? (
                            <span className="text-xs text-zinc-400">
                              Solo super admin
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-300">…</span>
                          )
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                        {feedback && (
                          <div
                            role="status"
                            aria-live="polite"
                            className={`mt-1 text-xs ${
                              feedback.type === "ok"
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {feedback.message}
                          </div>
                        )}
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
