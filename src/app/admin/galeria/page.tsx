"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

interface GalleryRow {
  id: string;
  public_url: string;
  sort_order: number;
  caption: string | null;
  created_at: string;
}

export default function AdminGaleriaPage() {
  const [images, setImages] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/gallery");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo cargar la galería");
        return;
      }
      setImages((json.images as GalleryRow[]) || []);
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

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/gallery/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo subir");
        return;
      }
      setMessage("Imagen subida");
      await load();
    } catch (err) {
      console.error(err);
      setError("Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta foto de la galería?")) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/gallery/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo eliminar");
        return;
      }
      setMessage("Imagen eliminada");
      await load();
    } catch (err) {
      console.error(err);
      setError("Error al eliminar");
    }
  };

  const reorder = async (orderedIds: string[]) => {
    setError(null);
    setMessage(null);
    setReordering(true);
    try {
      const res = await fetch("/api/admin/gallery/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo guardar el orden");
        await load();
        return;
      }
      await load();
    } catch (err) {
      console.error(err);
      setError("Error al reordenar");
      await load();
    } finally {
      setReordering(false);
    }
  };

  const move = (index: number, delta: number) => {
    if (reordering) return;
    const next = index + delta;
    if (next < 0 || next >= images.length) return;
    const copy = [...images];
    const [removed] = copy.splice(index, 1);
    copy.splice(next, 0, removed);
    setImages(copy);
    void reorder(copy.map((x) => x.id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900">Galería pública</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Las fotos aparecen en{" "}
        <a href="/galeria" className="text-[#103948] underline">
          /galeria
        </a>
        . Formatos: JPEG, PNG, WebP, GIF. Máx. 5 MB por imagen.
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

      <div className="mt-6">
        <label
          className={`inline-flex cursor-pointer items-center rounded-lg bg-[#103948] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d2d38] disabled:opacity-50 ${reordering ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? "Subiendo…" : "Subir imagen"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={uploading || reordering}
            onChange={(e) => void onFile(e)}
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-8 text-zinc-500">Cargando…</p>
      ) : images.length === 0 ? (
        <p className="mt-8 text-zinc-500">No hay imágenes aún.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, index) => (
            <li
              key={img.id}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full bg-zinc-100">
                <Image
                  src={img.public_url}
                  alt={
                    img.caption?.trim()
                      ? img.caption.trim()
                      : "Imagen de la galería"
                  }
                  fill
                  className="object-cover"
                  sizes="280px"
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-zinc-100 p-2">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={reordering || index === 0}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-40"
                >
                  Arriba
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={reordering || index === images.length - 1}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-40"
                >
                  Abajo
                </button>
                <button
                  type="button"
                  onClick={() => void remove(img.id)}
                  disabled={reordering}
                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 disabled:opacity-40"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
