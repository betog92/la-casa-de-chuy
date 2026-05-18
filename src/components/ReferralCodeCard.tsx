"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

interface ReferralCodeData {
  code: string;
  active: boolean;
  stats: { redeemedCount: number };
  rewards: { inviteeDiscountAmount: number; referrerCreditAmount: number };
}

/**
 * Bloque "Tu código de referido" para la página /account.
 * - Lee `/api/referrals/me` (que devuelve el código permanente del usuario,
 *   creándolo on-demand como fallback).
 * - Botón Copiar al portapapeles.
 * - Botón Compartir (Web Share API si está disponible, fallback a WhatsApp).
 */
export function ReferralCodeCard() {
  const [data, setData] = useState<ReferralCodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get("/api/referrals/me");
        if (cancelled) return;
        if (res.data?.success) {
          setData({
            code: res.data.code,
            active: res.data.active,
            stats: res.data.stats ?? { redeemedCount: 0 },
            rewards: res.data.rewards ?? {
              inviteeDiscountAmount: 100,
              referrerCreditAmount: 200,
            },
          });
        } else {
          setError(res.data?.error || "No se pudo cargar tu código");
        }
      } catch (err) {
        if (cancelled) return;
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : "Error al cargar tu código";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!data?.code || !data.active) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencioso: si el navegador bloquea clipboard, el usuario
      // siempre puede seleccionar el texto a mano.
    }
  }, [data?.code, data?.active]);

  const handleShare = useCallback(async () => {
    if (!data?.code || !data.active) return;
    const inviteeAmount = data.rewards.inviteeDiscountAmount;
    const shareText =
      `Reserva tu sesión en La Casa de Chuy y obtén $${inviteeAmount} de descuento ` +
      `con mi código: ${data.code}`;
    const shareUrl =
      typeof window !== "undefined" ? `${window.location.origin}/reservar` : "";

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (
          navigator as Navigator & {
            share: (data: ShareData) => Promise<void>;
          }
        ).share({
          title: "La Casa de Chuy",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Usuario canceló o no soportado: caer al fallback de WhatsApp.
      }
    }

    const waUrl = `https://wa.me/?text=${encodeURIComponent(
      `${shareText}\n${shareUrl}`,
    )}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }, [data]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-5 mb-6">
        <div className="h-5 w-40 bg-zinc-100 rounded animate-pulse mb-3" />
        <div className="h-10 w-full bg-zinc-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-lg border border-red-200 shadow-sm p-5 mb-6">
        <h2 className="text-lg font-semibold text-[#103948] mb-1">
          Tu código de referido
        </h2>
        <p className="text-sm text-red-700">
          {error || "No se pudo cargar tu código."}
        </p>
      </div>
    );
  }

  const { code, active, stats, rewards } = data;
  const friendCountText =
    stats.redeemedCount === 0
      ? "Aún nadie ha usado tu código. ¡Compártelo!"
      : `${stats.redeemedCount} amigo${
          stats.redeemedCount === 1 ? "" : "s"
        } ya usaron tu código.`;

  return (
    <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-5 mb-6">
      <h2 className="text-xl font-semibold text-[#103948] mb-1">
        Tu código de referido
      </h2>
      <p className="text-sm text-zinc-600 mb-4">
        {active ? (
          <>
            Compártelo con tus amigos: ellos obtienen{" "}
            <strong>${rewards.inviteeDiscountAmount}</strong> de descuento en su
            primera reserva y tú ganas{" "}
            <strong>${rewards.referrerCreditAmount}</strong> en créditos cuando
            paguen.
          </>
        ) : (
          <>
            Tu código está pausado y no puede usarse en nuevas reservas por
            ahora. Si crees que es un error, contáctanos.
          </>
        )}
      </p>

      {!active && (
        <p
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Código inactivo — Copiar y Compartir están deshabilitados hasta que se
          reactive.
        </p>
      )}

      <div
        className={`flex flex-col sm:flex-row gap-3 items-stretch sm:items-center${!active ? " opacity-60" : ""}`}
      >
        <div className="flex-1 flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3">
          <code
            className={`text-lg font-mono font-semibold tracking-wider ${active ? "text-[#103948]" : "text-zinc-500"}`}
          >
            {code}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!active}
            className="px-3 py-1.5 text-sm font-medium text-[#103948] border border-[#103948] rounded hover:bg-[#103948] hover:text-white transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#103948]"
            aria-label="Copiar código al portapapeles"
          >
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleShare}
          disabled={!active}
          className="px-4 py-3 sm:py-2 text-sm font-semibold bg-[#103948] text-white rounded-lg hover:bg-[#0d2d38] transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          Compartir
        </button>
      </div>

      {active && (
        <p className="text-xs text-zinc-500 mt-3">{friendCountText}</p>
      )}
    </div>
  );
}
