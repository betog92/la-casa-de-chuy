"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { format, addDays, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

interface AvailabilityRow {
  id: string;
  date: string;
  is_closed: boolean;
  is_holiday: boolean;
  custom_price: number | null;
}

export default function AdminDisponibilidadPage() {
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(addDays(new Date(), 60));
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    };
  });
  const [newDate, setNewDate] = useState("");
  const [newClosed, setNewClosed] = useState(false);
  const [newHoliday, setNewHoliday] = useState(false);
  const [newPrice, setNewPrice] = useState("");

  const fetchAvailability = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(
        `/api/admin/availability?dateFrom=${dateRange.from}&dateTo=${dateRange.to}`
      );
      if (res.data.success) {
        setAvailability(res.data.availability ?? []);
      } else {
        setError(res.data.error || "Error al cargar");
      }
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error"
          : "Error al cargar disponibilidad"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [dateRange.from, dateRange.to]);

  const saveRow = async (date: string, isClosed: boolean, isHoliday: boolean, customPrice: string) => {
    setSaving(date);
    try {
      const res = await axios.post("/api/admin/availability", {
        date,
        isClosed,
        isHoliday,
        customPrice: customPrice ? parseFloat(customPrice) : null,
      });
      if (res.data.success) {
        setAvailability((prev) => {
          const existing = prev.find((a) => a.date === date);
          if (existing) {
            return prev.map((a) =>
              a.date === date ? res.data.availability : a
            );
          }
          return [...prev, res.data.availability].sort(
            (a, b) => a.date.localeCompare(b.date)
          );
        });
      }
    } catch (err) {
      console.error("Error saving:", err);
    } finally {
      setSaving(null);
    }
  };

  const addNew = async () => {
    if (!newDate) return;
    setSaving("new");
    try {
      const res = await axios.post("/api/admin/availability", {
        date: newDate,
        isClosed: newClosed,
        isHoliday: newHoliday,
        customPrice: newPrice ? parseFloat(newPrice) : null,
      });
      if (res.data.success) {
        setAvailability((prev) => {
          const filtered = prev.filter((a) => a.date !== newDate);
          return [...filtered, res.data.availability].sort(
            (a, b) => a.date.localeCompare(b.date)
          );
        });
        setNewDate("");
        setNewClosed(false);
        setNewHoliday(false);
        setNewPrice("");
      }
    } catch (err) {
      console.error("Error adding:", err);
    } finally {
      setSaving(null);
    }
  };

  const formatDisplayDate = (d: string) => {
    try {
      return format(new Date(d + "T12:00:00"), "EEEE d MMM", { locale: es });
    } catch {
      return d;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Disponibilidad
        </h1>
        <p className="mt-1 text-zinc-600">
          Configurar fechas cerradas, festivos y precios personalizados
        </p>
      </div>

      {/* Rango de fechas */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Desde
          </label>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) =>
              setDateRange((r) => ({ ...r, from: e.target.value }))
            }
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Hasta
          </label>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) =>
              setDateRange((r) => ({ ...r, to: e.target.value }))
            }
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Agregar nueva fecha */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-4 font-medium text-zinc-900">
          Configurar una fecha
        </h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Fecha
            </label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newClosed}
              onChange={(e) => setNewClosed(e.target.checked)}
              className="rounded border-zinc-300"
            />
            <span className="text-sm">Cerrado</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newHoliday}
              onChange={(e) => setNewHoliday(e.target.checked)}
              className="rounded border-zinc-300"
            />
            <span className="text-sm">Festivo</span>
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Precio personalizado (opcional)
            </label>
            <input
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Ej: 2000"
              min="0"
              step="50"
              className="w-28 rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={addNew}
            disabled={!newDate || saving === "new"}
            className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2a35] disabled:opacity-50"
          >
            {saving === "new" ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Lista de fechas configuradas */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h3 className="font-medium text-zinc-900">
            Fechas con configuración especial
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
          </div>
        ) : availability.length === 0 ? (
          <div className="px-4 py-12 text-center text-zinc-500">
            No hay fechas configuradas en el rango seleccionado
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {availability.map((row) => (
              <AvailabilityEditRow
                key={row.id}
                row={row}
                formatDisplayDate={formatDisplayDate}
                saving={saving === row.date}
                onSave={saveRow}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityEditRow({
  row,
  formatDisplayDate,
  saving,
  onSave,
}: {
  row: AvailabilityRow;
  formatDisplayDate: (d: string) => string;
  saving: boolean;
  onSave: (
    date: string,
    isClosed: boolean,
    isHoliday: boolean,
    customPrice: string
  ) => void;
}) {
  const [closed, setClosed] = useState(row.is_closed);
  const [holiday, setHoliday] = useState(row.is_holiday);
  const [price, setPrice] = useState(
    row.custom_price != null ? String(row.custom_price) : ""
  );

  useEffect(() => {
    setClosed(row.is_closed);
    setHoliday(row.is_holiday);
    setPrice(row.custom_price != null ? String(row.custom_price) : "");
  }, [row.date, row.is_closed, row.is_holiday, row.custom_price]);

  const hasChanges =
    closed !== row.is_closed ||
    holiday !== row.is_holiday ||
    (price ? parseFloat(price) : null) !== row.custom_price;

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-zinc-50 sm:flex-nowrap">
      <div className="w-40 font-medium text-zinc-900">
        {formatDisplayDate(row.date)}
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={closed}
          onChange={(e) => setClosed(e.target.checked)}
          className="rounded border-zinc-300"
        />
        <span className="text-sm">Cerrado</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={holiday}
          onChange={(e) => setHoliday(e.target.checked)}
          className="rounded border-zinc-300"
        />
        <span className="text-sm">Festivo</span>
      </label>
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Precio"
        min="0"
        step="50"
        className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm"
      />
      {hasChanges && (
        <button
          onClick={() => onSave(row.date, closed, holiday, price)}
          disabled={saving}
          className="rounded bg-[#103948] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d2a35] disabled:opacity-50"
        >
          {saving ? "..." : "Guardar"}
        </button>
      )}
    </div>
  );
}
