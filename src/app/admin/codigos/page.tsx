"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  discount_percentage: number;
  valid_from: string;
  valid_until: string;
  max_uses: number;
  current_uses: number;
  active: boolean;
}

export default function AdminCodigosPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountPercentage: 15,
    validFrom: "",
    validUntil: "",
    maxUses: 100,
    active: true,
  });

  const fetchCodes = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/admin/discount-codes");
      if (res.data.success) {
        setCodes(res.data.discountCodes ?? []);
      } else {
        setError(res.data.error || "Error al cargar");
      }
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error"
          : "Error al cargar códigos"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({
      code: "",
      description: "",
      discountPercentage: 15,
      validFrom: "",
      validUntil: "",
      maxUses: 100,
      active: true,
    });
    setShowForm(true);
  };

  const openEdit = (c: DiscountCode) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountPercentage: c.discount_percentage,
      validFrom: c.valid_from,
      validUntil: c.valid_until,
      maxUses: c.max_uses,
      active: c.active,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingId && { id: editingId }),
        code: form.code,
        description: form.description || null,
        discountPercentage: form.discountPercentage,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        maxUses: form.maxUses,
        active: form.active,
      };
      const res = await axios.post("/api/admin/discount-codes", payload);
      if (res.data.success) {
        if (editingId) {
          setCodes((prev) =>
            prev.map((c) => (c.id === editingId ? res.data.discountCode : c))
          );
        } else {
          setCodes((prev) => [res.data.discountCode, ...prev]);
        }
        setShowForm(false);
      } else {
        setError(res.data.error || "Error al guardar");
      }
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.error as string) || "Error al guardar"
          : "Error al guardar"
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-[#103948]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Códigos de descuento
          </h1>
          <p className="mt-1 text-zinc-600">
            Crear y gestionar códigos promocionales
          </p>
        </div>
        <button
          onClick={openNew}
          className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2a35]"
        >
          Nuevo código
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h3 className="mb-4 font-medium text-zinc-900">
            {editingId ? "Editar código" : "Nuevo código"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Código
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                placeholder="BUENFIN"
                required
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                readOnly={!!editingId}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                % Descuento
              </label>
              <input
                type="number"
                value={form.discountPercentage}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountPercentage: parseFloat(e.target.value) || 0,
                  }))
                }
                min="0"
                max="100"
                step="1"
                required
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Descripción
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Descuento Buen Fin"
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Válido desde
              </label>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validFrom: e.target.value }))
                }
                required
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Válido hasta
              </label>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validUntil: e.target.value }))
                }
                required
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Máx. usos
              </label>
              <input
                type="number"
                value={form.maxUses}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxUses: parseInt(e.target.value, 10) || 0,
                  }))
                }
                min="1"
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.checked }))
                }
                className="rounded border-zinc-300"
              />
              <label htmlFor="active" className="text-sm">
                Activo
              </label>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2a35]"
            >
              {editingId ? "Actualizar" : "Crear"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de códigos */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
          </div>
        ) : codes.length === 0 ? (
          <div className="px-4 py-12 text-center text-zinc-500">
            No hay códigos de descuento. Crea uno para empezar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">
                    Descuento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">
                    Vigencia
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">
                    Usos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-zinc-500">
                    Estado
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {codes.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-mono font-medium text-zinc-900">
                      {c.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {c.discount_percentage}%
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {format(new Date(c.valid_from + "T12:00:00"), "d MMM yyyy", {
                        locale: es,
                      })}{" "}
                      -{" "}
                      {format(new Date(c.valid_until + "T12:00:00"), "d MMM yyyy", {
                        locale: es,
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {c.current_uses} / {c.max_uses}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.active ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {c.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-sm font-medium text-[#103948] hover:underline"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
