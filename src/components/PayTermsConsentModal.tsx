"use client";

import { useEffect, useRef } from "react";
import TermsContent from "@/components/TermsContent";

interface PayTermsConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de consentimiento antes del cobro: muestra los términos y exige
 * aceptación explícita (sin cerrar al pulsar fuera del panel).
 */
export default function PayTermsConsentModal({
  isOpen,
  onConfirm,
  onCancel,
}: PayTermsConsentModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "unset";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-consent-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2
            id="pay-consent-title"
            className="text-lg font-bold text-zinc-900 sm:text-xl"
          >
            Antes de pagar
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Lee los términos y condiciones. Para continuar con el cobro debes
            aceptarlos explícitamente.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          <div className="rounded-md border border-zinc-200 bg-zinc-50/80 p-4 text-sm sm:text-[0.9375rem]">
            <TermsContent />
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-zinc-200 bg-white px-5 py-4 sm:px-6">
          <p className="text-xs leading-relaxed text-zinc-600 sm:text-sm">
            Al pulsar &quot;Acepto y continuar con el pago&quot; declaras haber
            leído y aceptar los términos y condiciones anteriores.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-[#103948] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0d2d3a]"
            >
              Acepto y continuar con el pago
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
