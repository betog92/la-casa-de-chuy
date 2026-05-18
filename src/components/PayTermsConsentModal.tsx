"use client";

import { useEffect, useRef, useState } from "react";
import CheckoutTermsHighlights from "@/components/CheckoutTermsHighlights";
import TermsContent from "@/components/TermsContent";

interface PayTermsConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de consentimiento antes del cobro.
 *
 * Diseño: resumen corto (`CheckoutTermsHighlights`) + acordeón con el texto
 * completo de los términos (`TermsContent`).
 *
 * Comportamiento:
 * - Solo "Acepto y continuar con el pago" confirma; Esc o "Cancelar" cierran
 *   sin cobrar.
 * - El clic en el fondo oscuro (overlay) NO cierra el modal: es intencional
 *   para evitar cerrar por accidente antes de leer/aceptar (a diferencia de
 *   `TermsModal`, que sí cierra al pulsar fuera).
 */
export default function PayTermsConsentModal({
  isOpen,
  onConfirm,
  onCancel,
}: PayTermsConsentModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [showFullTerms, setShowFullTerms] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    const getFocusableElements = () => {
      const dialogEl = dialogRef.current;
      if (!dialogEl) return [] as HTMLElement[];
      return Array.from(
        dialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key !== "Tab") return;

      const focusableEls = getFocusableElements();
      if (focusableEls.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (
          !activeEl ||
          activeEl === firstEl ||
          !dialogRef.current?.contains(activeEl)
        ) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (
        !activeEl ||
        activeEl === lastEl ||
        !dialogRef.current?.contains(activeEl)
      ) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "unset";
      document.removeEventListener("keydown", onKey);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-2 sm:p-4 lg:p-8"
      aria-hidden={false}
      onClick={(e) => {
        // Clic en overlay: no cerrar (consentimiento explícito requerido).
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-consent-title"
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full min-w-0 flex-col rounded-xl bg-white shadow-2xl ring-1 ring-black/5 transition-[max-width] duration-200 ease-out ${
          showFullTerms ? "max-w-5xl" : "max-w-3xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4 sm:px-7">
          <h2
            id="pay-consent-title"
            className="text-lg font-bold text-zinc-900 sm:text-xl"
          >
            Antes de pagar
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Estas son las reglas que más afectan tu reserva. Puedes leer el
            documento completo más abajo.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
          <CheckoutTermsHighlights />

          <div className="mt-5 border-t border-zinc-200 pt-3">
            <button
              type="button"
              onClick={() => setShowFullTerms((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-[#103948] hover:underline"
              aria-expanded={showFullTerms}
              {...(showFullTerms
                ? ({ "aria-controls": "pay-consent-full-terms" } as const)
                : {})}
            >
              {showFullTerms ? "Ocultar" : "Ver"} términos y condiciones completos
              <span aria-hidden="true">{showFullTerms ? "▲" : "▼"}</span>
            </button>
            {showFullTerms && (
              <div
                id="pay-consent-full-terms"
                className="mt-3 rounded-md border border-zinc-200 bg-zinc-50/80 p-4 text-sm leading-relaxed text-zinc-800 sm:text-[0.9375rem]"
              >
                <TermsContent />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-zinc-200 bg-white px-5 py-4 sm:px-7">
          <p className="text-xs leading-relaxed text-zinc-600 sm:text-sm">
            Al pulsar &quot;Acepto y continuar con el pago&quot; declaras haber
            leído y aceptar los términos y condiciones.
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
