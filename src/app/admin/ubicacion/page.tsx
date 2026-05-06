"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocationContent } from "@/lib/site-location";
import { defaultLocationContent } from "@/lib/site-location";

export default function AdminUbicacionPage() {
  const [loc, setLoc] = useState<LocationContent>(defaultLocationContent());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/location");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo cargar");
        return;
      }
      if (json.location) {
        setLoc({ ...defaultLocationContent(), ...json.location });
      }
    } catch (e) {
      console.error(e);
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loc),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo guardar");
        return;
      }
      setMessage("Guardado");
      if (json.location) {
        setLoc({ ...defaultLocationContent(), ...json.location });
      }
    } catch (err) {
      console.error(err);
      setError("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900">Ubicación (sitio)</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Edita el contenido de{" "}
        <a href="/ubicacion" className="text-[#103948] underline">
          /ubicacion
        </a>
        . Para el mapa, en Google Maps: Compartir → Insertar un mapa → copia
        solo la URL del atributo{" "}
        <code className="rounded bg-zinc-100 px-1 text-xs">src</code> del{" "}
        <code className="rounded bg-zinc-100 px-1 text-xs">iframe</code>.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-zinc-500">Cargando…</p>
      ) : (
        <form onSubmit={(e) => void save(e)} className="mt-8 max-w-2xl space-y-4">
          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-zinc-800"
            >
              Dirección
            </label>
            <textarea
              id="address"
              rows={3}
              value={loc.address}
              onChange={(e) =>
                setLoc((s) => ({ ...s, address: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="mapsEmbedUrl"
              className="block text-sm font-medium text-zinc-800"
            >
              URL del mapa embebido (src del iframe)
            </label>
            <input
              id="mapsEmbedUrl"
              type="url"
              value={loc.mapsEmbedUrl}
              onChange={(e) =>
                setLoc((s) => ({ ...s, mapsEmbedUrl: e.target.value }))
              }
              placeholder="https://www.google.com/maps/embed?..."
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="directions"
              className="block text-sm font-medium text-zinc-800"
            >
              Cómo llegar
            </label>
            <textarea
              id="directions"
              rows={4}
              value={loc.directions}
              onChange={(e) =>
                setLoc((s) => ({ ...s, directions: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="parkingNote"
              className="block text-sm font-medium text-zinc-800"
            >
              Estacionamiento
            </label>
            <textarea
              id="parkingNote"
              rows={3}
              value={loc.parkingNote}
              onChange={(e) =>
                setLoc((s) => ({ ...s, parkingNote: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#103948] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0d2d38] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </form>
      )}
    </div>
  );
}
