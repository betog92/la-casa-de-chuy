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

type RefundStatus = "pending" | "failed" | "processed" | "cancelled";

interface RefundReservation {
  id: number;
  name: string | null;
  email: string | null;
  date: string | null;
  start_time: string | null;
  status: string | null;
  refund_status: string | null;
  refund_amount: number | null;
  refund_id: string | null;
}

interface RefundRow {
  id: string;
  reservation_id: number;
  payment_id: string;
  charge_id: string | null;
  charge_kind: "initial" | "additional";
  amount_mxn: number;
  status: RefundStatus;
  refund_id: string | null;
  attempts: number;
  last_error_message: string | null;
  last_error_at: string | null;
  next_retry_at: string;
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  reservation: RefundReservation | null;
}

const STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "Pendiente",
  failed: "Fallido",
  processed: "Procesado",
  cancelled: "Cancelado",
};

const STATUS_PILL: Record<RefundStatus, string> = {
  pending: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  failed: "bg-red-50 text-red-800 ring-1 ring-red-200",
  processed: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
};

type RangePreset = "30" | "90" | "all";

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "all", label: "Histórico completo" },
];

const FETCH_LIMIT = 100;

const STATUS_FILTERS: { value: RefundStatus; label: string }[] = [
  { value: "pending", label: "Pendientes" },
  { value: "failed", label: "Fallidos" },
  { value: "processed", label: "Procesados" },
  { value: "cancelled", label: "Cancelados" },
];

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

/**
 * Devuelve el texto + bandera `overdue` para una fecha. Útil cuando
 * representa un "próximo evento" pero la fecha ya pasó (admin debería
 * leerlo como "atrasado", no como "hace X tiempo").
 */
function formatNextRetry(
  iso: string | null,
): { text: string; overdue: boolean } {
  if (!iso) return { text: "—", overdue: false };
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return { text: "—", overdue: false };
    const overdue = d.getTime() < Date.now();
    const relative = formatDistanceToNow(d, { addSuffix: !overdue, locale: es });
    return {
      text: overdue ? `atrasado ${relative}` : relative,
      overdue,
    };
  } catch {
    return { text: "—", overdue: false };
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

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangePreset>("30");
  const [activeStatuses, setActiveStatuses] = useState<RefundStatus[]>([
    "pending",
    "failed",
  ]);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<
    Record<string, { type: "ok" | "error"; message: string }>
  >({});
  // Tracker para descartar respuestas obsoletas si el admin cambia filtros
  // antes de que el fetch previo responda.
  const requestIdRef = useRef(0);
  // mountedRef: evita setState tras unmount en `handleRetry` (que no usa
  // AbortSignal porque su fetchRefunds final no recibe uno). Reseteamos
  // a `true` en el setup además del init de useRef porque React Strict
  // Mode en desarrollo monta-desmonta-monta cada componente, dejando
  // `mountedRef.current = false` tras el primer cleanup y haciendo que
  // todos los clicks subsiguientes parecieran inertes.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", activeStatuses.join(","));
    if (range === "all") params.set("all", "1");
    else params.set("days", range);
    params.set("limit", String(FETCH_LIMIT));
    return params.toString();
  }, [range, activeStatuses]);

  const fetchRefunds = useCallback(
    async (signal?: AbortSignal) => {
      const reqId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/admin/refunds?${queryString}`, {
          signal,
        });
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        if (!res.data?.success) {
          setError(res.data?.error || "Error al cargar reembolsos");
          return;
        }
        const incoming = (res.data.refunds ?? []) as RefundRow[];
        setRefunds(incoming);
        // Limpia feedback de filas que ya no aparecen en el listado
        // (acumular indefinidamente sería un leak en sesiones largas).
        setRowFeedback((prev) => {
          const visibleIds = new Set(incoming.map((r) => r.id));
          let changed = false;
          const next: typeof prev = {};
          for (const [id, value] of Object.entries(prev)) {
            if (visibleIds.has(id)) next[id] = value;
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
                "Error de conexión al cargar reembolsos"
            : "Error inesperado al cargar reembolsos",
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
    void fetchRefunds(controller.signal);
    return () => controller.abort();
  }, [fetchRefunds]);

  const toggleStatus = (status: RefundStatus) => {
    setActiveStatuses((prev) => {
      if (prev.includes(status)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== status);
      }
      return [...prev, status];
    });
  };

  const handleRetry = async (row: RefundRow) => {
    if (busyRowId) return;
    setBusyRowId(row.id);
    setRowFeedback((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    try {
      const res = await axios.post(
        `/api/admin/reservations/${row.reservation_id}/refund/retry`,
      );
      if (!mountedRef.current) return;
      const data = res.data ?? {};
      if (!data.success) {
        setRowFeedback((prev) => ({
          ...prev,
          [row.id]: {
            type: "error",
            message: data.error || "Error al procesar el reembolso",
          },
        }));
        return;
      }
      const processed = Number(data.processed ?? 0);
      const pending = Number(data.pending ?? 0);
      const failed = Number(data.failed ?? 0);
      const reset = Number(data.reset ?? 0);
      const forced = Number(data.forced ?? 0);
      const acciones: string[] = [];
      if (reset > 0) acciones.push(`${reset} reabierto(s)`);
      if (forced > 0) acciones.push(`${forced} forzado(s)`);
      const summary =
        acciones.length > 0
          ? `${acciones.join(", ")}. Resultado: ${processed} procesado(s), ${pending} pendiente(s), ${failed} fallido(s).`
          : (data.message as string) || "Sin filas para procesar.";
      setRowFeedback((prev) => ({
        ...prev,
        [row.id]: { type: "ok", message: summary },
      }));
      if (mountedRef.current) await fetchRefunds();
    } catch (err) {
      if (!mountedRef.current) return;
      setRowFeedback((prev) => ({
        ...prev,
        [row.id]: {
          type: "error",
          message: axios.isAxiosError(err)
            ? (err.response?.data?.error as string) || "Error de conexión"
            : "Error inesperado",
        },
      }));
    } finally {
      if (mountedRef.current) setBusyRowId(null);
    }
  };

  const totalsByStatus = useMemo(() => {
    const acc = { pending: 0, failed: 0, processed: 0, cancelled: 0 };
    for (const r of refunds) acc[r.status] += 1;
    return acc;
  }, [refunds]);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Reembolsos
        </h1>
        <p className="mt-1 text-zinc-600">
          Filas de <code>reservation_refunds</code> con su reserva asociada.
          Acciona individualmente para procesar pendientes o reintentar
          fallidos sin esperar al cron.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Pendientes</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">
            {totalsByStatus.pending}
          </p>
          <p className="text-xs text-zinc-400">en vista actual</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Fallidos</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {totalsByStatus.failed}
          </p>
          <p className="text-xs text-zinc-400">en vista actual</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Procesados</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {totalsByStatus.processed}
          </p>
          <p className="text-xs text-zinc-400">en vista actual</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Cancelados</p>
          <p className="mt-1 text-2xl font-bold text-zinc-600">
            {totalsByStatus.cancelled}
          </p>
          <p className="text-xs text-zinc-400">en vista actual</p>
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
              {refunds.length} resultado{refunds.length === 1 ? "" : "s"}
            </h2>
            <p className="text-xs text-zinc-500">
              Ordenado por última actualización (recientes primero).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchRefunds()}
            disabled={loading}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Refrescar"}
          </button>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-5">
            {error}
          </div>
        )}

        {!loading && refunds.length >= FETCH_LIMIT && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-5">
            Se alcanzó el límite de {FETCH_LIMIT} resultados. Ajusta los
            filtros (estado o rango) para ver el resto.
          </div>
        )}

        <div className="overflow-x-auto">
          {loading && refunds.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
            </div>
          ) : refunds.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-500">
              No hay reembolsos con los filtros seleccionados.
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 sm:px-5">Reserva</th>
                  <th className="px-4 py-3 sm:px-5">Cliente</th>
                  <th className="px-4 py-3 sm:px-5">Cita</th>
                  <th className="px-4 py-3 text-right sm:px-5">Monto</th>
                  <th className="px-4 py-3 sm:px-5">Estado</th>
                  <th className="px-4 py-3 sm:px-5">Intentos</th>
                  <th className="px-4 py-3 sm:px-5">Próximo intento</th>
                  <th className="px-4 py-3 sm:px-5">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {refunds.map((row) => {
                  const resv = row.reservation;
                  const feedback = rowFeedback[row.id];
                  const canRetry =
                    row.status === "pending" || row.status === "failed";
                  return (
                    <tr key={row.id} className="align-top hover:bg-zinc-50">
                      <td className="px-4 py-3 sm:px-5">
                        <Link
                          href={`/reservaciones/${row.reservation_id}`}
                          className="font-medium text-[#103948] hover:underline"
                        >
                          #{row.reservation_id}
                        </Link>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {row.charge_kind === "initial"
                            ? "Pago inicial"
                            : "Pago adicional"}
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <div className="font-medium text-zinc-900">
                          {resv?.name?.trim() || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {resv?.email || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        {resv?.date ? (
                          <>
                            <div>{formatDisplayDateShort(resv.date)}</div>
                            {resv.start_time && (
                              <div className="text-xs text-zinc-500">
                                {formatTimeRange(
                                  resv.start_time,
                                  undefined,
                                  resv.date,
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-900 sm:px-5">
                        {formatCurrency(row.amount_mxn)}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[row.status]}`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                        {row.last_error_message && (
                          <div
                            className="mt-1 max-w-xs truncate text-xs text-red-600"
                            title={row.last_error_message}
                          >
                            {row.last_error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        {row.attempts}
                        {row.last_error_at && (
                          <div
                            className="text-xs text-zinc-500"
                            title={formatAbsolute(row.last_error_at)}
                          >
                            último: {formatRelative(row.last_error_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 sm:px-5">
                        {row.status === "pending" ? (() => {
                          const next = formatNextRetry(row.next_retry_at);
                          return (
                            <>
                              <div
                                className={
                                  next.overdue
                                    ? "font-medium text-amber-700"
                                    : ""
                                }
                              >
                                {next.text}
                              </div>
                              <div
                                className="text-xs text-zinc-500"
                                title={formatAbsolute(row.next_retry_at)}
                              >
                                {formatAbsolute(row.next_retry_at)}
                              </div>
                            </>
                          );
                        })() : row.status === "processed" && row.processed_at ? (
                          <div className="text-zinc-500">
                            Procesado {formatRelative(row.processed_at)}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        {canRetry ? (
                          <button
                            type="button"
                            onClick={() => void handleRetry(row)}
                            disabled={busyRowId !== null}
                            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {busyRowId === row.id
                              ? "Procesando…"
                              : row.status === "failed"
                                ? "Reintentar"
                                : "Procesar ahora"}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                        {feedback && (
                          <div
                            role="status"
                            aria-live="polite"
                            className={`mt-1 max-w-xs text-xs ${
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
