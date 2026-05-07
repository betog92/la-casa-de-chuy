"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { googleMapsSearchUrl, wazeSearchUrl } from "@/utils/maps-links";

const BTN_BASE =
  "inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const outline =
  `${BTN_BASE} border-[#103948]/30 bg-white text-[#103948] hover:bg-[#103948]/5 focus-visible:outline-[#103948]`;

const primary =
  `${BTN_BASE} border-[#103948] bg-[#103948] text-white hover:bg-[#0d2d38] focus-visible:outline-[#103948]`;

type Props = {
  address: string;
};

export function UbicacionAddressActions({ address }: Props) {
  const [copyLabel, setCopyLabel] = useState<"idle" | "ok" | "err">("idle");
  /** En el navegador `setTimeout` devuelve `number` (Node usa `Timeout`). */
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const copy = useCallback(async () => {
    const text = address.trim();
    if (!text) return;
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("ok");
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null;
        setCopyLabel("idle");
      }, 2000);
    } catch {
      setCopyLabel("err");
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null;
        setCopyLabel("idle");
      }, 2500);
    }
  }, [address]);

  const g = googleMapsSearchUrl(address);
  const w = wazeSearchUrl(address);

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-zinc-600">
        Abre la ruta en tu app o copia la dirección para compartirla.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className={primary} onClick={copy}>
          {copyLabel === "ok"
            ? "Copiado al portapapeles"
            : copyLabel === "err"
              ? "No se pudo copiar (permiso del navegador)"
              : "Copiar dirección"}
        </button>
        <a
          className={outline}
          href={g}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir en Google Maps
        </a>
        <a
          className={outline}
          href={w}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir en Waze
        </a>
      </div>
    </div>
  );
}
