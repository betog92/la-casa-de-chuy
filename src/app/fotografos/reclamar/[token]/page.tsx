"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { pluralizeLoyalty } from "@/utils/loyalty";

// =====================================================
// /fotografos/reclamar/[token]
// =====================================================
// Página pública: el fotógrafo entra desde un magic link
// (ver /api/cron/materialize-transfers) y reclama las
// Monedas Chuy que un cliente le regaló.
//
// Flujo:
//  1. Cargamos info pública del token.
//     - 404: token inválido / inexistente.
//     - status=pending_claim: lista para reclamo.
//     - status=claimed: aviso "ya reclamadas".
//  2. Si NO está logueado: CTA para iniciar sesión o
//     registrarse, prefil con el email destinatario.
//  3. Si está logueado:
//     - Si su email coincide con to_email: botón "Reclamar".
//     - Si no coincide: aviso para iniciar sesión con el
//       email correcto.
// =====================================================

interface TransferInfo {
  status:
    | "pending"
    | "auto_credited"
    | "pending_claim"
    | "claimed"
    | "cancelled"
    | "reverted";
  transferredPoints: number;
  toEmail: string;
  toStudioName: string | null;
  fromName: string | null;
  materializedAt: string | null;
  claimedAt: string | null;
}

export default function ReclamarMonedasPage() {
  const params = useParams();
  const token = (params.token as string) || "";
  const { user, loading: authLoading } = useAuth();

  const [info, setInfo] = useState<TransferInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<{
    points: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fotografos/reclamar/${token}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo cargar la información.");
        return;
      }
      setInfo(json.transfer as TransferInfo);
    } catch (e) {
      console.error("Error cargando reclamo:", e);
      setError("No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void load();
    else {
      setLoading(false);
      setError("Token inválido.");
    }
  }, [token, load]);

  const onClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`/api/fotografos/reclamar/${token}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudieron reclamar las Monedas.");
        return;
      }
      setClaimSuccess({ points: json.pointsCredited || 0 });
      // Refrescar info para mostrar estado claimed
      await load();
    } catch (e) {
      console.error("Error reclamando:", e);
      setError("No se pudieron reclamar las Monedas.");
    } finally {
      setClaiming(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
        <p className="text-zinc-600">Cargando información…</p>
      </div>
    );
  }

  // Caso: error de carga inicial
  if (!info) {
    return (
      <Container>
        <Card>
          <h1 className="text-2xl font-bold text-zinc-900">
            No se encontró la transferencia
          </h1>
          <p className="mt-2 text-zinc-600">
            {error ||
              "El enlace puede haber expirado o ser inválido. Si crees que es un error, contáctanos."}
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              Volver al inicio
            </Link>
          </div>
        </Card>
      </Container>
    );
  }

  const points = info.transferredPoints || 0;
  const pointsLabel = `${points} ${pluralizeLoyalty(points)}`;
  const fromLabel = info.fromName?.trim() || "Un cliente";
  const studioLabel = info.toStudioName?.trim() || null;

  // Caso: ya reclamada / auto-acreditada
  if (info.status === "claimed" || info.status === "auto_credited") {
    return (
      <Container>
        <Card>
          <div className="text-center">
            <div className="flex justify-center">
              <SuccessIcon />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-zinc-900">
              ¡Estas Monedas Chuy ya están en una cuenta!
            </h1>
            <p className="mt-2 text-zinc-600">
              La transferencia de <strong>{pointsLabel}</strong> de {fromLabel}{" "}
              ya fue acreditada
              {info.status === "auto_credited" ? " automáticamente" : ""}. Si tú
              la reclamaste, ya están disponibles en tu cuenta.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/account"
                className="rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
              >
                Ver mi cuenta
              </Link>
            </div>
          </div>
        </Card>
      </Container>
    );
  }

  // Caso: cancelled / reverted
  if (info.status === "cancelled" || info.status === "reverted") {
    return (
      <Container>
        <Card>
          <h1 className="text-2xl font-bold text-zinc-900">
            Esta transferencia ya no está disponible
          </h1>
          <p className="mt-2 text-zinc-600">
            El cliente canceló la transferencia o la reserva ya no aplica. Esta
            transferencia quedó cerrada; ya no puedes reclamar estas Monedas
            Chuy desde este enlace.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              Volver al inicio
            </Link>
          </div>
        </Card>
      </Container>
    );
  }

  // Caso: pending — aún no se materializa (sesión futura)
  if (info.status === "pending") {
    return (
      <Container>
        <Card>
          <h1 className="text-2xl font-bold text-zinc-900">
            Aún no puedes reclamar
          </h1>
          <p className="mt-2 text-zinc-600">
            Este enlace se activa cuando pase la fecha de la sesión del cliente.
            Espera el correo de confirmación para reclamar las Monedas.
          </p>
        </Card>
      </Container>
    );
  }

  // Caso: pending_claim — lista para reclamar
  const userEmail = user?.email?.toLowerCase().trim() || "";
  const expectedEmail = info.toEmail.toLowerCase().trim();
  const emailMatches = userEmail && userEmail === expectedEmail;

  return (
    <Container>
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <span className="text-2xl" aria-hidden>
              🎁
            </span>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900">
              ¡Te regalaron {pointsLabel}!
            </h1>
            <p className="mt-2 text-zinc-600">
              <strong>{fromLabel}</strong> te regaló{" "}
              <strong>{pointsLabel}</strong> tras su sesión en La Casa de Chuy
              el Rico.
              {studioLabel && (
                <>
                  {" "}
                  El cliente registró tu estudio como{" "}
                  <strong>{studioLabel}</strong>.
                </>
              )}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Cada Moneda Chuy vale $1 MXN para descuentos en futuras reservas.
              No caducan.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {claimSuccess ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
            <h2 className="text-lg font-semibold text-green-900">
              ¡Reclamaste tus Monedas!
            </h2>
            <p className="mt-1 text-sm text-green-800">
              Acreditamos {claimSuccess.points}{" "}
              {pluralizeLoyalty(claimSuccess.points)} en tu cuenta. Puedes
              usarlas en cualquier reserva futura.
            </p>
            <div className="mt-4">
              <Link
                href="/account"
                className="inline-block rounded-lg bg-[#103948] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0d2d38]"
              >
                Ver mi cuenta
              </Link>
            </div>
          </div>
        ) : !user ? (
          // No logueado: CTAs
          <div className="mt-6 space-y-3">
            <p className="text-sm text-zinc-700">
              Para reclamarlas, inicia sesión o crea una cuenta con el correo:
            </p>
            <p className="rounded bg-zinc-100 px-3 py-2 font-mono text-sm text-zinc-800">
              {info.toEmail}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={`/auth/login?redirect=${encodeURIComponent(
                  `/fotografos/reclamar/${token}`,
                )}`}
                className="rounded-lg bg-[#103948] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0d2d38]"
              >
                Iniciar sesión
              </Link>
              <Link
                href={`/auth/register?email=${encodeURIComponent(
                  info.toEmail,
                )}&redirect=${encodeURIComponent(
                  `/fotografos/reclamar/${token}`,
                )}`}
                className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Crear cuenta
              </Link>
            </div>
          </div>
        ) : !emailMatches ? (
          // Logueado pero email no coincide
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Iniciaste sesión con <strong>{user.email}</strong>, pero estas
              Monedas se regalaron al correo:
            </p>
            <p className="mt-2 rounded bg-white px-3 py-2 font-mono text-sm text-zinc-800">
              {info.toEmail}
            </p>
            <p className="mt-3 text-sm text-amber-900">
              Cierra sesión y vuelve a entrar con el correo correcto para
              reclamarlas.
            </p>
          </div>
        ) : (
          // Logueado con el email correcto: botón de reclamo
          <div className="mt-6">
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="rounded-lg bg-[#103948] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#0d2d38] disabled:opacity-50"
            >
              {claiming ? "Reclamando…" : `Reclamar ${pointsLabel}`}
            </button>
            <p className="mt-2 text-xs text-zinc-500">
              Las Monedas se acreditarán en la cuenta de {user.email}.
            </p>
          </div>
        )}
      </Card>
    </Container>
  );
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white py-8 sm:py-16">
      <div className="container mx-auto max-w-2xl px-4">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      {children}
    </div>
  );
}

function SuccessIcon() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
      <svg
        className="h-7 w-7 text-green-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    </div>
  );
}
