"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type GuestReservationNextStepProps = {
  manageHref: string;
  urlToCopy: string;
  guestEmail?: string | null;
};

export function GuestReservationNextStep({
  manageHref,
  urlToCopy,
  guestEmail,
}: GuestReservationNextStepProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    if (!urlToCopy) return;
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: el usuario puede usar el CTA primario para abrir la página
    }
  }, [urlToCopy]);

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold text-zinc-900">
        Gestionar tu reserva
      </h3>
      <p className="mb-4 text-sm text-zinc-600">
        Desde ahí puedes reagendar o cancelar cuando lo necesites.
      </p>

      <Link
        href={manageHref}
        className="mb-4 flex w-full items-center justify-center rounded-lg bg-[#103948] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-[#0d2d38]"
      >
        Gestionar mi reserva
      </Link>

      <button
        type="button"
        onClick={handleCopy}
        disabled={!urlToCopy}
        aria-label="Copiar enlace de tu reserva"
        className="text-sm font-medium text-[#103948] hover:text-[#0d2d38] underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
      >
        {copied ? "¡Copiado!" : "Copiar enlace"}
      </button>

      {guestEmail?.trim() && (
        <p className="mt-4 text-sm text-zinc-500">
          También te enviamos este enlace a{" "}
          <span className="font-medium text-zinc-700">{guestEmail.trim()}</span>.
        </p>
      )}
    </div>
  );
}
