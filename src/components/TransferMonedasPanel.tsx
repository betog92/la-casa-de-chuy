"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDisplayDateTimeCompact } from "@/utils/formatters";
import { pluralizeLoyalty } from "@/utils/loyalty";

// =====================================================
// <TransferMonedasPanel />
// =====================================================
// Panel reutilizable para que el cliente regale las Monedas
// Chuy de una reserva a su fotógrafo.
// Se usa en /reservaciones/[id] y /reservas/[token] (invitado con token). En
// /reservaciones/[id] con adminReadOnly el staff ve historial y estado
// sin poder crear ni cancelar transferencias.
//
// Estados que muestra:
//  - Sin transferencia: formulario para crear una.
//  - Pending: tarjeta con detalles + botón "cancelar".
//  - Auto-credited / Pending-claim / Claimed: tarjeta de
//    confirmación (solo lectura).
//  - Cancelled / Reverted: oculto (se asume que el cliente
//    podría volver a regalar si la reserva está confirmada).
// =====================================================

type TransferStatus =
  | "pending"
  | "auto_credited"
  | "pending_claim"
  | "claimed"
  | "cancelled"
  | "reverted";

interface ActiveTransfer {
  id: string;
  status: TransferStatus;
  transferredPoints: number;
  toEmail: string;
  createdAt: string;
  materializedAt: string | null;
  claimedAt: string | null;
}

export interface TransferHistoryItem {
  id: string;
  status: TransferStatus;
  transferredPoints: number;
  toEmail: string;
  createdAt: string;
  materializedAt: string | null;
  claimedAt: string | null;
  cancelledAt: string | null;
  revertedAt: string | null;
}

interface ApiResponse {
  success: boolean;
  earnedPoints: number;
  activeTransfer: ActiveTransfer | null;
  history?: TransferHistoryItem[];
  error?: string;
}

interface Props {
  reservationId: number;
  /** Token JWT de invitado, si la reserva se gestiona como guest. */
  guestToken?: string | null;
  /**
   * Variante visual:
   *  - "card": tarjeta independiente (default).
   *  - "compact": embebido en otra sección.
   *  - "embedded": franja inferior de la tarjeta de detalle (ancho completo, borde ámbar).
   */
  variant?: "card" | "compact" | "embedded";
  /**
   * Vista de administración: solo lectura + historial; sin crear ni
   * cancelar transferencias en nombre del cliente.
   */
  adminReadOnly?: boolean;
}

const BTN_PRIMARY =
  "w-full cursor-pointer rounded-lg bg-[#103948] py-3 px-4 font-medium text-white transition-colors hover:bg-[#0d2d38] disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "w-full cursor-pointer rounded-lg border border-zinc-300 bg-white py-3 px-4 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_DANGER_SOFT =
  "w-full cursor-pointer rounded-lg border border-red-300 bg-white py-3 px-4 font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_LABEL: Record<
  TransferStatus,
  { title: string; description: string; tone: "info" | "ok" | "warn" }
> = {
  pending: {
    title: "Transferencia agendada",
    description:
      "Tus Monedas Chuy quedaron reservadas para tu fotógrafo y se le enviarán cuando pase la fecha de tu sesión. Mientras tanto no aparecerán en tu saldo, pero puedes cancelar y recuperarlas si cambias de opinión.",
    tone: "info",
  },
  auto_credited: {
    title: "Monedas Chuy entregadas",
    description: "El fotógrafo ya recibió tus Monedas Chuy en su cuenta.",
    tone: "ok",
  },
  pending_claim: {
    title: "Esperando reclamo",
    description:
      "Le enviamos un correo al fotógrafo con un enlace para reclamarlas.",
    tone: "info",
  },
  claimed: {
    title: "Monedas Chuy reclamadas",
    description: "El fotógrafo ya reclamó tus Monedas Chuy.",
    tone: "ok",
  },
  cancelled: {
    title: "Transferencia cancelada",
    description: "",
    tone: "warn",
  },
  reverted: {
    title: "Transferencia revertida",
    description: "",
    tone: "warn",
  },
};

/** Textos en tercera persona para vista de administración. */
const ADMIN_STATUS_LABEL: Record<
  TransferStatus,
  { title: string; description: string }
> = {
  pending: {
    title: "Transferencia agendada (cliente)",
    description:
      "Las Monedas quedaron reservadas; se enviarán al fotógrafo cuando pase la fecha de la sesión.",
  },
  auto_credited: {
    title: "Monedas entregadas al fotógrafo",
    description:
      "Ya se acreditaron en la cuenta del correo destino (tenía cuenta).",
  },
  pending_claim: {
    title: "Esperando reclamo del fotógrafo",
    description:
      "Se envió correo con enlace; el destinatario aún debe registrarse o reclamar.",
  },
  claimed: {
    title: "Monedas reclamadas",
    description: "El fotógrafo reclamó las Monedas con el enlace enviado.",
  },
  cancelled: {
    title: "Transferencia cancelada",
    description: "",
  },
  reverted: {
    title: "Transferencia revertida",
    description: "",
  },
};

/** Texto de auditoría por fila de `benefit_transfers` (orden API: más reciente primero). */
function transferHistorySentence(h: TransferHistoryItem): string {
  const pts = h.transferredPoints;
  const coins = `${pts} ${pluralizeLoyalty(pts)}`;
  const dest = h.toEmail;
  const whenIso =
    h.claimedAt ??
    h.materializedAt ??
    h.cancelledAt ??
    h.revertedAt ??
    h.createdAt;
  const when = whenIso ? formatDisplayDateTimeCompact(whenIso) : null;

  const prefix = when ? `${when} — ` : "";

  switch (h.status) {
    case "auto_credited":
      return `${prefix}Se acreditaron ${coins} a ${dest}.`;
    case "claimed":
      return `${prefix}El fotógrafo reclamó ${coins} en ${dest}.`;
    case "pending_claim":
      return `${prefix}Enlace de reclamo enviado: ${coins} → ${dest}.`;
    case "pending":
      return `${prefix}Transferencia agendada: ${coins} → ${dest}.`;
    case "cancelled":
      return `${prefix}Transferencia cancelada (${coins} → ${dest}).`;
    case "reverted":
      return `${prefix}Transferencia revertida (${coins} → ${dest}).`;
    default:
      return `${prefix}${coins} → ${dest} (${h.status}).`;
  }
}

export default function TransferMonedasPanel({
  reservationId,
  guestToken,
  variant = "card",
  adminReadOnly = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [active, setActive] = useState<ActiveTransfer | null>(null);
  const [history, setHistory] = useState<TransferHistoryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [showForm, setShowForm] = useState(false);

  const buildUrl = useCallback(
    (extraQuery?: string) => {
      const base = `/api/reservations/${reservationId}/transfer-monedas`;
      const qs = guestToken
        ? `token=${encodeURIComponent(guestToken)}`
        : null;
      const all = [qs, extraQuery].filter(Boolean).join("&");
      return all ? `${base}?${all}` : base;
    },
    [reservationId, guestToken],
  );

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(buildUrl(), { method: "GET" });
      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        // 400 silencioso: la reserva no acumuló Monedas (invitado).
        // No mostramos error al usuario, simplemente ocultamos el panel.
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          setEarnedPoints(0);
          setActive(null);
          setHistory([]);
          return;
        }
        setError(json.error || "No se pudo cargar la transferencia.");
        return;
      }
      setEarnedPoints(json.earnedPoints || 0);
      setActive(json.activeTransfer);
      setHistory(Array.isArray(json.history) ? json.history : []);
    } catch (e) {
      console.error("Error cargando transferencia:", e);
      setError("No se pudo cargar la transferencia.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const email = toEmail.trim().toLowerCase();
    if (!email) {
      setError("Escribe el correo del fotógrafo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: email,
          token: guestToken ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo crear la transferencia.");
        return;
      }
      setShowForm(false);
      setToEmail("");
      await load({ silent: true });
    } catch (err) {
      console.error("Error creando transferencia:", err);
      setError("No se pudo crear la transferencia.");
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = async () => {
    if (cancelling) return;
    if (!active || active.status !== "pending") return;
    if (
      !confirm(
        "¿Cancelar la transferencia? Las Monedas Chuy regresarán a tu saldo.",
      )
    ) {
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: guestToken ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo cancelar la transferencia.");
        return;
      }
      await load({ silent: true });
    } catch (err) {
      console.error("Error cancelando transferencia:", err);
      setError("No se pudo cancelar la transferencia.");
    } finally {
      setCancelling(false);
    }
  };

  // Durante el loading inicial NO renderizamos nada para evitar un flash
  // visual: la mayoría de las reservas (invitados, sin Monedas) no muestra
  // el panel al final, así que mostrar un placeholder solo causa parpadeo.
  // Si la reserva no acumuló Monedas (earnedPoints=0) y no hay transferencia
  // activa, también permanecemos ocultos. En vista admin solo mostramos
  // si hay transferencia activa o historial (no el formulario de regalo).
  if (loading) return null;
  if (adminReadOnly) {
    if (!active && history.length === 0) return null;
  } else if (!active && earnedPoints <= 0) {
    return null;
  }

  const labelFor = (status: TransferStatus) =>
    adminReadOnly ? ADMIN_STATUS_LABEL[status] : STATUS_LABEL[status];

  // No repetir en el historial la misma fila que ya mostramos arriba como "activa".
  const historyRows =
    active && history.some((h) => h.id === active.id)
      ? history.filter((h) => h.id !== active.id)
      : history;

  return (
    <Wrapper variant={variant}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <span className="text-lg" aria-hidden>
            🎁
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900">
            {active
              ? labelFor(active.status).title
              : adminReadOnly
                ? "Monedas Chuy — transferencias"
                : "Regálale tus Monedas Chuy a tu fotógrafo"}
          </h3>
          <p className="mt-0.5 text-sm leading-snug text-zinc-600">
            {active ? (
              labelFor(active.status).description
            ) : adminReadOnly ? (
              "Registro de transferencias de Monedas Chuy en esta reserva."
            ) : (
              `Tienes ${earnedPoints} ${pluralizeLoyalty(
                earnedPoints,
              )} de esta reserva. Si quieres, podemos enviárselas al fotógrafo después de tu sesión.`
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {active ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">Monedas Chuy</span>
            <span className="font-semibold text-zinc-900">
              {active.transferredPoints}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-4 border-t border-zinc-100 pt-2">
            <span className="text-zinc-500">Para</span>
            <span className="text-right font-medium text-zinc-900 break-all">
              {active.toEmail}
            </span>
          </div>
        </div>
      ) : null}

      {active?.status === "pending" && !adminReadOnly && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className={BTN_DANGER_SOFT}
            aria-busy={cancelling}
            aria-describedby={
              cancelling ? undefined : "transfer-cancel-hint"
            }
          >
            {cancelling ? "Cancelando transferencia…" : "Cancelar transferencia"}
          </button>
          {!cancelling && (
            <p
              id="transfer-cancel-hint"
              className="mt-2 text-xs leading-snug text-zinc-600"
            >
              Las Monedas Chuy volverán a tu saldo.
            </p>
          )}
        </div>
      )}

      {!active && showForm && !adminReadOnly ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-2.5">
          <div>
            <label
              htmlFor="transfer-email"
              className="block text-sm font-medium text-zinc-700"
            >
              Correo del fotógrafo
              <span className="text-red-600">*</span>
            </label>
            <input
              id="transfer-email"
              type="email"
              required
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="fotografo@ejemplo.com"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
              autoComplete="email"
              maxLength={254}
            />
          </div>
          <p className="text-xs leading-snug text-zinc-600">
            Se reservarán <strong>{earnedPoints}</strong>{" "}
            {pluralizeLoyalty(earnedPoints)} para tu fotógrafo y dejarán de
            aparecer en tu saldo. Se le enviarán cuando pase la fecha de tu
            sesión. Puedes cancelar antes si cambias de opinión y volverán a
            tu saldo.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={submitting}
              className={BTN_PRIMARY}
            >
              {submitting ? "Enviando…" : "Confirmar transferencia"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              disabled={submitting}
              className={BTN_SECONDARY}
            >
              Cerrar
            </button>
          </div>
        </form>
      ) : !active && !adminReadOnly ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={BTN_PRIMARY}
          >
            Regalar mis {earnedPoints} {pluralizeLoyalty(earnedPoints)}
          </button>
        </div>
      ) : null}

      {historyRows.length > 0 && (
        <div className="mt-4 border-t border-amber-200/80 pt-3">
          <h4 className="text-sm font-semibold text-zinc-800">
            Historial de transferencias
          </h4>
          <p className="mt-1 text-xs leading-snug text-zinc-600">
            Registro de intentos y entregas de Monedas Chuy ligadas a esta
            reserva (más reciente primero).
          </p>
          <ul className="mt-3 list-none space-y-2 text-sm text-zinc-700">
            {historyRows.map((h) => (
              <li
                key={h.id}
                className="rounded-md border border-zinc-200 bg-white/80 px-3 py-2"
              >
                {transferHistorySentence(h)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Wrapper>
  );
}

function Wrapper({
  variant,
  children,
}: {
  variant: "card" | "compact" | "embedded";
  children: React.ReactNode;
}) {
  if (variant === "compact") {
    return <div className="rounded-md bg-amber-50 p-4">{children}</div>;
  }
  if (variant === "embedded") {
    return (
      <div className="border-t border-amber-200/70 bg-amber-50 px-6 py-4 sm:px-8">
        {children}
      </div>
    );
  }
  return (
    <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-6">
      {children}
    </section>
  );
}
