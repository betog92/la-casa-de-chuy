"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { parse } from "date-fns";
import {
  formatCurrency,
  formatDisplayDate,
  formatDisplayTimeInMonterrey,
} from "@/utils/formatters";
import {
  PRICES,
  calculatePrice,
  getDayType,
  isHoliday,
} from "@/utils/pricing";

export interface DayAvailability {
  id: string;
  date: string;
  is_closed: boolean;
  is_holiday: boolean;
  custom_price: number | null;
}

export interface DaySlot {
  id: string;
  start_time: string;
  end_time: string;
  available: boolean;
  is_occupied: boolean;
  reservation: { id: number; name: string } | null;
}

export interface DayDetail {
  date: string;
  availability: DayAvailability | null;
  slots: DaySlot[];
}

interface Props {
  date: string;
  detail: DayDetail | null;
  loading: boolean;
  /** Notifica al padre que se modificó algo y debe refrescar el día y/o el mes. */
  onChanged: () => void;
  /** Si la fecha es del pasado, el panel se renderiza en solo-lectura. */
  isPast?: boolean;
}

const dayTypeLabel: Record<string, string> = {
  holiday: "Festivo (oficial)",
  sunday: "Domingo",
  weekend: "Fin de semana",
  normal: "Día normal",
};

export default function DayAvailabilityPanel({
  date,
  detail,
  loading,
  onChanged,
  isPast = false,
}: Props) {
  const [closed, setClosed] = useState(false);
  const [holiday, setHoliday] = useState(false);
  const [priceInput, setPriceInput] = useState<string>("");
  const [savingState, setSavingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [savingError, setSavingError] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [confirmCloseWithReservations, setConfirmCloseWithReservations] =
    useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discardedConfirmNotice, setDiscardedConfirmNotice] = useState<
    string | null
  >(null);

  const parsedDate = useMemo(() => {
    try {
      return parse(date, "yyyy-MM-dd", new Date());
    } catch {
      return null;
    }
  }, [date]);

  const detectedDayType = parsedDate ? getDayType(parsedDate) : "normal";
  const isOfficialHoliday = parsedDate ? isHoliday(parsedDate) : false;

  const defaultPrice = parsedDate
    ? calculatePrice(parsedDate, null, holiday)
    : 0;

  const customPriceParsed = priceInput.trim() ? Number(priceInput) : null;
  const isPriceInputValid =
    customPriceParsed === null ||
    (Number.isFinite(customPriceParsed) &&
      customPriceParsed >= 0 &&
      Number.isInteger(customPriceParsed));
  const effectivePrice =
    customPriceParsed != null && isPriceInputValid
      ? customPriceParsed
      : defaultPrice;

  const reservationsCount = (detail?.slots ?? []).filter(
    (s) => s.is_occupied && s.reservation
  ).length;

  const disabledSlotsCount = (detail?.slots ?? []).filter(
    (s) => !s.available && !s.is_occupied
  ).length;

  const hasOverride = Boolean(
    detail?.availability &&
      (detail.availability.is_closed ||
        detail.availability.is_holiday ||
        detail.availability.custom_price != null)
  );
  const savedCustomPrice = detail?.availability?.custom_price ?? null;
  const priceChanged =
    customPriceParsed === null
      ? savedCustomPrice !== null
      : isPriceInputValid && customPriceParsed !== savedCustomPrice;
  const hasAnyChange =
    !!detail &&
    (closed !== (detail.availability?.is_closed ?? false) ||
      holiday !== (detail.availability?.is_holiday ?? false) ||
      priceChanged);

  // Sincronizar inputs cuando cambia el detalle. Si había una confirmación
  // abierta (cerrar con reservas / quitar configuración) la descartamos y
  // mostramos un aviso para que el admin no piense que se aplicó por error.
  useEffect(() => {
    if (!detail) return;
    setClosed(detail.availability?.is_closed ?? false);
    setHoliday(detail.availability?.is_holiday ?? false);
    setPriceInput(
      detail.availability?.custom_price != null
        ? String(detail.availability.custom_price)
        : ""
    );
    setSavingState("idle");
    setSavingError(null);
    setSlotError(null);
    setConfirmCloseWithReservations((prev) => {
      if (prev) {
        setDiscardedConfirmNotice(
          "Se descartó la confirmación pendiente al cambiar de día."
        );
      }
      return false;
    });
    setConfirmDelete((prev) => {
      if (prev) {
        setDiscardedConfirmNotice(
          "Se descartó la confirmación pendiente al cambiar de día."
        );
      }
      return false;
    });
  }, [detail]);

  // Auto-ocultar mensaje "Guardado" tras 2.5s
  useEffect(() => {
    if (savingState !== "saved") return;
    const t = setTimeout(() => setSavingState("idle"), 2500);
    return () => clearTimeout(t);
  }, [savingState]);

  // Auto-ocultar el aviso de confirmación descartada tras 4s
  useEffect(() => {
    if (!discardedConfirmNotice) return;
    const t = setTimeout(() => setDiscardedConfirmNotice(null), 4000);
    return () => clearTimeout(t);
  }, [discardedConfirmNotice]);

  // Si el admin sigue editando, limpiar el banner de error de guardado
  // para no dejar mensajes obsoletos visibles mientras corrige.
  useEffect(() => {
    if (savingState === "error") {
      setSavingState("idle");
      setSavingError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, holiday, priceInput]);

  const doSave = async (force = false) => {
    if (!parsedDate) return;
    if (
      closed &&
      reservationsCount > 0 &&
      !detail?.availability?.is_closed &&
      !force
    ) {
      setConfirmCloseWithReservations(true);
      return;
    }
    setSavingState("saving");
    setSavingError(null);
    try {
      const customPrice =
        priceInput.trim() === "" ? null : Number(priceInput);
      if (customPrice != null && (Number.isNaN(customPrice) || customPrice < 0)) {
        setSavingState("error");
        setSavingError("Precio inválido");
        return;
      }
      const res = await axios.post("/api/admin/availability", {
        date,
        isClosed: closed,
        isHoliday: holiday,
        customPrice,
      });
      if (!res.data?.success) {
        setSavingState("error");
        setSavingError(res.data?.error || "Error al guardar");
        return;
      }
      setSavingState("saved");
      setConfirmCloseWithReservations(false);
      onChanged();
    } catch (err) {
      setSavingState("error");
      setSavingError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error al guardar"
          : "Error al guardar"
      );
    }
  };

  const doDelete = async () => {
    if (!hasOverride && disabledSlotsCount === 0) return;
    setConfirmDelete(false);
    setSavingState("saving");
    setSavingError(null);
    try {
      const res = await axios.delete(
        `/api/admin/availability?date=${encodeURIComponent(date)}`
      );
      if (!res.data?.success) {
        setSavingState("error");
        setSavingError(res.data?.error || "Error al borrar");
        return;
      }
      setSavingState("saved");
      onChanged();
    } catch (err) {
      setSavingState("error");
      setSavingError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error al borrar"
          : "Error al borrar"
      );
    }
  };

  const toggleSlot = async (slot: DaySlot) => {
    if (slot.is_occupied) return;
    setPendingSlot(slot.start_time);
    setSlotError(null);
    try {
      const res = await axios.patch("/api/admin/time-slots", {
        date,
        startTime: slot.start_time,
        available: !slot.available,
      });
      if (!res.data?.success) {
        setSlotError(res.data?.error || "Error al actualizar el horario");
        return;
      }
      onChanged();
    } catch (err) {
      setSlotError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error al actualizar"
          : "Error al actualizar"
      );
    } finally {
      setPendingSlot(null);
    }
  };

  if (loading || !detail) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {discardedConfirmNotice && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <span>{discardedConfirmNotice}</span>
          <button
            type="button"
            onClick={() => setDiscardedConfirmNotice(null)}
            className="text-amber-700 underline-offset-2 hover:underline"
            aria-label="Cerrar aviso"
          >
            Ok
          </button>
        </div>
      )}

      {/* Encabezado */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Día seleccionado
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[#103948]">
          {formatDisplayDate(date)}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
            {dayTypeLabel[detectedDayType]}
          </span>
          {isOfficialHoliday && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
              Festivo oficial México
            </span>
          )}
          {isPast && (
            <span className="rounded-full bg-zinc-200 px-2 py-1 text-zinc-700">
              Solo lectura (fecha pasada)
            </span>
          )}
        </div>
        <div className="mt-4 rounded-md bg-zinc-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Precio efectivo
          </p>
          <p className="mt-0.5 text-3xl font-semibold text-[#103948]">
            ${formatCurrency(effectivePrice)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {customPriceParsed != null && !Number.isNaN(customPriceParsed)
              ? "Precio personalizado guardado abajo"
              : holiday
                ? `Tarifa de festivo ($${formatCurrency(PRICES.holiday)})`
                : `Tarifa por tipo de día (${dayTypeLabel[detectedDayType]})`}
          </p>
        </div>
      </div>

      {/* Estado del día */}
      <fieldset
        disabled={isPast}
        className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 sm:p-5 disabled:opacity-60"
      >
        <legend className="px-1 text-sm font-semibold text-zinc-900">
          Configuración del día
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
            <input
              type="checkbox"
              checked={closed}
              onChange={(e) => setClosed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#103948]"
            />
            <span>
              <span className="font-medium text-zinc-900">Cerrar el día</span>
              <span className="block text-xs text-zinc-500">
                No se permiten reservas nuevas en esta fecha.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
            <input
              type="checkbox"
              checked={holiday}
              onChange={(e) => setHoliday(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#103948]"
            />
            <span>
              <span className="font-medium text-zinc-900">Marcar festivo</span>
              <span className="block text-xs text-zinc-500">
                Aplica tarifa ${formatCurrency(PRICES.holiday)} (salvo precio
                custom).
              </span>
            </span>
          </label>
        </div>

        <div>
          <label
            htmlFor="custom-price"
            className="mb-1 block text-sm font-medium text-zinc-900"
          >
            Precio personalizado (opcional)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">$</span>
            <input
              id="custom-price"
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              placeholder={String(defaultPrice)}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
            />
            {priceInput.trim() !== "" && (
              <button
                type="button"
                onClick={() => setPriceInput("")}
                className="text-xs text-zinc-500 underline hover:text-zinc-700"
              >
                Quitar
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Vacío = usar tarifa automática (${formatCurrency(defaultPrice)}).
          </p>
          {!isPriceInputValid && (
            <p className="mt-1 text-xs text-red-600">
              Ingresa un entero mayor o igual a 0.
            </p>
          )}
        </div>

        {savingError && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {savingError}
          </div>
        )}
        {savingState === "saved" && (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">
            Cambios guardados.
          </div>
        )}
        {confirmCloseWithReservations && (
          <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              Hay {reservationsCount} reserva{reservationsCount !== 1 ? "s" : ""}{" "}
              confirmada{reservationsCount !== 1 ? "s" : ""} este día.
            </p>
            <p className="text-xs">
              Si cierras el día, las reservas existentes seguirán activas pero
              no se permitirán nuevas. Tendrás que reagendarlas o cancelarlas
              manualmente.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmCloseWithReservations(false)}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => doSave(true)}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Cerrar de todas formas
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => doSave(false)}
            disabled={
              savingState === "saving" ||
              !hasAnyChange ||
              !isPriceInputValid ||
              confirmCloseWithReservations
            }
            className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2a35] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingState === "saving" ? "Guardando…" : "Guardar cambios"}
          </button>
          {(hasOverride || disabledSlotsCount > 0) && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={savingState === "saving" || confirmDelete}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Quitar configuración
            </button>
          )}
        </div>

        {confirmDelete && (
          <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-medium">¿Quitar la configuración de este día?</p>
            <ul className="list-inside list-disc text-xs">
              {hasOverride && (
                <li>
                  Se borrarán los flags de cerrado, festivo y precio
                  personalizado.
                </li>
              )}
              {disabledSlotsCount > 0 && (
                <li>
                  Se re-habilitará{disabledSlotsCount !== 1 ? "n" : ""}{" "}
                  {disabledSlotsCount} horario
                  {disabledSlotsCount !== 1 ? "s" : ""} cerrado
                  {disabledSlotsCount !== 1 ? "s" : ""} manualmente.
                </li>
              )}
              <li>Las reservas existentes no se tocan.</li>
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doDelete}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Sí, quitar
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* Slots */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Horarios</h3>
          {disabledSlotsCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {disabledSlotsCount} deshabilitado
              {disabledSlotsCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {detail.slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            No hay horarios para este día (fuera del rango de 6 meses).
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {detail.slots.map((slot) => {
              const time = slot.start_time.substring(0, 5);
              const isPending = pendingSlot === slot.start_time;
              const stateLabel = slot.is_occupied
                ? "Reservado"
                : !slot.available
                  ? "Deshabilitado"
                  : "Disponible";
              const stateColor = slot.is_occupied
                ? "text-blue-700"
                : !slot.available
                  ? "text-amber-700"
                  : "text-emerald-700";
              const dotColor = slot.is_occupied
                ? "bg-blue-500"
                : !slot.available
                  ? "bg-amber-500"
                  : "bg-emerald-500";
              return (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-zinc-900">
                      {formatDisplayTimeInMonterrey(time, date)}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                      <span
                        aria-hidden
                        className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`}
                      />
                      {slot.reservation ? (
                        <Link
                          href={`/reservaciones/${slot.reservation.id}`}
                          className="truncate text-blue-700 underline-offset-2 hover:underline"
                          title={`Reservado por ${slot.reservation.name}`}
                        >
                          {slot.reservation.name}
                        </Link>
                      ) : (
                        <span className={stateColor}>{stateLabel}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {slot.is_occupied ? (
                      slot.reservation ? (
                        <Link
                          href={`/reservaciones/${slot.reservation.id}`}
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          Ver →
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500">Ocupado</span>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={isPast || isPending}
                        onClick={() => toggleSlot(slot)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          slot.available
                            ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                            : "border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {isPending
                          ? "…"
                          : slot.available
                            ? "Cerrar"
                            : "Abrir"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {slotError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {slotError}
          </div>
        )}
      </div>
    </div>
  );
}
